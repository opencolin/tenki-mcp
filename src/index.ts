#!/usr/bin/env node
/**
 * tenki-mcp — a Model Context Protocol server for Tenki Cloud.
 *
 * Exposes Tenki's sandbox platform (disposable microVMs for AI agents) as MCP
 * tools, so any agent — Claude, Codex, Cursor — can create sandboxes, run code,
 * read/write files, run git, and expose preview URLs natively.
 *
 * Auth: set TENKI_API_KEY (a `tk_…` key) in the environment.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { TenkiClient, type Language } from "./client.js";

const token = process.env.TENKI_AUTH_TOKEN || process.env.TENKI_API_KEY;
if (!token) {
	console.error("tenki-mcp: set TENKI_API_KEY (a tk_… key) in the environment.");
	process.exit(1);
}
const baseUrl = process.env.TENKI_API_ENDPOINT || process.env.TENKI_API_URL || undefined;
const client = new TenkiClient(token, baseUrl);

const server = new McpServer({ name: "tenki", version: "0.1.0" });

/** Wrap a handler so its return value is serialized as MCP text content. */
const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

const envSchema = z
	.record(z.string())
	.optional()
	.describe("Environment variables as a key→value object.");

// ── Identity ────────────────────────────────────────────────────────────────
server.tool("tenki_whoami", "Return the identity and workspaces for the current API key. Cheap credential test.", {}, async () =>
	ok(await client.control("WhoAmI", {})),
);

// ── Run code (the headline agent tool) ───────────────────────────────────────
server.tool(
	"tenki_run_code",
	"Boot a throwaway microVM, run a snippet (shell/python/javascript), return its stdout/stderr/exit code, and tear the sandbox down. Cost-guarded and self-terminating. Use this for one-shot execution when you don't need a persistent sandbox.",
	{
		language: z.enum(["shell", "python", "javascript"]).describe("Interpreter for the snippet."),
		code: z.string().describe("The code to run."),
		env: envSchema,
		timeout_seconds: z.number().int().positive().optional().describe("Max seconds for the run (default 30)."),
	},
	async ({ language, code, env, timeout_seconds }) =>
		ok(await client.runCode(language as Language, code, { env, timeoutSeconds: timeout_seconds })),
);

// ── Sandbox lifecycle ─────────────────────────────────────────────────────────
server.tool(
	"tenki_create_sandbox",
	"Create a persistent sandbox microVM. Returns the session (id, state) and its data-plane endpoint. Boots in ~2s. Use tenki_exec / tenki_read_file / tenki_write_file against the returned session_id.",
	{
		name: z.string().optional().describe("Human-readable name."),
		cpu_cores: z.number().int().min(1).max(16).optional().describe("vCPUs (default 2)."),
		memory_mb: z.number().int().min(128).max(65536).optional().describe("Memory in MB (default 4096)."),
		disk_size_gb: z.number().int().positive().optional().describe("Disk in GB (default 5)."),
		max_duration_seconds: z.number().int().positive().optional().describe("Hard lifetime cap in seconds."),
		idle_timeout_minutes: z.number().int().positive().optional().describe("Reap after N idle minutes."),
		clone_repo_url: z.string().optional().describe("Git URL to clone into the sandbox on boot."),
		allow_outbound: z.boolean().optional().describe("Allow outbound networking (off by default)."),
		allow_inbound: z.boolean().optional().describe("Allow inbound networking (off by default)."),
		snapshot_id: z.string().optional().describe("Boot from a snapshot."),
		registry_ref: z.string().optional().describe("Boot from a custom registry image."),
		tags: z.array(z.string()).optional().describe("Tags for later filtering."),
		env: envSchema,
		wait_ready: z.boolean().optional().describe("Poll until the sandbox is RUNNING before returning (default true)."),
	},
	async (a) => {
		const owner = await client.resolveOwner();
		const body: Record<string, unknown> = {
			...(owner.ownerType ? { ownerType: owner.ownerType } : {}),
			...(owner.ownerId ? { ownerId: owner.ownerId } : {}),
			...(owner.workspaceId ? { workspaceId: owner.workspaceId } : {}),
			...(a.name ? { name: a.name } : {}),
			...(a.cpu_cores ? { cpuCores: a.cpu_cores } : {}),
			...(a.memory_mb ? { memoryMb: a.memory_mb } : {}),
			...(a.disk_size_gb ? { diskSizeGb: a.disk_size_gb } : {}),
			...(a.max_duration_seconds ? { maxDuration: `${a.max_duration_seconds}s` } : {}),
			...(a.idle_timeout_minutes ? { idleTimeoutMinutes: a.idle_timeout_minutes } : {}),
			...(a.clone_repo_url ? { cloneRepoUrl: a.clone_repo_url } : {}),
			...(a.allow_outbound ? { allowOutbound: true } : {}),
			...(a.allow_inbound ? { allowInbound: true } : {}),
			...(a.snapshot_id ? { snapshotId: a.snapshot_id } : {}),
			...(a.registry_ref ? { registryRef: a.registry_ref } : {}),
			...(a.tags && a.tags.length ? { tags: a.tags } : {}),
			...(a.env && Object.keys(a.env).length ? { env: a.env } : {}),
		};
		const resp = await client.control("CreateSession", body);
		const session = resp.session ?? resp;
		const sessionId = session.id ?? resp.sessionId;
		const dataPlaneEndpoint = resp.dataPlaneEndpoint ?? resp.data_plane_endpoint;
		const wait = a.wait_ready !== false;
		const finalSession = wait && sessionId ? await client.waitForState(sessionId, "RUNNING") : session;
		return ok({ session: finalSession, dataPlaneEndpoint });
	},
);

server.tool(
	"tenki_get_sandbox",
	"Fetch a sandbox's current state and metadata.",
	{ session_id: z.string() },
	async ({ session_id }) => ok(await client.control("GetSession", { sessionId: session_id })),
);

server.tool(
	"tenki_list_sandboxes",
	"List sandboxes for the workspace.",
	{
		include_terminated: z.boolean().optional().describe("Include terminated sandboxes (default false)."),
		page_size: z.number().int().positive().optional(),
		page_token: z.string().optional(),
	},
	async ({ include_terminated, page_size, page_token }) =>
		ok(
			await client.control("ListSessions", {
				...(include_terminated ? { includeTerminated: true } : {}),
				...(page_size ? { pageSize: page_size } : {}),
				...(page_token ? { pageToken: page_token } : {}),
			}),
		),
);

server.tool(
	"tenki_terminate_sandbox",
	"Terminate (destroy) a sandbox. The microVM and its filesystem are gone after this.",
	{ session_id: z.string() },
	async ({ session_id }) => ok(await client.control("TerminateSession", { sessionId: session_id })),
);

server.tool(
	"tenki_pause_sandbox",
	"Pause a sandbox (snapshot + suspend) so it can be resumed later.",
	{ session_id: z.string() },
	async ({ session_id }) => ok(await client.control("PauseSession", { sessionId: session_id })),
);

server.tool(
	"tenki_resume_sandbox",
	"Resume a previously paused sandbox.",
	{ session_id: z.string() },
	async ({ session_id }) => ok(await client.control("ResumeSession", { sessionId: session_id })),
);

// ── Command execution ─────────────────────────────────────────────────────────
server.tool(
	"tenki_exec",
	"Run a command in an existing sandbox and return stdout, stderr, and exit code inline.",
	{
		session_id: z.string(),
		command: z.string().describe("Executable, e.g. 'npm' or 'python3'."),
		args: z.array(z.string()).optional().describe("Arguments."),
		cwd: z.string().optional().describe("Working directory (honored in-script)."),
		env: envSchema,
		timeout_seconds: z.number().int().positive().optional(),
	},
	async ({ session_id, command, args, cwd, env, timeout_seconds }) =>
		ok(await client.execCaptured(session_id, command, { args, cwd, env, timeoutSeconds: timeout_seconds })),
);

// ── Files (data plane) ────────────────────────────────────────────────────────
server.tool(
	"tenki_read_file",
	"Read a UTF-8 text file from a sandbox (paths under /home/tenki).",
	{ session_id: z.string(), path: z.string() },
	async ({ session_id, path }) => ok({ path, content: await client.readTextFile(session_id, path) }),
);

server.tool(
	"tenki_write_file",
	"Write a UTF-8 text file to a sandbox (paths under /home/tenki).",
	{ session_id: z.string(), path: z.string(), content: z.string() },
	async ({ session_id, path, content }) => ok(await client.writeTextFile(session_id, path, content)),
);

server.tool(
	"tenki_list_files",
	"List a directory in a sandbox.",
	{ session_id: z.string(), path: z.string().describe("Directory path, e.g. /home/tenki") },
	async ({ session_id, path }) => ok(await client.data(session_id, "List", { path })),
);

// ── Git ───────────────────────────────────────────────────────────────────────
server.tool(
	"tenki_git",
	"Run a git operation in a sandbox (clone, checkout, diff, log, status, add, commit, pull, push, fetchPR). Args are passed as a key→value map.",
	{
		session_id: z.string(),
		operation: z.string().describe("e.g. 'clone', 'checkout', 'commit', 'push', 'fetchPR'."),
		args: z.record(z.string()).optional().describe("Operation args as a key→value object."),
	},
	async ({ session_id, operation, args }) =>
		ok(await client.control("GitOperation", { sessionId: session_id, operation, ...(args ? { args } : {}) })),
);

// ── Ports / preview URLs ────────────────────────────────────────────────────────
server.tool(
	"tenki_expose_port",
	"Expose a port from a sandbox and get a public preview URL. Useful when an agent starts a web server it wants to show.",
	{ session_id: z.string(), port: z.number().int().positive(), slug: z.string().optional() },
	async ({ session_id, port, slug }) =>
		ok(await client.control("ExposePort", { sessionId: session_id, port, ...(slug ? { slug } : {}) })),
);

server.tool(
	"tenki_list_exposed_ports",
	"List the ports currently exposed from a sandbox.",
	{ session_id: z.string() },
	async ({ session_id }) => ok(await client.control("ListExposedPorts", { sessionId: session_id })),
);

// ── Boot ────────────────────────────────────────────────────────────────────
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("tenki-mcp running on stdio");
}

main().catch((err) => {
	console.error("tenki-mcp fatal:", err);
	process.exit(1);
});
