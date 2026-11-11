/**
 * grok.mjs — zero-dependency bridge to xAI's Grok API (OpenAI-compatible chat completions) and a
 * sandboxed worker-agent loop built on Grok's function calling.
 *
 *   listModels()            → string[] of model ids the key can use
 *   chat({ prompt, … })     → one-shot completion
 *   runAgent({ brief, … })  → Grok works on a task with file tools confined to a project root:
 *                             it may READ inside `root` (minus a deny list), WRITE only the files /
 *                             folders named in `own` (plus its `scratch` folder), RUN only the node
 *                             scripts named in `allowRun`, and LOOK AT images only when
 *                             `allowImages` is set and only inside `scratch`.
 *
 * Auth: `Authorization: Bearer $XAI_API_KEY`. In hosted sessions where a network proxy injects the
 * credential for api.x.ai, no variable is needed (a placeholder is sent and replaced in transit).
 * Honors HTTPS_PROXY (CONNECT tunnel) and NODE_EXTRA_CA_CERTS. `GROK_BASE_URL` overrides the
 * endpoint (used by the self-test). Nothing here logs or stores the key.
 */
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const baseUrl = () => new URL(process.env.GROK_BASE_URL || 'https://api.x.ai/v1');
const apiKey = () => process.env.XAI_API_KEY || process.env.GROK_API_KEY || 'proxy-injected';

/** Model preference when the caller names none: vision-capable flagship first. */
const MODEL_PREFERENCE = [/^grok-5(?!.*(mini|fast))/, /^grok-5/, /^grok-4(?!.*(mini|fast))/, /^grok-4/, /^grok-code/, /^grok-3(?!.*mini)/, /^grok/];

export class GrokError extends Error {
  constructor(status, body) {
    const hint =
      status === 401 || status === 403
        ? ' — no valid xAI API key reached api.x.ai (set XAI_API_KEY, or save the key as a network secret for api.x.ai)'
        : status === 407 || status === 0
          ? ' — the network proxy refused the connection to the API host'
          : '';
    super(`Grok API error ${status}${hint}: ${String(body).slice(0, 600)}`);
    this.status = status;
  }
}

function proxyFor(url) {
  if (url.protocol !== 'https:') return null;
  const p = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!p) return null;
  const no = (process.env.NO_PROXY || process.env.no_proxy || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (no.some((n) => n === url.hostname || (n.startsWith('.') && url.hostname.endsWith(n)))) return null;
  return new URL(p);
}

function tunnel(proxy, host, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: proxy.hostname, port: proxy.port || 80, method: 'CONNECT', path: `${host}:${port}`, headers: { Host: `${host}:${port}` } });
    req.once('connect', (res, socket) => {
      if (res.statusCode === 200) return resolve(socket);
      socket.destroy();
      reject(new GrokError(res.statusCode === 403 ? 407 : res.statusCode, `proxy refused CONNECT to ${host} (HTTP ${res.statusCode}); the host may not be allowed in this environment`));
    });
    req.once('error', reject);
    req.end();
  });
}

async function requestOnce(method, route, body, timeoutMs) {
  const base = baseUrl();
  const url = new URL(base.href.replace(/\/$/, '') + route);
  const payload = body == null ? null : Buffer.from(JSON.stringify(body));
  const headers = { Accept: 'application/json', Authorization: `Bearer ${apiKey()}`, 'User-Agent': 'grok-mcp/1.0' };
  if (payload) Object.assign(headers, { 'Content-Type': 'application/json', 'Content-Length': payload.length });
  const secure = url.protocol === 'https:';
  const opts = { host: url.hostname, port: url.port || (secure ? 443 : 80), path: url.pathname + url.search, method, headers, agent: false };
  const proxy = proxyFor(url);
  if (proxy) {
    // The proxy resolves host names; hand the request an agent whose only connection is the tunnel,
    // so Node never tries a DNS lookup of its own.
    const socket = await tunnel(proxy, url.hostname, opts.port);
    socket.on('error', () => {}); // surfaced through the request below
    const agent = new https.Agent({ keepAlive: false, maxSockets: 1 });
    agent.createConnection = () => tls.connect({ socket, servername: url.hostname });
    opts.agent = agent;
  }
  return new Promise((resolve, reject) => {
    const req = (secure ? https : http).request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* handled below */ }
        if (res.statusCode >= 200 && res.statusCode < 300 && json) resolve(json);
        else reject(new GrokError(res.statusCode, text));
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Grok API request timed out after ${Math.round(timeoutMs / 1000)} s`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** JSON request with retries on 429 / 5xx / dropped connections. */
export async function api(method, route, body, { timeoutMs = 600000, retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce(method, route, body, timeoutMs);
    } catch (err) {
      const retryable = err instanceof GrokError ? err.status === 429 || err.status >= 500 : /ECONNRESET|socket hang up|EAI_AGAIN/.test(String(err.message));
      if (!retryable || attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

export async function listModels() {
  const res = await api('GET', '/models');
  return (res.data || []).map((m) => m.id).sort();
}

export async function pickModel(wanted) {
  if (wanted) return wanted;
  if (process.env.GROK_MODEL) return process.env.GROK_MODEL;
  const ids = await listModels();
  for (const re of MODEL_PREFERENCE) {
    const hit = ids.filter((id) => re.test(id)).sort().pop();
    if (hit) return hit;
  }
  if (!ids.length) throw new Error('the xAI key lists no models');
  return ids[0];
}

export async function chat({ prompt, system, model, temperature, maxTokens } = {}) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: String(prompt ?? '') });
  const used = await pickModel(model);
  const body = { model: used, messages };
  if (temperature != null) body.temperature = temperature;
  if (maxTokens != null) body.max_tokens = maxTokens;
  const res = await api('POST', '/chat/completions', body);
  return { model: used, text: res.choices?.[0]?.message?.content ?? '', usage: res.usage || null };
}

// ── worker agent ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DENY = [/(^|\/)\.git(\/|$)/, /(^|\/)node_modules(\/|$)/, /(^|\/)photos(\/|$)/, /(^|\/)\.env/, /\.(pem|key|p12|pfx)$/i, /(^|\/)id_(rsa|ed25519)/, /(^|\/)\.ccr(\/|$)/, /(^|\/)\.ssh(\/|$)/];
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const MAX_READ = 60000;      // characters returned by one read_file call
const MAX_TOOL_OUT = 12000;  // characters of command output kept
const MAX_IMAGE = 4 * 1024 * 1024;

const TOOLS = [
  fn('list_files', 'List files under a directory (recursive up to `depth`). Paths are relative to the project root.', { dir: { type: 'string' }, depth: { type: 'integer', minimum: 1, maximum: 6 } }, ['dir']),
  fn('read_file', 'Read a UTF-8 text file. Long files come in parts: pass `offset` (1-based line) and `limit` (lines).', { path: { type: 'string' }, offset: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1 } }, ['path']),
  fn('search', 'Regex search in text files under a directory. Returns matching lines as path:line:text.', { pattern: { type: 'string' }, dir: { type: 'string' }, max_results: { type: 'integer', minimum: 1, maximum: 200 } }, ['pattern']),
  fn('write_file', 'Create or replace a file you own (see the ownership list in your instructions).', { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']),
  fn('edit_file', 'Replace one exact occurrence of `old_text` with `new_text` in a file you own.', { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, ['path', 'old_text', 'new_text']),
  fn('run_script', 'Run one of the allowed node scripts (see your instructions) with arguments, from the project root. Returns exit code and output.', { script: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, ['script']),
  fn('view_image', 'Look at a PNG/JPEG you produced in your scratch folder (e.g. a screenshot).', { path: { type: 'string' } }, ['path']),
];

function fn(name, description, properties, required) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } };
}

const SYSTEM = `You are a senior software engineer working as one worker on a shared codebase; an orchestrator wrote your brief and will review your result.
You act only through the tools provided. Work in small verified steps: read what you need, write your files, run the allowed verification scripts, fix what they show, repeat.
Hard rules:
- Write ONLY the files/folders listed under "You own". Never ask for more access; if something outside is wrong, say so in your report.
- Paths are relative to the project root unless absolute. Scratch files and screenshots go in your scratch folder.
- Do not invent results. If you could not verify something, say so plainly.
- When the work is done (or you are blocked), reply WITHOUT calling a tool: a report of at most 250 words — files written with line counts, what you verified and how, known issues, requests for the orchestrator.`;

/**
 * Run Grok as a sandboxed worker.
 * @returns {Promise<{ok:boolean, report:string, model:string, steps:number, filesWritten:string[], usage:{prompt:number,completion:number}, stopped?:string}>}
 */
export async function runAgent({ brief, root, own = [], scratch = null, model, maxSteps = 80, allowRun = [], allowImages = false, deny = DEFAULT_DENY, runTimeoutMs = 300000, onEvent = () => {}, isCancelled = () => false } = {}) {
  if (!brief) throw new Error('runAgent: brief is required');
  root = await fsp.realpath(path.resolve(root || '.'));
  if (scratch) { scratch = path.resolve(scratch); await fsp.mkdir(scratch, { recursive: true }); scratch = await fsp.realpath(scratch); }
  const ownAbs = own.map((p) => ({ abs: path.resolve(root, p), dir: /[\\/]$/.test(p) }));
  const runAbs = allowRun.map((p) => path.resolve(root, p));
  const used = await pickModel(model);
  const filesWritten = new Set();
  const usage = { prompt: 0, completion: 0 };

  const rel = (abs) => (abs.startsWith(root + path.sep) ? path.relative(root, abs) : abs);
  const inside = (abs, base) => base && (abs === base || abs.startsWith(base + path.sep));
  const denied = (abs) => deny.some((re) => re.test(abs.split(path.sep).join('/')));

  /** Resolve a path and make sure it (through symlinks) stays inside the readable area. */
  async function resolveRead(p) {
    const abs = path.resolve(root, String(p || '.'));
    let probe = abs;
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    const real = path.join(await fsp.realpath(probe), path.relative(probe, abs));
    if (!inside(real, root) && !inside(real, scratch)) throw new Error(`"${p}" is outside the project root`);
    if (denied(real) && !inside(real, scratch)) throw new Error(`"${p}" is off limits`);
    return real;
  }
  async function resolveWrite(p) {
    const real = await resolveRead(p);
    const mine = inside(real, scratch) || ownAbs.some((o) => (o.dir ? inside(real, o.abs) : real === o.abs));
    if (!mine) throw new Error(`you do not own "${p}"; you may write only: ${own.join(', ') || '(nothing)'}${scratch ? ' and your scratch folder' : ''}`);
    return real;
  }

  const handlers = {
    async list_files({ dir = '.', depth = 2 }) {
      const start = await resolveRead(dir);
      const out = [];
      async function walk(d, level) {
        const entries = (await fsp.readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
        for (const e of entries) {
          const abs = path.join(d, e.name);
          if (denied(abs) && !inside(abs, scratch)) continue;
          if (out.length >= 600) return;
          if (e.isDirectory()) { out.push(rel(abs) + '/'); if (level < depth) await walk(abs, level + 1); }
          else out.push(`${rel(abs)}  (${(await fsp.stat(abs)).size} B)`);
        }
      }
      await walk(start, 1);
      return out.join('\n') || '(empty)';
    },
    async read_file({ path: p, offset = 1, limit }) {
      const abs = await resolveRead(p);
      const buf = await fsp.readFile(abs);
      if (buf.subarray(0, 8192).includes(0)) throw new Error(`"${p}" is a binary file${IMAGE_RE.test(abs) ? '; use view_image for images in your scratch folder' : ''}`);
      const lines = buf.toString('utf8').split('\n');
      const from = Math.max(1, offset) - 1;
      let to = limit ? Math.min(lines.length, from + limit) : lines.length;
      let text = lines.slice(from, to).join('\n');
      while (text.length > MAX_READ && to > from + 1) { to = from + Math.max(1, Math.floor((to - from) * 0.7)); text = lines.slice(from, to).join('\n'); }
      const more = to < lines.length ? `\n[lines ${from + 1}-${to} of ${lines.length}; continue with offset=${to + 1}]` : '';
      return text + more;
    },
    async search({ pattern, dir = '.', max_results = 60 }) {
      const re = new RegExp(pattern);
      const start = await resolveRead(dir);
      const hits = [];
      async function walk(d) {
        for (const e of await fsp.readdir(d, { withFileTypes: true })) {
          if (hits.length >= max_results) return;
          const abs = path.join(d, e.name);
          if ((denied(abs) && !inside(abs, scratch)) || /(^|\/)vendor(\/|$)/.test(abs)) continue;
          if (e.isDirectory()) { await walk(abs); continue; }
          const stat = await fsp.stat(abs);
          if (stat.size > 2_000_000) continue;
          const buf = await fsp.readFile(abs);
          if (buf.subarray(0, 4096).includes(0)) continue;
          buf.toString('utf8').split('\n').forEach((line, i) => { if (hits.length < max_results && re.test(line)) hits.push(`${rel(abs)}:${i + 1}:${line.slice(0, 240)}`); });
        }
      }
      await walk(start);
      return hits.join('\n') || 'no matches';
    },
    async write_file({ path: p, content }) {
      const abs = await resolveWrite(p);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, content);
      filesWritten.add(rel(abs));
      return `wrote ${rel(abs)} (${content.split('\n').length} lines)`;
    },
    async edit_file({ path: p, old_text, new_text }) {
      const abs = await resolveWrite(p);
      const text = await fsp.readFile(abs, 'utf8');
      const count = text.split(old_text).length - 1;
      if (count !== 1) throw new Error(`old_text occurs ${count} times in ${p}; it must occur exactly once`);
      await fsp.writeFile(abs, text.replace(old_text, () => new_text));
      filesWritten.add(rel(abs));
      return `edited ${rel(abs)}`;
    },
    async run_script({ script, args = [] }) {
      const abs = path.resolve(root, script);
      if (!runAbs.includes(abs)) throw new Error(`"${script}" is not an allowed script; allowed: ${allowRun.join(', ') || '(none)'}`);
      if (args.some((a) => typeof a !== 'string' || a.split(/[\\/]/).includes('..'))) throw new Error('arguments must be strings without ".." path segments');
      return new Promise((resolve) => {
        const child = spawn(process.execPath, [abs, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        const add = (c) => { out += c; if (out.length > 4 * MAX_TOOL_OUT) out = out.slice(-2 * MAX_TOOL_OUT); };
        child.stdout.on('data', add);
        child.stderr.on('data', add);
        const timer = setTimeout(() => child.kill('SIGKILL'), runTimeoutMs);
        child.on('close', (code, sig) => { clearTimeout(timer); resolve(`exit ${sig ? `signal ${sig} (timeout?)` : code}\n${out.slice(-MAX_TOOL_OUT)}`); });
        child.on('error', (e) => { clearTimeout(timer); resolve(`failed to start: ${e.message}`); });
      });
    },
    async view_image({ path: p }) {
      if (!allowImages) throw new Error('viewing images is not enabled for this task');
      const abs = await resolveRead(p);
      if (!inside(abs, scratch)) throw new Error('only images inside your scratch folder can be viewed');
      if (!IMAGE_RE.test(abs)) throw new Error('only .png / .jpg / .webp images can be viewed');
      const buf = await fsp.readFile(abs);
      if (buf.length > MAX_IMAGE) throw new Error(`image is ${(buf.length / 1e6).toFixed(1)} MB; keep screenshots under 4 MB (smaller --size)`);
      const mime = /\.png$/i.test(abs) ? 'image/png' : /\.webp$/i.test(abs) ? 'image/webp' : 'image/jpeg';
      return { text: `image ${rel(abs)} attached below`, image: `data:${mime};base64,${buf.toString('base64')}`, label: rel(abs) };
    },
  };

  const tools = TOOLS.filter((t) => (t.function.name !== 'run_script' || allowRun.length) && (t.function.name !== 'view_image' || (allowImages && scratch)));
  const setup = [
    `Project root: ${root}`,
    `You own (may write): ${own.length ? own.join(', ') : '(nothing in the project)'}`,
    scratch ? `Scratch folder (may write, screenshots go here): ${scratch}` : 'No scratch folder.',
    allowRun.length ? `Allowed scripts for run_script: ${allowRun.join(', ')}` : 'No scripts can be run in this task.',
    allowImages && scratch ? 'You can look at images in your scratch folder with view_image.' : 'You cannot view images in this task.',
  ].join('\n');
  const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: `${setup}\n\n# Your brief\n\n${brief}` }];

  let report = '';
  let stopped = '';
  let step = 0;
  for (; step < maxSteps; step++) {
    if (isCancelled()) { stopped = 'cancelled'; break; }
    trimHistory(messages);
    const res = await api('POST', '/chat/completions', { model: used, messages, tools, tool_choice: 'auto' });
    usage.prompt += res.usage?.prompt_tokens || 0;
    usage.completion += res.usage?.completion_tokens || 0;
    const choice = res.choices?.[0];
    const msg = choice?.message;
    if (!msg) throw new Error('Grok returned no message');
    messages.push({ role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
    if (msg.content) onEvent({ type: 'say', step, text: msg.content });
    if (!msg.tool_calls?.length) {
      if (choice.finish_reason === 'length') { messages.push({ role: 'user', content: 'Continue.' }); continue; }
      report = msg.content || '';
      break;
    }
    const images = [];
    for (const call of msg.tool_calls) {
      const name = call.function?.name;
      let result;
      try {
        const args = JSON.parse(call.function?.arguments || '{}');
        if (!handlers[name] || !tools.some((t) => t.function.name === name)) throw new Error(`unknown tool "${name}"`);
        result = await handlers[name](args);
        onEvent({ type: 'tool', step, name, args: summarize(args), ok: true });
      } catch (err) {
        result = `ERROR: ${err.message}`;
        onEvent({ type: 'tool', step, name, ok: false, error: err.message });
      }
      if (result && typeof result === 'object') { images.push(result); result = result.text; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: String(result) });
    }
    for (const img of images) {
      messages.push({ role: 'user', content: [{ type: 'text', text: `Here is ${img.label}:` }, { type: 'image_url', image_url: { url: img.image, detail: 'high' } }] });
    }
  }
  if (!report && !stopped) stopped = step >= maxSteps ? 'ran out of steps' : 'stopped';
  onEvent({ type: 'done', steps: step + (report ? 1 : 0), usage, stopped });
  return { ok: Boolean(report), report, model: used, steps: step + (report ? 1 : 0), filesWritten: [...filesWritten], usage, ...(stopped ? { stopped } : {}) };
}

/** Keep the conversation bounded: drop all but the three newest images, elide old bulky tool output. */
function trimHistory(messages) {
  let images = 0;
  let chars = 0;
  for (let i = messages.length - 1; i >= 2; i--) {
    const m = messages[i];
    if (Array.isArray(m.content)) {
      if (++images > 3) m.content = [{ type: 'text', text: '[an earlier image was removed to save space]' }];
      continue;
    }
    chars += (m.content || '').length;
    if (m.role === 'tool' && chars > 500000 && m.content.length > 400) m.content = m.content.slice(0, 200) + '\n[earlier tool output elided]';
  }
}

function summarize(args) {
  const out = {};
  for (const [k, v] of Object.entries(args)) out[k] = typeof v === 'string' && v.length > 120 ? `${v.slice(0, 80)}… (${v.length} chars)` : v;
  return out;
}
