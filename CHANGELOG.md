# Changelog

All notable changes to tenki-mcp. This project follows semantic versioning.

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
