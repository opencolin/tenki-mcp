# Changelog

All notable changes to tenki-mcp. This project follows semantic versioning.

## [0.4.0] — 2026-07-20 — Preview URLs — the ship surface

The ship surface: turn an exposed port into a public, shareable preview URL an agent can hand back. Project-scoped (live-verified: requires projectId + a validated slug). Completes the ports resource with unexpose.

**Tools:** tenki_create_preview_url, tenki_open_preview, tenki_list_preview_urls, tenki_unexpose_port

## [0.3.0] — 2026-07-20 — Session lifecycle & fleet control

Extended session control: extend a sandbox's wall-clock lifetime, update mutable fields (name/tags/idle-timeout/max-duration), bulk-terminate (explicit-id-only, irreversible), an activity heartbeat, and workspace/project-scoped fleet listing. Live-verified.

**Tools:** tenki_extend_sandbox, tenki_update_sandbox, tenki_terminate_sandboxes, tenki_report_sandbox_activity, tenki_list_workspace_sandboxes, tenki_list_project_sandboxes

## [0.2.0] — 2026-07-20 — Filesystem completion (data plane)

Data-plane filesystem metadata + mutation, completing the file surface beyond read/write/list: stat, mkdir (recursive), remove (recursive), and move (exec-backed mv, since the data plane exposes no Move RPC). Live-verified against api.tenki.cloud.

**Tools:** tenki_stat_path, tenki_make_dir, tenki_remove_path, tenki_move_path

## [0.1.0] — 2026-07-20
Initial release. **15 MCP tools over stdio, live-verified against `api.tenki.cloud`.**

- `tenki_whoami`
- `tenki_run_code` — ephemeral sandbox: boot → run shell/python/javascript → terminate
- Sandbox lifecycle: `tenki_create_sandbox`, `tenki_get_sandbox`, `tenki_list_sandboxes`, `tenki_terminate_sandbox`, `tenki_pause_sandbox`, `tenki_resume_sandbox`
- `tenki_exec` — run a command in a sandbox (stdout/stderr/exit inline)
- Files: `tenki_read_file`, `tenki_write_file`, `tenki_list_files`
- `tenki_git`
- Ports: `tenki_expose_port`, `tenki_list_exposed_ports`

Dependency-free ConnectRPC client (control + data plane), ported from the live-verified [n8n node](https://github.com/opencolin/n8n-nodes-tenki). Tools organized into self-registering modules under `src/tools/`.

<!-- Upcoming releases are grouped per docs/plans/ROADMAP.md. -->
