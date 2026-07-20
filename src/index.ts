#!/usr/bin/env node
/**
 * tenki-mcp — a Model Context Protocol server for Tenki Cloud.
 *
 * Exposes Tenki's sandbox platform (disposable microVMs for AI agents) as MCP
 * tools, so any agent — Claude, Codex, Cursor — can create sandboxes, run code,
 * manage files/snapshots/volumes/templates/images, run git, and expose preview URLs.
 *
 * Tools live in self-registering modules under ./tools; this file wires the client,
 * registers each module, and connects the stdio transport.
 *
 * Auth: set TENKI_API_KEY (or TENKI_AUTH_TOKEN) in the environment.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TenkiClient } from "./client.js";
import { registerIdentity } from "./tools/identity.js";
import { registerRun } from "./tools/run.js";
import { registerSandboxes } from "./tools/sandboxes.js";
import { registerExec } from "./tools/exec.js";
import { registerFiles } from "./tools/files.js";
import { registerGit } from "./tools/git.js";
import { registerPorts } from "./tools/ports.js";
import { registerFilesOps } from "./tools/files_ops.js";
import { registerSessionsAdmin } from "./tools/sessions_admin.js";
import { registerPreviews } from "./tools/previews.js";

const token = process.env.TENKI_AUTH_TOKEN || process.env.TENKI_API_KEY;
if (!token) {
	console.error("tenki-mcp: set TENKI_API_KEY (or TENKI_AUTH_TOKEN) in the environment.");
	process.exit(1);
}
const baseUrl = process.env.TENKI_API_ENDPOINT || process.env.TENKI_API_URL || undefined;
const client = new TenkiClient(token, baseUrl);

const server = new McpServer({ name: "tenki", version: "0.4.0" });

/** Every tool module registers here. Add new domains to this list. */
const modules = [
	registerIdentity,
	registerRun,
	registerSandboxes,
	registerExec,
	registerFiles,
	registerGit,
	registerPorts,
	registerFilesOps,
	registerSessionsAdmin,
	registerPreviews,
];
for (const register of modules) register(server, client);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("tenki-mcp running on stdio");
}

main().catch((err) => {
	console.error("tenki-mcp fatal:", err);
	process.exit(1);
});
