/**
 * HTTP/SSE transport for tenki-mcp (v2.0) — makes the server hostable, not just
 * local-stdio. Uses the MCP SDK's StreamableHTTPServerTransport with a stateful
 * per-session model: one server + transport per MCP session (created on the
 * initialize request, torn down on close).
 *
 * Enable with TENKI_MCP_TRANSPORT=http and PORT (default 3000). Endpoint: /mcp.
 * v2.0.0-alpha uses a single shared TENKI_API_KEY from the environment for all
 * sessions; per-request auth (multi-tenant hosting) is a later, decision-gated step.
 */
import http from "node:http";
import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import type { TenkiClient } from "./client.js";
import { createServer } from "./server.js";

function readJson(req: http.IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (c) => (data += c));
		req.on("end", () => {
			try {
				resolve(data ? JSON.parse(data) : undefined);
			} catch (e) {
				reject(e);
			}
		});
		req.on("error", reject);
	});
}

export function startHttp(client: TenkiClient, port: number): http.Server {
	const transports: Record<string, StreamableHTTPServerTransport> = {};

	const httpServer = http.createServer(async (req, res) => {
		try {
			const url = new URL(req.url || "/", "http://localhost");
			if (url.pathname !== "/mcp") {
				res.writeHead(404, { "Content-Type": "text/plain" }).end("not found — MCP endpoint is /mcp");
				return;
			}
			const sessionId = req.headers["mcp-session-id"] as string | undefined;

			if (req.method === "POST") {
				const body = await readJson(req);
				let transport = sessionId ? transports[sessionId] : undefined;
				if (!transport && isInitializeRequest(body)) {
					transport = new StreamableHTTPServerTransport({
						sessionIdGenerator: () => randomUUID(),
						onsessioninitialized: (id) => {
							transports[id] = transport as StreamableHTTPServerTransport;
						},
					});
					transport.onclose = () => {
						const id = transport?.sessionId;
						if (id) delete transports[id];
					};
					await createServer(client).connect(transport);
				}
				if (!transport) {
					res.writeHead(400, { "Content-Type": "application/json" }).end(
						JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session; send an initialize request first." }, id: null }),
					);
					return;
				}
				await transport.handleRequest(req, res, body);
				return;
			}

			// GET opens the SSE stream; DELETE ends a session.
			if (req.method === "GET" || req.method === "DELETE") {
				const transport = sessionId ? transports[sessionId] : undefined;
				if (!transport) {
					res.writeHead(400, { "Content-Type": "text/plain" }).end("No session for the given mcp-session-id.");
					return;
				}
				await transport.handleRequest(req, res);
				return;
			}

			res.writeHead(405, { "Content-Type": "text/plain" }).end("method not allowed");
		} catch (e) {
			if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
			res.end(`internal error: ${(e as Error).message}`);
		}
	});

	httpServer.listen(port, () => {
		console.error(`tenki-mcp running on http://localhost:${port}/mcp (Streamable HTTP)`);
	});
	return httpServer;
}
