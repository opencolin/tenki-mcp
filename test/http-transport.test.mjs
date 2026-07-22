/**
 * v2 HTTP transport test: start tenki-mcp in HTTP mode, connect with the official
 * MCP Streamable-HTTP client, and drive tools/list + a tool call over HTTP —
 * proving the server is hostable, not just local-stdio.
 *
 *   npm run build && TENKI_API_KEY=… node test/http-transport.test.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function loadToken() {
	if (process.env.TENKI_API_KEY) return process.env.TENKI_API_KEY;
	if (process.env.TENKI_AUTH_TOKEN) return process.env.TENKI_AUTH_TOKEN;
	try {
		return (readFileSync(`${homedir()}/.config/tenki/config.yaml`, "utf8").match(/^auth_token:\s*(.+)$/m)?.[1] ?? "").trim();
	} catch {
		return "";
	}
}

const token = loadToken();
if (!token) {
	console.error("No token. Set TENKI_API_KEY or run `tenki login`.");
	process.exit(1);
}

const SERVER = join(dirname(dirname(fileURLToPath(import.meta.url))), "dist", "index.js");
const PORT = 39217;

// Start the server in HTTP mode and wait for its banner.
const child = spawn(process.execPath, [SERVER], {
	env: { ...process.env, TENKI_MCP_TRANSPORT: "http", PORT: String(PORT), TENKI_API_KEY: token },
	stdio: ["ignore", "pipe", "pipe"],
});
let pass = 0, fail = 0;
const done = (code) => {
	try {
		child.kill("SIGTERM");
	} catch {
		/* ignore */
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(code);
};

async function waitForBanner(timeoutMs = 8000) {
	return new Promise((resolve, reject) => {
		let buf = "";
		const t = setTimeout(() => reject(new Error("server did not start in time")), timeoutMs);
		child.stderr.on("data", (d) => {
			buf += d.toString();
			if (buf.includes("running on http")) {
				clearTimeout(t);
				resolve();
			}
		});
		child.on("exit", (c) => {
			clearTimeout(t);
			reject(new Error(`server exited early (${c}): ${buf.slice(0, 200)}`));
		});
	});
}

try {
	await waitForBanner();
	console.log(`  ✓ server started in HTTP mode on :${PORT}`);
	pass++;

	const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/mcp`));
	const client = new Client({ name: "http-test", version: "1.0.0" });
	await client.connect(transport);
	console.log("  ✓ connected over Streamable HTTP");
	pass++;

	const { tools } = await client.listTools();
	if (tools.length < 80) throw new Error(`expected 84 tools, got ${tools.length}`);
	console.log(`  ✓ tools/list over HTTP → ${tools.length} tools`);
	pass++;

	const res = await client.callTool({ name: "tenki_whoami", arguments: {} });
	const j = JSON.parse(res.content?.find((c) => c.type === "text")?.text ?? "{}");
	if (j.ownerType !== "USER") throw new Error(`whoami over HTTP unexpected: ${JSON.stringify(j).slice(0, 80)}`);
	console.log("  ✓ tools/call tenki_whoami over HTTP → authenticated");
	pass++;

	await client.close();
	console.log("  ✓ clean client close");
	pass++;
	done(0);
} catch (e) {
	console.error("  ✗ " + (e?.message ?? e));
	fail++;
	done(1);
}
