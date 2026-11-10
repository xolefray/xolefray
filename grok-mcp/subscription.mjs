/**
 * subscription.mjs — run Grok through xAI's own command-line agent (Grok Build, the `grok` binary)
 * signed in with a Grok account, so work is covered by a Grok subscription instead of metered API
 * credits. Needs: the CLI installed (https://docs.x.ai/build/overview), `grok login` done once
 * (`grok login --device-auth` on a machine without a browser) and, on Linux, bubblewrap for the
 * sandbox deny list.
 *
 * A worker never touches the real project. runAgentCli():
 *   1. copies the project root into a throw-away WORK COPY — git-tracked and unignored files only,
 *      so ignored material (private photos, .env files, build output) is never in it unless you
 *      name it in `include`;
 *   2. starts `grok` there under a sandbox profile that may write only inside the copy and is
 *      denied the real project, credentials and any extra paths you name;
 *   3. when Grok finishes, copies back ONLY the files matching `own` and reports everything else
 *      it changed as ignored.
 * Whatever Grok reads in the copy is sent to xAI under the signed-in account.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const PROFILE = 'grokmcp';
const SKIP_DIRS = new Set(['.git', 'node_modules', '.grok', '.scratch', '.brief']);

/** Path of the signed-in `grok` CLI, or null when it is missing or not logged in. */
export function cliReady() {
  const home = os.homedir();
  const candidates = [process.env.GROK_CLI, path.join(home, '.grok', 'bin', 'grok'), ...(process.env.PATH || '').split(path.delimiter).map((d) => path.join(d, 'grok'))].filter(Boolean);
  const bin = candidates.find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
  return bin && (process.env.GROK_CLI || fs.existsSync(path.join(home, '.grok', 'auth.json'))) ? bin : null;
}

/** 'cli' (subscription) or 'api' (key). GROK_BACKEND forces one; an API key in the environment prefers 'api'. */
export function backendName() {
  const forced = process.env.GROK_BACKEND;
  if (forced === 'cli' || forced === 'api') return forced;
  if (process.env.XAI_API_KEY || process.env.GROK_API_KEY) return 'api';
  return cliReady() ? 'cli' : 'api';
}

function run(bin, args, { cwd, timeoutMs = 3600000, isCancelled = () => false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => { err += c; if (err.length > 200000) err = err.slice(-100000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    const poll = setInterval(() => isCancelled() && child.kill('SIGTERM'), 1000);
    const done = (code) => { clearTimeout(timer); clearInterval(poll); resolve({ code, out: strip(out), err: strip(err) }); };
    child.on('close', done);
    child.on('error', (e) => { err += e.message; done(-1); });
  });
}
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

/** The last complete JSON object in a CLI's output (it may print notices before it). */
function parseResult(out) {
  for (let i = out.lastIndexOf('\n{') + 1 || out.indexOf('{'); i >= 0; i = out.lastIndexOf('{', i - 1)) {
    try { return JSON.parse(out.slice(i)); } catch { if (i === 0) break; }
  }
  return null;
}

export async function listModelsCli() {
  const bin = cliReady();
  if (!bin) throw new Error('the grok CLI is not installed or not signed in (run `grok login`)');
  const { out, err, code } = await run(bin, ['models'], { timeoutMs: 60000 });
  const ids = [...out.matchAll(/^\s*[*-]\s+([\w.-]+)/gm)].map((m) => m[1]);
  if (!ids.length) throw new Error(`grok models failed (exit ${code}): ${(err || out).slice(0, 300)}`);
  return ids;
}

export async function chatCli({ prompt, system, model } = {}) {
  const bin = cliReady();
  if (!bin) throw new Error('the grok CLI is not installed or not signed in (run `grok login`)');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'grok-mcp-chat-'));
  try {
    const args = ['-p', system ? `${system}\n\n${prompt}` : String(prompt ?? ''), '--output-format', 'json', '--no-auto-update', '--disable-web-search', '--sandbox', 'read-only', '--max-turns', '1'];
    if (model) args.push('-m', model);
    const { out, err, code } = await run(bin, args, { cwd: dir, timeoutMs: 600000 });
    const res = parseResult(out);
    if (!res?.text) throw new Error(`grok exited ${code}: ${(err || out).slice(0, 400)}`);
    return { model: Object.keys(res.modelUsage || {})[0] || model || 'default', text: res.text, usage: res.usage ? { prompt_tokens: res.usage.input_tokens, completion_tokens: res.usage.output_tokens } : null };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/** Project files to give a worker: tracked + unignored when `root` is in a git repo, else a plain walk. */
function projectFiles(root) {
  try {
    const out = execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard', '-z'], { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.toString('utf8').split('\0').filter(Boolean);
  } catch {
    const files = [];
    (function walk(dir) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name) || e.name === 'photos' || e.name.startsWith('.env')) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs); else if (e.isFile()) files.push(path.relative(root, abs));
      }
    })(root);
    return files;
  }
}

function same(a, b) {
  try { const x = fs.readFileSync(a); const y = fs.readFileSync(b); return x.length === y.length && x.equals(y); } catch { return false; }
}

const PREAMBLE = (own, attach) => `You are one worker on a shared codebase; an orchestrator wrote this brief and will review your result.
You are working in a private COPY of the project (your current directory). Rules:
- Only these paths are yours and will be kept: ${own.length ? own.join(', ') : '(none: this is a read-only task)'}. Changes to any other file are thrown away, so do not rely on them.
- Scratch files, screenshots and notes go in ./.scratch/ (it is discarded afterwards).
- Use relative paths. Files outside this directory are off limits; do not try to reach them. Do not use git or the network.${attach.length ? `\n- Reference documents for this task are in ./.brief/: ${attach.join(', ')} — read them first.` : ''}
- Verify your work by running what the brief names, and look at what it produces. Do not invent results; if you could not verify something, say so.
- Finish with a report of at most 250 words: files written with line counts, what you verified and how, known issues, requests for the orchestrator.

# Brief

`;

/**
 * Run a Grok worker on a subscription. Same result shape as grok.mjs runAgent, plus
 * `ignoredChanges` (files it changed that it does not own), `costEstimateUsd` and `workDir`.
 */
export async function runAgentCli({ brief, root, own = [], attach = [], include = [], deny = [], model, maxSteps = 120, timeoutMs = 3600000, keepWorkDir = true, onEvent = () => {}, isCancelled = () => false } = {}) {
  const bin = cliReady();
  if (!bin) throw new Error('the grok CLI is not installed or not signed in (run `grok login`)');
  if (!brief) throw new Error('runAgentCli: brief is required');
  root = await fsp.realpath(path.resolve(root || '.'));
  const work = await fsp.mkdtemp(path.join(os.tmpdir(), 'grok-mcp-work-'));

  // 1. work copy
  const files = projectFiles(root);
  for (const rel of files) {
    const from = path.join(root, rel);
    let stat;
    try { stat = fs.lstatSync(from); } catch { continue; }
    if (!stat.isFile()) continue;
    const to = path.join(work, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  // `include`: git-ignored files or folders the worker is explicitly allowed to have, at their usual place.
  for (const inc of include) {
    const from = path.resolve(root, inc);
    if (!from.startsWith(root + path.sep) || !fs.existsSync(from)) continue;
    fs.cpSync(from, path.join(work, path.relative(root, from)), { recursive: true });
  }
  const attached = [];
  if (attach.length) {
    fs.mkdirSync(path.join(work, '.brief'), { recursive: true });
    for (const file of attach) { const name = path.basename(file); fs.copyFileSync(path.resolve(file), path.join(work, '.brief', name)); attached.push(name); }
  }
  fs.mkdirSync(path.join(work, '.scratch'), { recursive: true });

  // 2. sandbox: writes stay in the copy; the real project and credentials are unreadable
  let repoTop = root;
  try { repoTop = execFileSync('git', ['-C', root, 'rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || root; } catch { /* not a repo */ }
  const home = os.homedir();
  const denied = [...new Set([repoTop, root, path.join(home, '.ssh'), path.join(home, '.claude'), path.join(home, '.ccr'), path.join(home, '.aws'), path.join(home, '.config', 'gh'), '**/.env', '**/*.pem',
    ...(process.env.GROK_MCP_DENY || '').split(path.delimiter).filter(Boolean), ...deny.map((d) => (d.includes('*') ? d : path.resolve(d)))])];
  // A path inside another denied folder is already covered (and nested entries break the sandbox mount).
  const covered = (p) => !p.includes('*') && denied.some((q) => q !== p && !q.includes('*') && p.startsWith(q + path.sep));
  for (let i = denied.length - 1; i >= 0; i--) if (covered(denied[i])) denied.splice(i, 1);
  fs.mkdirSync(path.join(work, '.grok'), { recursive: true });
  fs.writeFileSync(path.join(work, '.grok', 'sandbox.toml'), `[profiles.${PROFILE}]\nextends = "workspace"\ndeny = [\n${denied.map((d) => `  ${JSON.stringify(d)},`).join('\n')}\n]\n`);
  const promptFile = path.join(work, '.brief-prompt.md');
  fs.writeFileSync(promptFile, PREAMBLE(own, attached) + brief);

  // 3. run
  const args = ['--prompt-file', promptFile, '--cwd', work, '--sandbox', PROFILE, '--always-approve', '--output-format', 'json', '--no-auto-update', '--disable-web-search', '--max-turns', String(maxSteps)];
  if (model) args.push('-m', model);
  onEvent({ type: 'say', step: 0, text: `grok worker started in ${work}` });
  const { code, out, err } = await run(bin, args, { cwd: work, timeoutMs, isCancelled });
  const res = parseResult(out);

  // 4. bring back only what the worker owns
  const ownAbs = own.map((p) => ({ abs: path.resolve(work, p), dir: /[\\/]$/.test(p) }));
  const mine = (abs) => ownAbs.some((o) => (o.dir ? abs === o.abs || abs.startsWith(o.abs + path.sep) : abs === o.abs));
  const filesWritten = [];
  const ignoredChanges = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(abs); continue; }
      if (!e.isFile() || abs === promptFile) continue;
      const rel = path.relative(work, abs);
      const real = path.join(root, rel);
      if (same(abs, real)) continue;
      if (mine(abs)) { fs.mkdirSync(path.dirname(real), { recursive: true }); fs.copyFileSync(abs, real); filesWritten.push(rel); }
      else ignoredChanges.push(rel);
    }
  })(work);

  const usage = { prompt: (res?.usage?.input_tokens || 0) + (res?.usage?.cache_read_input_tokens || 0), completion: res?.usage?.output_tokens || 0 };
  const ok = code === 0 && Boolean(res?.text);
  const stopped = ok ? undefined : isCancelled() ? 'cancelled' : `grok exited ${code}: ${(err || out).slice(-600)}`;
  onEvent({ type: 'done', steps: res?.num_turns || 0, usage, stopped: stopped || '' });
  if (!keepWorkDir) await fsp.rm(work, { recursive: true, force: true });
  return { ok, report: res?.text || '', model: Object.keys(res?.modelUsage || {})[0] || model || 'default', steps: res?.num_turns || 0, filesWritten, ignoredChanges, usage, costEstimateUsd: res?.total_cost_usd ?? null, workDir: keepWorkDir ? work : null, ...(stopped ? { stopped } : {}) };
}
