# tenki-mcp — testing (pick up here)

_Goal: comprehensively test tenki-mcp across all key scenarios. Resumable by any agent._

## What exists
- **`test/harness.mjs`** — the shared harness. Spawns the server via the official MCP SDK client (real protocol, exactly as Claude/Cursor drive it) and provides:
  - `Harness.connect(suiteName)` → connected harness (`.tools` has the advertised list)
  - `h.call(tool, args)` → parsed JSON result; throws on `isError`
  - `h.expectError(tool, args)` → asserts a call fails (negative tests)
  - `h.createSandbox(args)` → creates + auto-tracks a sandbox
  - `h.check(name, fn)` / `h.checkData(name, fn)` → record pass/fail; `checkData` treats a **data-plane outage as SKIP, not fail**
  - `h.track(kind, id)` → register a resource for cleanup (`sandbox|volume|snapshot|template`)
  - `h.cleanup()` → tears down every tracked resource (no leaks even on failure)
  - `h.report()` → `{ suite, passed, failed, skipped, results }`
- Smoke-verified against live Tenki (84 tools; positive + negative + data-plane checks green; cleanup confirmed).

## How to run a suite
```bash
cd ~/tenki/tenki-mcp && npm run build
KEY=$(awk -F': *' '/^auth_token:/{print $2}' ~/.config/tenki/config.yaml | tr -d '[:space:]')
TENKI_API_KEY="$KEY" node test/<suite>.test.mjs      # each suite prints its report JSON
# or the aggregate runner once it exists:
TENKI_API_KEY="$KEY" node test/run.mjs
```

## Two live-environment caveats (design tests around these)
1. **Data plane is intermittent.** File I/O and exec/run_code ride a per-session endpoint that resolves to a private `100.x` address and times out when Tenki's mesh path is down (it flaps — reachable, then not, then reachable). Use `h.checkData()` for anything touching files/exec so an outage is a SKIP, not a false failure. Control-plane ops (create/get/list/terminate/snapshots/volumes-CRUD/templates/registry/workspace/ports) are always on public `api.tenki.cloud`.
2. **Volume quota (~10).** Volume tests must create+delete tightly and never leak. Serialize volume-heavy scenarios to avoid quota contention across parallel suites.

## Plan
1. **Council → `docs/plans/TEST-MATRIX.md`** (workflow `wh1y4ahcr`): the prioritized scenario matrix (per-domain coverage, agent journeys, negative/edge, real-client integration).
2. **Fan-out (worktrees) → `test/<domain>.test.mjs`**: one agent per domain/journey group, each writes + runs its suite on the harness against live Tenki, returns report + bugs. Volumes serialized to one agent.
3. **Aggregate → `docs/plans/TEST-REPORT.md`**; fix real bugs (distinguish from data-plane flakiness); cut a patch if fixes land.

## Bugs found by testing so far
- **ResizeVolume** sent `sizeBytes`, API wanted `newSizeBytes` — fixed in v1.0.1 (caught once the volume-quota block was cleared). This is exactly why end-to-end testing matters.

## Tick log
- 2026-07-21: data-plane re-probed → reachable (2.3s to RUNNING). Test council launched (`wh1y4ahcr`). Harness built + smoke-verified (`55567df`). Next: matrix → fan-out domain suites.

- 2026-07-21: Council matrix (34 scenarios) + harness + 5 suites (68 checks). Coverage 16/0/0; fan-out client-integration 14/0/0, errors-edge 15/0/0, journeys 5/0/0, admin-previews 18/0/0 — ALL GREEN. Found + fixed 2 real bugs (attach_volume nested shape, list_image_share_grants ref) → v1.0.2. Full report: docs/plans/TEST-REPORT.md. Testing goal complete.
