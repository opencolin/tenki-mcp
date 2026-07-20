# v2.0 design — streaming, interactive execution & HTTP transport

_Status: designed, not yet built. This is the hardest work on the roadmap (the council quarantined it deliberately). v1.0 ships the entire unary surface over stdio; v2.0 adds the two things plain HTTP can't do. Any agent can pick this up from here._

## Why it's separate from v1.0
Everything in v0.1–v1.0 is **unary** Connect-JSON over HTTP/1.1 — one request, one response — which `fetch` handles fine. v2.0 needs **streaming**, which `fetch` + Connect-JSON cannot express:

| Method | Kind | Why HTTP/1.1 JSON can't do it |
|---|---|---|
| `SandboxService/StreamCommandOutput` | server-stream | server pushes many messages over one call |
| `DataPlaneService/Run` | bidi-stream | interactive shell: stdin ↔ stdout both flowing |
| `DataPlaneService/Dial` | bidi-stream | raw TCP tunnel |
| `DataPlaneService/HostPortTunnel` | bidi-stream | port forwarding |
| `DataPlaneService/ReadFileStream` | server-stream | large-file streaming read |
| `DataPlaneService/WriteFileStream` | client-stream | large-file streaming write |
| `SandboxService/WaitSession` | server-stream | (we already poll GetSession instead — keep polling) |

The official SDK uses `createGrpcTransport` (`@connectrpc/connect-node`) — **gRPC over HTTP/2, binary framing**. Our client is dependency-free `fetch`; it cannot frame gRPC.

## Two workstreams (independent — ship in either order)

### A. HTTP/SSE **server** transport (tractable, ship first)
Today tenki-mcp speaks MCP over **stdio** only (one local client). To be hostable (remote agents, multiple clients), add the MCP SDK's **`StreamableHTTPServerTransport`** as an alternative to `StdioServerTransport`, selected by env/flag (e.g. `TENKI_MCP_TRANSPORT=http`, `PORT`).
- This is about how MCP clients reach *us*, and is **independent of Tenki's gRPC streaming**. No new Tenki transport needed.
- The SDK already provides the transport; wiring is modest. Verify with a curl/SSE smoke test + a real client (Claude Desktop remote MCP).
- Auth for the hosted case: the server needs the Tenki token per-connection (header) rather than a single process-env token — design a per-session client.
- **This is the higher-value, lower-risk half.** Recommend shipping it as v2.0.0 (or v1.1.0) on its own.

### B. Tenki **streaming** methods (the hard half)
Add a real Connect/gRPC-streaming transport to the client for the methods above. Options, cheapest-first:
1. **Connect streaming over HTTP/1.1** — ConnectRPC supports server-streaming over HTTP/1.1 with a length-prefixed envelope framing (not gRPC's HTTP/2). If the Tenki gateway accepts the Connect streaming protocol, we can implement the envelope reader over `fetch`'s `ReadableStream` body — **no new heavy dependency.** ⚠️ UNVERIFIED that the gateway accepts Connect-streaming; test with a raw `StreamCommandOutput` call first (this is the single gating experiment).
2. **Bundle `@connectrpc/connect-node` + generated protos** — guaranteed to work (it's what the SDK does) but pulls in a real dependency + a codegen step, and departs from the dependency-free design. Fall back to this only if (1) fails.
3. Interactive bidi (`Run`/`Dial`/tunnels) needs full duplex — realistically option 2 (connect-node) or a WebSocket bridge. Scope these AFTER server-stream (`StreamCommandOutput`) works, since they're the deepest.

**New tools this unlocks:** `tenki_stream_exec` (live stdout/stderr), `tenki_shell` (interactive), `tenki_tunnel` / `tenki_forward_port`, streaming file read/write for large payloads. Once `StreamCommandOutput` works, `exec`/`run_code` can drop the `sh -c` redirect capture hack and stream output directly.

## The gating experiment (do this first for workstream B)
```bash
# Does the gateway accept Connect server-streaming over HTTP/1.1?
# A 200 with a length-prefixed streaming body → option 1 works (fetch + envelope reader).
# A 415 / "HTTP/2 required" → only gRPC is exposed → option 2 (bundle connect-node).
curl -sN https://api.tenki.cloud/tenki.sandbox.v1.SandboxService/StreamCommandOutput \
  -H "Cookie: tenki_session=$TOKEN" -H "Content-Type: application/connect+json" \
  -H "Connect-Protocol-Version: 1" -d '{"sessionId":"…"}'
```

## Verification plan
- A: curl an SSE handshake; connect a real remote MCP client; assert tools/list + one tool/call over HTTP.
- B: on a live sandbox, `StreamCommandOutput` for a command that emits over time (e.g. `for i in 1..5; do echo $i; sleep 1; done`) and assert incremental frames; interactive `Run` with a stdin echo. Add to `scripts/verify-domains.mjs` behind a `--streaming` flag.

## Recommendation
Ship **A (HTTP transport)** as the next release — real value, low risk, fully verifiable. Treat **B (streaming)** as a spike: run the gating experiment, then decide option 1 vs 2. Do not ship B guessed/unverified — streaming bugs (hangs, backpressure, leaked connections) are worse than a missing feature.
