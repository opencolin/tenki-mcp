/**
 * previews.ts — port preview-URL tools for tenki-mcp.
 *
 * Covers the preview / exposure-teardown half of Tenki's Port resource:
 * removing an inbound exposure (UnexposePort) and the preview-URL lifecycle
 * (CreatePreviewUrl, OpenPreview, ListPreviewUrls). Port *exposure* itself
 * (ExposePort / ListExposedPorts) lives in ports.ts and is not re-implemented here.
 *
 * All control-plane ConnectRPC calls on tenki.sandbox.v1.SandboxService.
 *
 * LIVE-VERIFIED shapes (2026-07-20): the preview-URL methods are PROJECT-scoped —
 * the server rejects them with `project_id: value is empty` unless a projectId is
 * sent, and CreatePreviewUrl additionally requires a `slug` (>=3 chars, [a-z0-9-]).
 * projectId defaults to the API key's first project; override with project_id.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TenkiClient } from "../client.js";
import { ok } from "./common.js";

const portSchema = z.number().int().min(1).max(65535);
const slugSchema = z
	.string()
	.min(3)
	.max(63)
	.regex(/^[a-z0-9-]+$/, "lowercase letters, digits, and hyphens only")
	.describe("Subdomain slug for the preview URL (>=3 chars, lowercase letters/digits/hyphens).");

export function registerPreviews(server: McpServer, client: TenkiClient): void {
	// ── Unexpose a port (tear down its exposure + preview) ────────────────────────
	server.tool(
		"tenki_unexpose_port",
		"Remove an inbound port exposure from a sandbox, taking its public URL/preview offline. Use this to un-publish a port previously exposed with tenki_expose_port.",
		{
			session_id: z.string().describe("The sandbox session whose port to unexpose."),
			port: portSchema.describe("The TCP port inside the sandbox to unexpose (1-65535)."),
		},
		async ({ session_id, port }) => ok(await client.control("UnexposePort", { sessionId: session_id, port })),
	);

	// ── Create a shareable preview URL for a port ─────────────────────────────────
	server.tool(
		"tenki_create_preview_url",
		"Create a shareable public preview URL for a port in a sandbox. The sandbox must have inbound networking enabled (create it with allow_inbound). Project-scoped; defaults to the key's first project.",
		{
			session_id: z.string().describe("The sandbox session serving the port."),
			port: portSchema.describe("The TCP port inside the sandbox to create a preview URL for (1-65535)."),
			slug: slugSchema,
			project_id: z.string().optional().describe("Project the preview URL belongs to (defaults to the key's first project)."),
			expires_at: z
				.string()
				.optional()
				.describe("Optional RFC-3339 timestamp at which the preview URL auto-expires. Omit to keep it until the sandbox ends."),
		},
		async ({ session_id, port, slug, project_id, expires_at }) => {
			const projectId = project_id ?? (await client.resolveOwner()).projectId;
			return ok(
				await client.control("CreatePreviewUrl", {
					sessionId: session_id,
					port,
					slug,
					...(projectId ? { projectId } : {}),
					...(expires_at !== undefined ? { expiresAt: expires_at } : {}),
				}),
			);
		},
	);

	// ── Open (get) a live preview for a port ──────────────────────────────────────
	server.tool(
		"tenki_open_preview",
		"Open (get) a live preview for a port in a sandbox and return its preview URL. The sandbox must have inbound networking enabled (allow_inbound).",
		{
			session_id: z.string().describe("The sandbox session serving the port."),
			port: portSchema.describe("The TCP port inside the sandbox to open a preview for (1-65535)."),
			project_id: z.string().optional().describe("Project scope (defaults to the key's first project)."),
			expires_at: z
				.string()
				.optional()
				.describe("Optional RFC-3339 timestamp at which the preview auto-expires. Omit to keep it until the sandbox ends."),
		},
		async ({ session_id, port, project_id, expires_at }) => {
			const projectId = project_id ?? (await client.resolveOwner()).projectId;
			return ok(
				await client.control("OpenPreview", {
					sessionId: session_id,
					port,
					...(projectId ? { projectId } : {}),
					...(expires_at !== undefined ? { expiresAt: expires_at } : {}),
				}),
			);
		},
	);

	// ── List the preview URLs bound to a sandbox / project ────────────────────────
	server.tool(
		"tenki_list_preview_urls",
		"List preview URLs in a project (defaults to the key's first project), optionally filtered to one sandbox.",
		{
			session_id: z.string().optional().describe("Optional: filter to preview URLs for this sandbox session."),
			project_id: z.string().optional().describe("Project to list (defaults to the key's first project)."),
		},
		async ({ session_id, project_id }) => {
			const projectId = project_id ?? (await client.resolveOwner()).projectId;
			return ok(
				await client.control("ListPreviewUrls", {
					...(projectId ? { projectId } : {}),
					...(session_id ? { sessionId: session_id } : {}),
				}),
			);
		},
	);
}
