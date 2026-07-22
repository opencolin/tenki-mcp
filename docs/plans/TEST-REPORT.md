# tenki-mcp — test report

_Run 2026-07-21 against live `api.tenki.cloud` (server v1.0.1, 84 tools), through the real MCP protocol via `test/harness.mjs`. Matrix: `docs/plans/TEST-MATRIX.md` (34 scenarios). How to reproduce: `docs/plans/TESTING.md`._

## Headline
- **Coverage suite: 16/16 green** (`test/coverage.test.mjs`) — every one of the 84 tools' domains exercised end-to-end through the MCP protocol: identity, sandbox lifecycle, session admin, files (data plane), exec, run_code, git, previews, artifacts, snapshots, volumes, templates, registry, workspace, ssh.
- Fan-out suites (client-integration, errors-edge, journeys, admin-previews): **running** — results appended below when the workflow completes.

## Findings

### Real bugs — found & fixed
| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | `tenki_resize_volume` sent `sizeBytes`; API wants `newSizeBytes` — resizes were rejected | med | ✅ fixed in **v1.0.1** |
| 2 | README listed wrong workspace tool names (`tenki_get_workspace_sandbox_settings`) — the real tools are `tenki_get_workspace_settings` / `tenki_update_workspace_settings` | low (docs) | ✅ fixed |
| 3 | `create_template` marked `setup_script` optional, but the API requires it for a from-scratch template | low (UX) | ✅ description sharpened |

### Real findings — not our bug (flag to Tenki / document)
| # | Finding | Impact |
|---|---|---|
| 4 | **`tenki_get_upload_url` → API `501 not-implemented`.** The tool is wired correctly; the Tenki backend hasn't shipped `GetArtifactUploadUrl`. (`GetArtifactDownloadUrl` IS implemented — 400 on bad args.) | Binary *upload* via signed URL is dead until the API ships it. **Flag to the Tenki team.** |
| 5 | **The `git` tool is a passthrough with undocumented arg keys** — clone needs `args.repo` (not `url`); a caller/agent can't discover that from the tool. | UX: consider documenting common git args in the tool description. |
| 6 | **Slow ops exceed the MCP client's 60s default timeout.** `pause` (snapshots the VM) and `template build` intermittently hit `-32001 Request timed out`. | Integration: hosts (Claude Desktop) should raise the request timeout for these; harness uses 120s. Worth a README note. |

### Environment (not code) — flakiness observed
- **Data plane intermittent.** Files/exec/run_code ride a per-session endpoint on a private `100.x` address that flaps (reachable → timeout → reachable within minutes). Tests use `h.checkData()` so an outage is a SKIP. **The whole exec/file surface is only usable when that path is up — a real question for the team: is the data-plane endpoint meant to be publicly reachable, or only over Tenki's mesh?**
- **Sandbox outbound DNS flaky.** `git clone` hit `Could not resolve host: github.com` on one run, resolved on the next — the sandbox's outbound network is intermittent too. Also `checkData`-guarded.

### Housekeeping
- Cleaned leaked test resources found blocking quotas: **10 test volumes** (Jul 17) and **10 test templates** (Jul 17), plus **2 leaked sandboxes** from a timed-out run. **4 volumes remain stuck** server-side (orphaned attachment / sync-pending) and need Tenki-side attention.

## Fan-out results
_(appended when workflow `wa0r14nvg` completes — client-integration · errors-edge · journeys · admin-previews)_
