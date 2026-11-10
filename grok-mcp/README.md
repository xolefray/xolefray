# grok-mcp

A small, dependency-free MCP server that connects an MCP client to xAI's Grok, plus a sandboxed
worker loop so an orchestrating agent can hand Grok a written brief and review what comes back.

## Tools

| Tool | What it does |
|---|---|
| `grok_models` | lists the model ids your xAI key can use |
| `grok_chat` | one question, one answer (no file access) |
| `grok_agent_start` | starts a Grok worker on a brief; returns a run id straight away |
| `grok_agent_wait` | waits up to 240 s for a run, then returns status and (when done) the report |
| `grok_agent_status` | state, steps, token usage, files written, recent actions, report |
| `grok_agent_cancel` | stops a run after its current step |

## What a worker can and cannot do

A worker acts only through six tools, all confined to one project root:

- **Read** text files inside the root. `.git/`, `node_modules/`, `photos/`, `.env*`, key files and
  anything outside the root are refused.
- **Write** only the files or folders named in `own`, plus its `scratch` folder.
- **Run** only the node scripts named in `allow_run` (no shell), with a 5-minute limit.
- **Look at images** only when `allow_images` is set, and only inside `scratch`.

Everything a worker reads, and any image it views, is sent to xAI as part of the conversation.
Leave private material out of the root, or keep it in a `photos/` folder, which is always refused.

## Connect it

1. Get an API key from the xAI console.
2. Make the key available:
   - on your own machine: `export XAI_API_KEY=…` before starting your MCP client;
   - in a hosted session whose network proxy holds secrets: save the key as a network secret for
     the host `api.x.ai`. No variable is needed then.
3. Register the server. This repository's `.mcp.json` already does:
   ```json
   { "mcpServers": { "grok": { "command": "node", "args": ["grok-mcp/server.mjs"] } } }
   ```
   MCP clients read that file when a session starts, so start a new session from a branch that
   contains it. Worker roots must lie inside the folder the server was started in.

Optional variables: `GROK_MODEL` (default model id; otherwise the newest flagship the key lists),
`GROK_MCP_ROOT` (the folder workers are confined to; default: where the server starts).

## From a shell

```sh
node grok-mcp/cli.mjs models
node grok-mcp/cli.mjs chat "Say hello in five words."
node grok-mcp/cli.mjs agent --brief-file brief.md --root . --own src/feature.js,docs/ \
     --scratch /tmp/grok-scratch --allow-run tools/test.mjs --log run.jsonl
```

`agent` prints progress to stderr and a JSON result to stdout (`ok`, `report`, `model`, `steps`,
`filesWritten`, `usage`).

## Check it

```sh
node grok-mcp/selftest.mjs
```

Runs 18 checks against a local stand-in for the API (no key, no network): the sandbox rules above
and the MCP handshake.

## Files

- `grok.mjs`: API client (proxy- and CA-aware) and the worker loop
- `server.mjs`: the MCP server (stdio, JSON-RPC 2.0)
- `cli.mjs`: command-line front end
- `selftest.mjs`: offline self-test
