# tenki-mcp — STATE (pick up here)

_Last updated: 2026-07-20. This file is the source of truth for "what's done / in flight / next." Update it as you go._

## What this is
A public MCP server exposing Tenki Cloud (disposable Firecracker microVM sandboxes for AI agents) as MCP tools. Repo: https://github.com/opencolin/tenki-mcp. Strategy: make Tenki the execution layer coding agents reach for — "agents that ship code" (execute → test → review). Strategy doc: `tenki-ops/plan/build-in-public-goal.md` (private ops repo).

## Status: v0.1 LIVE-VERIFIED, rounding out to full CLI parity
- **15 tools shipped and verified against `api.tenki.cloud`.** Modules under `src/tools/`.
- Goal now: **full CLI parity → v1.0 (npm publish + MCP-registry listing) → v2.0 (streaming/interactive + HTTP transport).**
- Release roadmap: `docs/plans/ROADMAP.md` (being finalized by a PM council; may be a stub as you read this).

## Architecture (how it fits together)
- **`src/client.ts`** — dependency-free `TenkiClient`. Owns the transport. Two planes:
  - **Control plane:** `client.control(method, body)` → `POST https://api.tenki.cloud/tenki.sandbox.v1.SandboxService/{method}`, Connect-JSON, `Cookie: tenki_session=<token>` auth (also handles `tk_`→Bearer, `ory_st_`→X-Session-Token), retries on 429.
  - **Data plane:** `client.data(sessionId, method, req)` → per-session endpoint (minted + cached via `CreateSessionCredential`), `x-tenki-session-cert` header, body wrapped `{ request: { sessionId, ...req } }`.
  - Helpers: `resolveOwner()` (owner + a consistent workspace/project pair for CreateSession), `waitForState()`, `readTextFile()`/`writeTextFile()`, `execCaptured()` (the `sh -c` redirect + data-plane read that the live gateway requires — ExecuteCommand returns no output artifacts), `runCode()`.
- **`src/tools/*.ts`** — one module per domain, each exports `register<Domain>(server, client)`. See `docs/plans/adding-a-tool.md`.
- **`src/index.ts`** — thin: builds the client, calls every `register*` in the `modules` array, connects stdio.

## Tools done (15)
`tenki_whoami` · `tenki_run_code` · `tenki_create_sandbox` `tenki_get_sandbox` `tenki_list_sandboxes` `tenki_terminate_sandbox` `tenki_pause_sandbox` `tenki_resume_sandbox` · `tenki_exec` · `tenki_read_file` `tenki_write_file` `tenki_list_files` · `tenki_git` · `tenki_expose_port` `tenki_list_exposed_ports`

## Remaining for full parity (each = one new module, fan-out-safe)
- `snapshots.ts` — Create/Get/List/ListSession/ListDangling/Update/Delete/Restore/GetDownloadURL
- `volumes.ts` — Create/Get/List/Update/Delete/Resize/Attach/Detach
- `templates.ts` — Create/Get/List/Update/Delete/Build/CancelBuild/GetBuild/ListActiveBuilds
- `registry.ts` — Publish/Get/List/SetVisibility/Delete/ResolveRef/Share/ListShareGrants
- `workspace.ts` — GetWorkspaceSandboxUsage, Get/UpdateWorkspaceSandboxSettings, Get/UpdateWorkspaceSnapshotRetentionSettings
- `files_ops.ts` — data-plane Stat, Mkdir, Remove, Move (extends file coverage)
- `previews.ts` — UnexposePort, CreatePreviewUrl/GetPreviewUrl/ListPreviewUrls/DeletePreviewUrl
- `sessions_admin.ts` — ExtendSession, UpdateSession, TerminateSessions (bulk), ReportSessionActivity, ListWorkspaceSandboxes, ListProjectSandboxes
- **v2 (hard):** streaming (`StreamCommandOutput`, interactive `Run`/`Dial`/tunnels) — needs a gRPC/Connect-streaming transport, not plain HTTP. Plus an HTTP/SSE server transport.

Full wire-level API reference: cloned n8n node at `/tmp/n8n-nodes-tenki/docs/research/rest-endpoints.md` (the decompiled SDK map). The n8n node (github.com/opencolin/n8n-nodes-tenki) is a live-verified reference implementation of the whole API.

## Build & verify (exact commands)
```bash
cd ~/tenki/tenki-mcp
npm install
npm run build                      # tsc → dist/

# offline: confirm tools register (dummy key)
# initialize + tools/list over stdio → expect the tool count

# live end-to-end (needs a real token):
KEY=$(awk -F': *' '/^auth_token:/{print $2}' ~/.config/tenki/config.yaml | tr -d '[:space:]')
TENKI_API_KEY="$KEY" node scripts/live-test.mjs     # WhoAmI + run_code + create→write→exec→read→terminate
```
Auth note: the `tenki` CLI (v0.19.0+) stores a ~428-char session token in `~/.config/tenki/config.yaml` under `auth_token:`, sent as `Cookie: tenki_session=…`. If you get 401, run `tenki login` to refresh.

## Workflow / process for this goal
- A **PM council** (workflow) sets the release roadmap → `docs/plans/ROADMAP.md`.
- **Fan-out build**: one worktree-isolated agent per remaining module above; each writes `src/tools/<domain>.ts` to the template, self-builds; orchestrator collects modules, regenerates `index.ts`'s `modules` list, builds, **live-verifies against the API**, commits per release, pushes, tags.
- Ticks: log progress here frequently so any agent can resume.

## In flight / next
- [ ] PM council roadmap → ROADMAP.md
- [ ] Fan-out build of the 8 remaining modules
- [ ] Live-verify each new domain against the API
- [ ] Cut releases v0.2 → v1.0; publish to npm; list in MCP registries
- [ ] v2.0: streaming + HTTP transport
