# grok-mcp

A small, dependency-free MCP server that connects an MCP client to xAI's Grok, plus sandboxed
worker runs so an orchestrating agent can hand Grok a written brief and review what comes back.

It has two ways to reach Grok and picks one automatically:

| Backend | Paid by | Needs |
|---|---|---|
| `cli` (subscription) | your Grok plan | xAI's `grok` command-line agent, signed in with your Grok account |
| `api` | metered API credits | an xAI API key |

`GROK_BACKEND=cli` or `GROK_BACKEND=api` forces one. With neither forced, an API key in the
environment selects `api`; otherwise a signed-in CLI selects `cli`.

## Tools

| Tool | What it does |
|---|---|
| `grok_models` | lists the model ids your xAI key can use |
| `grok_chat` | one question, one answer (no file access) |
| `grok_agent_start` | starts a Grok worker on a brief; returns a run id straight away |
| `grok_agent_wait` | waits up to 240 s for a run, then returns status and (when done) the report |
| `grok_agent_status` | state, steps, token usage, files written, recent actions, report |
| `grok_agent_cancel` | stops a run after its current step |

## Use your Grok subscription (no API credits)

1. Install xAI's command-line agent: `curl -fsSL https://x.ai/cli/install.sh | bash`
   (see https://docs.x.ai/build/overview).
2. Sign in once: `grok login`. On a machine without a browser use `grok login --device-auth`,
   open the link it prints on any device and confirm the code.
3. On Linux install bubblewrap (`apt install -y bubblewrap`); the sandbox needs it.
4. A hosted session must be allowed to reach `auth.x.ai` and `cli-chat-proxy.grok.com`.

How a subscription worker is contained:

- It runs in a throw-away **copy** of the project that holds git-tracked and unignored files only.
  Git-ignored material, such as private photos or `.env` files, is never in the copy.
- A sandbox lets it write only inside that copy and denies it the real project, credential
  folders and any extra paths you pass as `deny`.
- When it finishes, only files matching `own` are copied back. Anything else it changed is
  listed as discarded.

Work done this way counts against your plan's usage allowance. The CLI prints a cost estimate
per run; that is an estimate, not a charge.

## What an API-key worker can and cannot do

A worker acts only through six tools, all confined to one project root:

- **Read** text files inside the root. `.git/`, `node_modules/`, `photos/`, `.env*`, key files and
  anything outside the root are refused.
- **Write** only the files or folders named in `own`, plus its `scratch` folder.
- **Run** only the node scripts named in `allow_run` (no shell), with a 5-minute limit.
- **Look at images** only when `allow_images` is set, and only inside `scratch`.

Everything a worker reads, and any image it views, is sent to xAI as part of the conversation.
Leave private material out of the root, or keep it in a `photos/` folder, which is always refused.

## Connect it with an API key instead

1. Get an API key from the xAI console.
2. Make the key available:
   - on your own machine: `export XAI_API_KEY=…` before starting your MCP client;
   - in a hosted session whose network proxy holds secrets: save the key as a network secret for
     the host `api.x.ai`. No variable is needed then.
3. Register the server (both backends). This repository's `.mcp.json` already does:
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
     --attach notes/contract.md --deny /path/to/private
```

`--attach` and `--deny` apply to the subscription backend; `--scratch`, `--allow-run` and
`--allow-images` apply to the API backend.

`agent` prints progress to stderr and a JSON result to stdout (`ok`, `report`, `model`, `steps`,
`filesWritten`, `usage`).

## Check it

```sh
node grok-mcp/selftest.mjs
```

Runs 23 checks against local stand-ins for the API and the CLI (no key, no network): the sandbox rules above
and the MCP handshake.

## Files

- `grok.mjs`: API client (proxy- and CA-aware) and the API worker loop
- `subscription.mjs`: the subscription backend (work copy, sandbox profile, copy-back)
- `server.mjs`: the MCP server (stdio, JSON-RPC 2.0)
- `cli.mjs`: command-line front end
- `selftest.mjs`: offline self-test
