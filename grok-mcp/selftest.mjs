#!/usr/bin/env node
/**
 * selftest.mjs — checks the bridge without an xAI key or network: a local fake of the chat
 * completions API scripts a worker run, and the MCP server is driven over stdio.
 *   node grok-mcp/selftest.mjs     → prints PASS/FAIL per check, exits 1 on any failure
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`); if (!ok) failures++; };

// ── a scripted stand-in for POST /chat/completions and GET /models ──
const seen = [];
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const script = [
  { tool_calls: [call('c1', 'list_files', { dir: '.' }), call('c2', 'read_file', { path: 'notes.txt' }), call('c3', 'write_file', { path: 'out/result.txt', content: 'hello\nworld\n' }),
                 call('c4', 'write_file', { path: 'notes.txt', content: 'overwritten' }), call('c5', 'read_file', { path: 'photos/private.txt' }), call('c6', 'read_file', { path: '../outside.txt' }),
                 call('c7', 'run_script', { script: 'ok.mjs', args: ['42'] }), call('c8', 'run_script', { script: 'evil.mjs' }), call('c9', 'edit_file', { path: 'out/result.txt', old_text: 'world', new_text: 'there' })] },
  { content: 'Report: wrote out/result.txt.' },
];
const api = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'grok-3-mini' }, { id: 'grok-4' }, { id: 'grok-4-fast' }] }));
    const parsed = JSON.parse(body);
    seen.push({ auth: req.headers.authorization, parsed });
    const next = parsed.tools ? script[seen.filter((s) => s.parsed.tools).length - 1] : { content: 'pong' };
    res.end(JSON.stringify({ choices: [{ finish_reason: next.tool_calls ? 'tool_calls' : 'stop', message: { role: 'assistant', content: next.content ?? null, tool_calls: next.tool_calls } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));
process.env.GROK_BASE_URL = `http://127.0.0.1:${api.address().port}/v1`;
delete process.env.GROK_MODEL;

// ── sandbox project ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grok-mcp-test-'));
const root = path.join(tmp, 'project');
fs.mkdirSync(path.join(root, 'photos'), { recursive: true });
fs.writeFileSync(path.join(root, 'notes.txt'), 'a note');
fs.writeFileSync(path.join(root, 'photos', 'private.txt'), 'secret');
fs.writeFileSync(path.join(tmp, 'outside.txt'), 'outside');
fs.writeFileSync(path.join(root, 'ok.mjs'), 'console.log("ran with", process.argv[2]);');
fs.writeFileSync(path.join(root, 'evil.mjs'), 'console.log("should never run");');

const { runAgent, pickModel, chat } = await import('./grok.mjs');
check('picks the flagship model by default', (await pickModel()) === 'grok-4');
check('chat returns text', (await chat({ prompt: 'ping' })).text === 'pong');

const result = await runAgent({ brief: 'test', root, own: ['out/'], allowRun: ['ok.mjs'] });
const toolResults = Object.fromEntries(seen.at(-1).parsed.messages.filter((m) => m.role === 'tool').map((m) => [m.tool_call_id, m.content]));
check('agent finishes with a report', result.ok && result.report.startsWith('Report:'), JSON.stringify(result));
check('lists files but hides photos/', toolResults.c1.includes('notes.txt') && !toolResults.c1.includes('photos'), toolResults.c1);
check('reads a project file', toolResults.c2 === 'a note', toolResults.c2);
check('writes an owned file', fs.readFileSync(path.join(root, 'out/result.txt'), 'utf8') === 'hello\nthere\n');
check('refuses to write a file it does not own', toolResults.c4.startsWith('ERROR') && fs.readFileSync(path.join(root, 'notes.txt'), 'utf8') === 'a note', toolResults.c4);
check('refuses to read photos/', toolResults.c5.startsWith('ERROR'), toolResults.c5);
check('refuses to read outside the root', toolResults.c6.startsWith('ERROR'), toolResults.c6);
check('runs an allowed script', toolResults.c7.includes('exit 0') && toolResults.c7.includes('ran with 42'), toolResults.c7);
check('refuses a script that is not allowed', toolResults.c8.startsWith('ERROR'), toolResults.c8);
check('reports files written and usage', result.filesWritten.join() === 'out/result.txt' && result.usage.prompt === 20, JSON.stringify(result));
check('sends a bearer token and no image tool unless enabled', seen.at(-1).auth.startsWith('Bearer ') && !seen.at(-1).parsed.tools.some((t) => t.function.name === 'view_image'));

// ── MCP server over stdio ──
const server = spawn(process.execPath, [path.join(here, 'server.mjs')], { cwd: root, env: process.env, stdio: ['pipe', 'pipe', 'ignore'] });
const replies = new Map();
let buffer = '';
server.stdout.on('data', (chunk) => {
  buffer += chunk;
  for (let nl; (nl = buffer.indexOf('\n')) >= 0; buffer = buffer.slice(nl + 1)) { const msg = JSON.parse(buffer.slice(0, nl)); replies.get(msg.id)?.(msg); }
});
const rpc = (id, method, params) => new Promise((resolve, reject) => { replies.set(id, resolve); setTimeout(() => reject(new Error(`no reply to ${method}`)), 10000); server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'selftest', version: '0' } });
server.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
check('MCP initialize', init.result?.serverInfo?.name === 'grok' && init.result.capabilities.tools);
const tools = await rpc(2, 'tools/list', {});
check('MCP lists six tools', tools.result?.tools?.length === 6 && tools.result.tools.every((t) => t.inputSchema?.type === 'object'));
const chatCall = await rpc(3, 'tools/call', { name: 'grok_chat', arguments: { prompt: 'ping' } });
check('MCP grok_chat', chatCall.result?.content?.[0]?.text.startsWith('pong'), JSON.stringify(chatCall));
const badRoot = await rpc(4, 'tools/call', { name: 'grok_agent_start', arguments: { brief: 'x', root: '..' } });
check('MCP refuses a root outside its directory', badRoot.result?.isError === true || /inside/.test(JSON.stringify(badRoot)), JSON.stringify(badRoot));
const unknown = await rpc(5, 'nope', {});
check('MCP rejects unknown methods', unknown.error?.code === -32601);
server.kill();
api.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
