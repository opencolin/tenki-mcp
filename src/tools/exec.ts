import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TenkiClient } from "../client.js";
import { ok, envSchema } from "./common.js";

/** Command execution inside an existing sandbox. */
export function registerExec(server: McpServer, client: TenkiClient): void {
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
}
