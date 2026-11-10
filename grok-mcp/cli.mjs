#!/usr/bin/env node
/**
 * cli.mjs — the same Grok bridge from a shell (handy where the MCP server is not loaded):
 *
 *   node grok-mcp/cli.mjs models
 *   node grok-mcp/cli.mjs chat "question" [--model id] [--system "…"]
 *   node grok-mcp/cli.mjs agent --brief-file brief.md [--root .] [--own a.js,dir/] [--scratch dir]
 *        [--allow-run tools/test.mjs,…] [--allow-images] [--model id] [--max-steps 80] [--log run.jsonl]
 *
 * `agent` prints progress to stderr and a JSON result ({ ok, report, model, steps, filesWritten,
 * usage }) to stdout; exit code 0 when the worker finished with a report, 1 otherwise.
 */
import fs from 'node:fs';
import { listModels, chat, runAgent } from './grok.mjs';

const [command, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2);
    flags[key] = rest[i + 1] === undefined || rest[i + 1].startsWith('--') ? true : rest[++i];
  } else positional.push(rest[i]);
}
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

try {
  if (command === 'models') {
    console.log((await listModels()).join('\n'));
  } else if (command === 'chat') {
    const res = await chat({ prompt: positional.join(' '), system: flags.system, model: flags.model });
    console.log(res.text);
    console.error(`[model ${res.model}]`);
  } else if (command === 'agent') {
    if (!flags['brief-file'] && !flags.brief) throw new Error('agent needs --brief-file <path> (or --brief "text")');
    const brief = flags['brief-file'] ? fs.readFileSync(flags['brief-file'], 'utf8') : String(flags.brief);
    const log = flags.log ? fs.createWriteStream(flags.log, { flags: 'a' }) : null;
    const result = await runAgent({
      brief,
      root: flags.root || '.',
      own: list(flags.own),
      scratch: typeof flags.scratch === 'string' ? flags.scratch : null,
      allowRun: list(flags['allow-run']),
      allowImages: Boolean(flags['allow-images']),
      model: typeof flags.model === 'string' ? flags.model : undefined,
      maxSteps: flags['max-steps'] ? Number(flags['max-steps']) : undefined,
      onEvent(e) {
        log?.write(`${JSON.stringify({ at: new Date().toISOString(), ...e })}\n`);
        if (e.type === 'tool') console.error(`[${e.step + 1}] ${e.name} ${e.ok ? JSON.stringify(e.args) : `FAILED: ${e.error}`}`.slice(0, 220));
        else if (e.type === 'say') console.error(`[${e.step + 1}] says: ${e.text.replace(/\s+/g, ' ').slice(0, 200)}`);
      },
    });
    log?.end();
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } else {
    console.error('usage: cli.mjs models | chat "<question>" | agent --brief-file <path> [options]  (see the file header)');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(`grok: ${err.message}`);
  process.exitCode = 1;
}
