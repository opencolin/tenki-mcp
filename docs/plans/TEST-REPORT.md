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

## Fan-out results — all suites GREEN after fixes

Worktree fan-out (`wa0r14nvg`), 4 category suites (`test/*.test.mjs`), driven through the real MCP protocol. Final, after fixing the 2 bugs it found:

| Suite | Result | Covers |
|---|---|---|
| `client-integration` | **14/0/0** | handshake, protocol negotiation (echoes latest + honors older), stdout purity (0 bytes when idle; JSON-RPC only), clean shutdown/no-orphan, full auth contract (no-key exit 1 · AUTH_TOKEN fallback · bad tk_/ory_st_/no-prefix keys → clean 401, token never echoed) |
| `errors-edge` | **15/0/0** | zod bounds reject pre-network (-32602, no side effects); missing/empty ids not coerced; bulk-terminate `.min(1)` (no empty→all footgun); bogus ids → clean isError across 6 domains; unknown tool → clean error; run_code env/non-zero-exit/timeout honored + ephemeral self-terminates |
| `journeys` | **5/0/0** | ship-code red→green loop; snapshot→restore (marker carried into a fresh microVM); **volume warm-cache** (attach→write→detach→reattach); template create→build→boot |
| `admin-previews` | **18/0/0** | workspace/retention reads; SSH gateway routing + cert issue; preview-URL lifecycle (expose→create→get→list→delete→unexpose); registry read + ACL |

**Total across all 5 suites (incl. coverage): 68 passed, 0 failed.**

### 🐞 Two real bugs found by the fan-out — fixed & verified in **v1.0.2**
| # | Bug | Fix |
|---|---|---|
| 7 | **`tenki_attach_volume` sent a flat request** — the API needs the target nested under a `volume` sub-message (`{sessionId, volume:{volumeId, mountPath, readOnly?}}`); every attach 400'd, breaking the volume warm-cache journey | ✅ nested shape; verified attach→detach live |
| 8 | **`tenki_list_image_share_grants` sent `reference`** — the API field is `ref`; it was silently ignored → 400 on every call; the entire ACL-read surface was unreachable | ✅ sends `ref` (required); verified |

Plus a **test-infra fix**: the harness `cleanup()` deleted snapshots before terminating the sandboxes that referenced them (→ leaked a dangling snapshot); now terminates sandboxes first.

### More findings (not our bug — for the Tenki team / docs)
- **Illegal state transitions are idempotent successes**, not conflicts: resume-a-running / pause-a-paused return 200. The matrix expected a conflict; tenki-mcp forwards cleanly. (Relax the matrix, or add a state pre-check if strict guarding is wanted.)
- **Template build failed in the snapshot phase** on some runs (`internal server error … retryable`) — a Tenki control-plane reliability gap; the MCP wiring is correct (build ran, `buildLogTail` showed the provision step). It *did* succeed on a later run.
- **`build_template` with `image_name` 400s on a from-scratch (legacy-mode) template** — image_name is only for typed templates. Tool forwards correctly; document.
- **`create_preview_url` succeeds without `allow_inbound`** — the precondition in the tool description isn't enforced at URL-creation. Soften the description.
- **Snapshot-retention bounds disagree** across two tools (`min(0)` vs `positive()`); worth aligning. `idle=0`/`max_duration=0` disable reaping/lifetime — a by-design cost footgun for workspace defaults.

### No leaks
Every suite self-cleans (harness resource tracker). Post-run audit: created sandboxes terminated, test volumes/templates deleted. (The 4 pre-existing stuck volumes remain — Tenki-side.)

