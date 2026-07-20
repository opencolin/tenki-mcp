# tenki-mcp

**A [Model Context Protocol](https://modelcontextprotocol.io) server for [Tenki Cloud](https://tenki.cloud).** Give any agent — Claude, Codex, Cursor — a disposable microVM it can create, run code in, read and write files, run git, and expose to the web. Sandboxes boot in ~2 seconds and are billed per second.

Part of making Tenki the execution layer coding agents reach for: the agent writes code, Tenki runs it in isolation, and (with Runners + Code Reviewer) tests and reviews it before it ships.

```
"Run this Python in a fresh sandbox and tell me what it prints."
        │
        ▼   tenki_run_code
   boots a microVM → runs it → returns stdout → tears it down
```

## Quickstart

```bash
npm install
npm run build
export TENKI_API_KEY=tk_your_key_here
node dist/index.js         # speaks MCP over stdio
```

### Use it in Claude Desktop / Cursor

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tenki": {
      "command": "node",
      "args": ["/absolute/path/to/tenki-mcp/dist/index.js"],
      "env": { "TENKI_API_KEY": "tk_your_key_here" }
    }
  }
}
```

Once published to npm this becomes `"command": "npx", "args": ["-y", "tenki-mcp"]`.

## Tools

| Tool | What it does |
|---|---|
| `tenki_whoami` | Identity + workspaces for the key (cheap credential test) |
| `tenki_run_code` | **One-shot**: boot a throwaway microVM, run shell/python/javascript, return output, tear it down |
| `tenki_create_sandbox` | Create a persistent sandbox (boots in ~2s); returns session + data-plane endpoint |
| `tenki_get_sandbox` | State + metadata for a sandbox |
| `tenki_list_sandboxes` | List sandboxes in the workspace |
| `tenki_terminate_sandbox` | Destroy a sandbox |
| `tenki_pause_sandbox` / `tenki_resume_sandbox` | Suspend / restore |
| `tenki_exec` | Run a command in a sandbox; stdout/stderr/exit code inline |
| `tenki_read_file` / `tenki_write_file` / `tenki_list_files` | Filesystem I/O (data plane) |
| `tenki_git` | git clone / checkout / diff / log / status / add / commit / pull / push / fetchPR |
| `tenki_expose_port` / `tenki_list_exposed_ports` | Public preview URLs for a server in the sandbox |

## Auth

Set one of `TENKI_API_KEY` or `TENKI_AUTH_TOKEN`. The header is chosen by token prefix: `tk_…` → `Authorization: Bearer`, `ory_st_…` → `X-Session-Token`, otherwise a session cookie. Override the endpoint with `TENKI_API_ENDPOINT` (default `https://api.tenki.cloud`).

## How it works

Tenki's API is **ConnectRPC** — JSON over HTTP/1.1, not REST. Every control-plane call is `POST https://api.tenki.cloud/tenki.sandbox.v1.SandboxService/{Method}` with a lowerCamelCase JSON body. Per-session file I/O runs on a **separate data-plane endpoint** returned at create time, authenticated with a short-lived session certificate. This server owns both transports so the tools stay one-liners.

One sharp edge worth knowing: on the current gateway `ExecuteCommand` reports status and exit code but does **not** return output artifacts (the SDK streams output over gRPC, which a plain HTTP client can't speak). So `tenki_exec` and `tenki_run_code` capture output by redirecting to files (`sh -c '… > out 2> err'`) and reading them back over the data plane. It's transparent to the caller — you get `stdout`/`stderr` inline.

The wire details are ported from the live-verified [n8n community node](https://github.com/opencolin/n8n-nodes-tenki).

## Roadmap

- Snapshots, volumes, templates, and the image registry as tools
- Streaming exec + interactive shells (needs a gRPC/Connect-streaming transport)
- Binary file transfer via signed artifact URLs
- An HTTP/SSE transport (in addition to stdio) for hosted use
- Publish to npm + list in MCP registries

## Related

- **Tenki Sandbox** — the platform: https://tenki.cloud
- **n8n-nodes-tenki** — Tenki as an n8n node: https://github.com/opencolin/n8n-nodes-tenki

## License

MIT
