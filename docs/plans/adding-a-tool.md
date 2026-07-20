# Adding a tool domain to tenki-mcp

Every tool domain is a self-contained module under `src/tools/` that exports a `register<Domain>(server, client)` function. Follow this pattern exactly — the fan-out build relies on it.

## The template
```ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TenkiClient } from "../client.js";
import { ok } from "./common.js";

/** <Domain> tools. */
export function register<Domain>(server: McpServer, client: TenkiClient): void {
	server.tool(
		"tenki_<verb>_<noun>",
		"One-sentence, agent-facing description of what it does and when to use it.",
		{
			// zod raw shape — snake_case params, .describe() each one
			session_id: z.string(),
			some_arg: z.string().optional().describe("..."),
		},
		async ({ session_id, some_arg }) =>
			ok(await client.control("SomeMethod", {
				sessionId: session_id,
				...(some_arg ? { someArg: some_arg } : {}),
			})),
	);
}
```

## Rules
1. **Params are `snake_case`; API body fields are `lowerCamelCase`.** Map explicitly (`session_id` → `sessionId`). The API is Connect-JSON and expects camelCase.
2. **Only include fields that were provided** — spread conditionally (`...(x ? { x } : {})`) so you never send empty/nulls the server would reject.
3. **Control-plane call:** `client.control("<Method>", body)`. Method names are the ConnectRPC method (e.g. `CreateVolume`, `ListSnapshots`) — see `docs/plans/rest-endpoints` reference / the n8n node.
4. **Data-plane call** (per-session file/exec I/O): `client.data(sessionId, "<Method>", innerRequest)`. Used for filesystem ops (`Stat`, `Mkdir`, `Remove`, `Move`). The wrapper + cert auth are handled for you.
5. **Return** via `ok(value)` from `./common.js` — it serializes to MCP text content.
6. **Tool names**: `tenki_<verb>_<noun>`, lowercase, stable. Descriptions are written for a model to route on.
7. **List ops**: accept optional `page_size` / `page_token`; pass through `pageSize` / `pageToken`.
8. **Create-in-a-workspace ops** may need `projectId`/`workspaceId` — get them from `await client.resolveOwner()` and allow explicit overrides (see `sandboxes.ts` for the pattern).

## Wire it in
Add to `src/index.ts`:
```ts
import { register<Domain> } from "./tools/<domain>.js";
// ...add register<Domain> to the `modules` array
```

## Verify
```bash
npm run build                                    # must compile clean
# offline tool-count check, then live:
KEY=$(awk -F': *' '/^auth_token:/{print $2}' ~/.config/tenki/config.yaml | tr -d '[:space:]')
TENKI_API_KEY="$KEY" node scripts/live-test.mjs
```
Add a live check for your new domain to `scripts/live-test.mjs` when it's a safe/cheap call (prefer read-only ops for the smoke test; create/delete pairs should clean up after themselves).
