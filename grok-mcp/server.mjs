#!/usr/bin/env node
/**
 * server.mjs — MCP server (stdio, JSON-RPC 2.0, one JSON message per line) exposing Grok:
 *
 *   grok_models         list the model ids the xAI key can use
 *   grok_chat           one-shot question to Grok
 *   grok_agent_start    start a sandboxed Grok worker on a brief (returns a run id at once)
 *   grok_agent_wait     wait up to N seconds for a run, then return its status / report
 *   grok_agent_status   status, recent activity and (when finished) the report of a run
 *   grok_agent_cancel   stop a run
 *
 * Two backends, chosen automatically (GROK_BACKEND=cli|api forces one):
 *   cli — xAI's own `grok` command-line agent signed in with a Grok account (subscription, no API
 *         credits). A worker runs in a throw-away copy of the project; only owned files come back.
 *   api — the metered xAI API with XAI_API_KEY. A worker acts through this server's own file tools.
 *
 * Zero dependencies. Register it in a project's .mcp.json:
 *   { "mcpServers": { "grok": { "command": "node", "args": ["grok-mcp/server.mjs"] } } }
 * Worker roots must lie inside the directory the server was started in (GROK_MCP_ROOT overrides).
 * Never write to stdout except protocol messages; diagnostics go to stderr.
 */
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { listModels, chat, runAgent } from './grok.mjs';
import { backendName, listModelsCli, chatCli, runAgentCli } from './subscription.mjs';

const SERVER = { name: 'grok', version: '1.0.0' };
const BASE_ROOT = fs.realpathSync(path.resolve(process.env.GROK_MCP_ROOT || process.cwd()));
const runs = new Map();

const str = { type: 'string' };
const strList = { type: 'array', items: { type: 'string' } };
const TOOLS = [
  { name: 'grok_models', description: 'List the Grok model ids available to the configured xAI API key.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'grok_chat',
    description: 'Ask Grok one question and get its answer (no tools, no file access).',
    inputSchema: { type: 'object', properties: { prompt: str, system: str, model: str, temperature: { type: 'number' }, max_tokens: { type: 'integer' } }, required: ['prompt'] },
  },
  {
    name: 'grok_agent_start',
    description:
      'Start a Grok worker agent on a written brief. Only the paths in `own` (a trailing "/" means a folder) can be changed in the project. With the subscription backend the worker runs in a sandboxed throw-away copy of `root` holding tracked and unignored files only (so git-ignored material such as private photos or .env files is never in it) and only owned files are copied back; with the API backend it reads inside `root` (not .git, photos/, secrets) through this server, may run only the node scripts in `allow_run`, and views images only if `allow_images` is true. Everything the worker reads is sent to xAI. Returns a run_id immediately; follow with grok_agent_wait or grok_agent_status.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: { ...str, description: 'Complete, self-contained task description for the worker.' },
        root: { ...str, description: 'Project root, relative to the server directory. Default ".".' },
        own: { ...strList, description: 'Files/folders (relative to root) the worker may write.' },
        attach: { ...strList, description: 'Extra reference files (any path) to hand the worker alongside the brief (subscription backend).' },
        include: { ...strList, description: 'Git-ignored files/folders (relative to root) the worker may have in its copy anyway (subscription backend).' },
        deny: { ...strList, description: 'Extra paths the worker must not be able to read (subscription backend).' },
        scratch: { ...str, description: 'Folder for the worker\'s scratch files and screenshots (API backend; the subscription backend uses ./.scratch in its copy).' },
        allow_run: { ...strList, description: 'Node scripts (relative to root) the worker may run, e.g. a test or screenshot tool.' },
        allow_images: { type: 'boolean', description: 'Let the worker look at images in its scratch folder (they are sent to xAI).' },
        model: str,
        max_steps: { type: 'integer', minimum: 1, maximum: 400 },
      },
      required: ['brief'],
    },
  },
  { name: 'grok_agent_wait', description: 'Wait up to timeout_s (default 120, max 240) for a run to finish; returns its status and, when finished, the report.', inputSchema: { type: 'object', properties: { run_id: str, timeout_s: { type: 'integer', minimum: 1, maximum: 240 } }, required: ['run_id'] } },
  { name: 'grok_agent_status', description: 'Status of a run: state, step count, token usage, files written, the last few actions and (when finished) the report.', inputSchema: { type: 'object', properties: { run_id: str }, required: ['run_id'] } },
  { name: 'grok_agent_cancel', description: 'Stop a running Grok worker after its current step.', inputSchema: { type: 'object', properties: { run_id: str }, required: ['run_id'] } },
];

function resolveRoot(root = '.') {
  const abs = path.resolve(BASE_ROOT, root);
  const real = fs.realpathSync(abs);
  if (real !== BASE_ROOT && !real.startsWith(BASE_ROOT + path.sep)) throw new Error(`root must be inside ${BASE_ROOT}`);
  return real;
}

function describe(run) {
  const lines = [
    `run ${run.id}: ${run.state}${run.result?.stopped ? ` (${run.result.stopped})` : ''}`,
    `model ${run.model || '(resolving)'} · steps ${run.steps} · tokens in ${run.usage.prompt} / out ${run.usage.completion} · ${Math.round((Date.now() - run.started) / 1000)} s`,
    `files written: ${[...run.files].join(', ') || '(none yet)'}`,
  ];
  if (run.result?.ignoredChanges?.length) lines.push(`changed but not owned (discarded): ${run.result.ignoredChanges.join(', ')}`);
  if (run.result?.costEstimateUsd != null) lines.push(`cost estimate reported by the CLI: $${run.result.costEstimateUsd} (covered by the plan when signed in with a subscription)`);
  if (run.result?.workDir) lines.push(`work copy kept at: ${run.result.workDir}`);
  if (run.state === 'running') lines.push('recent activity:', ...run.events.slice(-8).map((e) => `  ${e}`));
  if (run.error) lines.push(`error: ${run.error}`);
  if (run.result?.report) lines.push('', '--- worker report ---', run.result.report);
  return lines.join('\n');
}

const handlers = {
  async grok_models() {
    const cli = backendName() === 'cli';
    return `${(await (cli ? listModelsCli() : listModels())).join('\n')}\n\n[backend: ${cli ? 'grok CLI (subscription)' : 'xAI API key'}]`;
  },
  async grok_chat({ prompt, system, model, temperature, max_tokens }) {
    const res = backendName() === 'cli' ? await chatCli({ prompt, system, model }) : await chat({ prompt, system, model, temperature, maxTokens: max_tokens });
    return `${res.text}\n\n[model ${res.model}${res.usage ? ` · tokens in ${res.usage.prompt_tokens} / out ${res.usage.completion_tokens}` : ''}]`;
  },
  async grok_agent_start({ brief, root, own = [], attach = [], include = [], deny = [], scratch, allow_run = [], allow_images = false, model, max_steps }) {
    const id = crypto.randomBytes(4).toString('hex');
    const run = { id, state: 'running', started: Date.now(), steps: 0, usage: { prompt: 0, completion: 0 }, files: new Set(), events: [], cancelled: false, model, result: null, error: null };
    runs.set(id, run);
    const onEvent = (e) => {
      if (e.type === 'tool') {
        run.steps = e.step + 1;
        run.events.push(`${e.name} ${e.ok ? JSON.stringify(e.args) : `FAILED: ${e.error}`}`.slice(0, 300));
        if (e.ok && (e.name === 'write_file' || e.name === 'edit_file') && e.args?.path) run.files.add(e.args.path);
      } else if (e.type === 'say') run.events.push(`says: ${e.text.replace(/\s+/g, ' ').slice(0, 200)}`);
      else if (e.type === 'done') Object.assign(run.usage, e.usage);
      if (run.events.length > 200) run.events.splice(0, 100);
    };
    const common = { brief, root: resolveRoot(root), own, model, maxSteps: max_steps, onEvent, isCancelled: () => run.cancelled };
    run.promise = (backendName() === 'cli'
      ? runAgentCli({ ...common, attach, include, deny })
      : runAgent({ ...common, scratch: scratch ? path.resolve(BASE_ROOT, scratch) : null, allowRun: allow_run, allowImages: allow_images }))
      .then((result) => { run.result = result; run.model = result.model; run.steps = result.steps; run.usage = result.usage; result.filesWritten.forEach((f) => run.files.add(f)); run.state = result.ok ? 'finished' : 'stopped'; })
      .catch((err) => { run.error = err.message; run.state = 'failed'; });
    return `started run ${id}. Call grok_agent_wait or grok_agent_status with run_id "${id}".`;
  },
  async grok_agent_wait({ run_id, timeout_s = 120 }) {
    const run = runs.get(run_id);
    if (!run) throw new Error(`no run "${run_id}"`);
    await Promise.race([run.promise, new Promise((r) => setTimeout(r, Math.min(240, timeout_s) * 1000))]);
    return describe(run);
  },
  async grok_agent_status({ run_id }) {
    const run = runs.get(run_id);
    if (!run) throw new Error(`no run "${run_id}"`);
    return describe(run);
  },
  async grok_agent_cancel({ run_id }) {
    const run = runs.get(run_id);
    if (!run) throw new Error(`no run "${run_id}"`);
    run.cancelled = true;
    return `run ${run_id} will stop after its current step`;
  },
};

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handle(msg) {
  const { id, method, params } = msg;
  const reply = (result) => id !== undefined && send({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } });
  switch (method) {
    case 'initialize':
      return reply({ protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: SERVER, instructions: 'Grok (xAI) bridge: grok_chat for one-shot questions; grok_agent_start + grok_agent_wait to hand a written brief to a sandboxed Grok worker. Whatever a worker reads is sent to xAI.' });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const handler = handlers[params?.name];
      if (!handler) return fail(-32602, `unknown tool "${params?.name}"`);
      try {
        return reply({ content: [{ type: 'text', text: String(await handler(params.arguments || {})) }] });
      } catch (err) {
        return reply({ content: [{ type: 'text', text: err.message }], isError: true });
      }
    }
    default:
      if (id !== undefined) fail(-32601, `method not found: ${method}`); // notifications are ignored
  }
}

readline.createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); }
  handle(msg).catch((err) => process.stderr.write(`grok-mcp: ${err.stack || err}\n`));
});
process.stderr.write(`grok-mcp: ready (root ${BASE_ROOT})\n`);
