/**
 * tenki-mcp — Registry tools (custom sandbox images).
 *
 * The registry lets a workspace publish a sandbox's disk as a reusable custom
 * image (`<workspace>/<artifact>[:tag]`), resolve tags to pinned digests, control
 * public/private visibility, and share images across workspaces.
 *
 * ConnectRPC method names + request field shapes are ported from the
 * live-verified n8n community node and its research notes:
 *   - nodes/Tenki/resources/registry/*.ts
 *   - docs/research/rest-endpoints.md  ("Registry (custom sandbox images)")
 * Registry surface (control plane, tenki.sandbox.v1.SandboxService):
 *   PublishRegistryImage · GetRegistryImage · ListRegistryImages ·
 *   SetRegistryImageVisibility · DeleteRegistryImage · DeleteRegistryImageVersion ·
 *   ResolveRegistryRef · ShareImage · UnshareRegistryImage · ListRegistryShareGrants
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { TenkiClient } from "../client.js";
import { ok } from "./common.js";

export function registerRegistry(server: McpServer, client: TenkiClient): void {
	// ── Publish ─────────────────────────────────────────────────────────────────
	server.tool(
		"tenki_publish_image",
		"Publish a custom sandbox image into the workspace registry, optionally capturing a running sandbox's disk as the image contents.",
		{
			reference: z
				.string()
				.describe("Image reference in the form <workspace>/<artifact>[:tag], e.g. myws/myimage:latest."),
			source_session_id: z
				.string()
				.optional()
				.describe("Optional running sandbox whose disk is captured as the published image."),
			visibility: z
				.enum(["public", "private"])
				.optional()
				.describe("Whether the published image is publicly resolvable or workspace-only (default private)."),
			metadata: z.string().optional().describe("Optional free-form notes/metadata to attach to the image."),
		},
		async ({ reference, source_session_id, visibility, metadata }) =>
			ok(
				await client.control("PublishRegistryImage", {
					reference,
					...(source_session_id !== undefined ? { sessionId: source_session_id } : {}),
					...(visibility !== undefined ? { visibility } : {}),
					...(metadata !== undefined ? { metadata } : {}),
				}),
			),
	);

	// ── Get ─────────────────────────────────────────────────────────────────────
	server.tool(
		"tenki_get_image",
		"Retrieve one custom sandbox image from the registry by its reference.",
		{
			reference: z.string().describe("Image reference in the form <workspace>/<artifact>[:tag]."),
		},
		async ({ reference }) => ok(await client.control("GetRegistryImage", { reference })),
	);

	// ── List ────────────────────────────────────────────────────────────────────
	server.tool(
		"tenki_list_images",
		"List custom sandbox images in the registry, optionally filtered to a single workspace.",
		{
			workspace_id: z.string().optional().describe("Optional workspace to filter the listed images by."),
			page_size: z.number().int().positive().optional().describe("Max images to return per page."),
			page_token: z
				.string()
				.optional()
				.describe("Pagination token from a previous response's nextPageToken."),
		},
		async ({ workspace_id, page_size, page_token }) =>
			ok(
				await client.control("ListRegistryImages", {
					...(workspace_id !== undefined ? { workspaceId: workspace_id } : {}),
					...(page_size !== undefined ? { pageSize: page_size } : {}),
					...(page_token !== undefined ? { pageToken: page_token } : {}),
				}),
			),
	);

	// ── Set visibility ────────────────────────────────────────────────────────────
	server.tool(
		"tenki_set_image_visibility",
		"Make a custom sandbox image public (publicly resolvable) or private (restricted to the workspace).",
		{
			reference: z.string().describe("Image reference in the form <workspace>/<artifact>[:tag]."),
			visibility: z.enum(["public", "private"]).describe("Target visibility for the image."),
		},
		async ({ reference, visibility }) =>
			ok(await client.control("SetRegistryImageVisibility", { reference, visibility })),
	);

	// ── Delete (whole image, or a single version) ──────────────────────────────────
	server.tool(
		"tenki_delete_image",
		"Delete a custom sandbox image from the registry, or delete just a single version when a version is given.",
		{
			reference: z.string().describe("Image reference in the form <workspace>/<artifact>[:tag]."),
			version: z
				.string()
				.optional()
				.describe("Optional single version to delete; when set, only that version is removed instead of the whole image."),
		},
		async ({ reference, version }) =>
			ok(
				version !== undefined && version.trim() !== ""
					? await client.control("DeleteRegistryImageVersion", { reference, version })
					: await client.control("DeleteRegistryImage", { reference }),
			),
	);

	// ── Resolve ref ────────────────────────────────────────────────────────────────
	server.tool(
		"tenki_resolve_image_ref",
		"Resolve a registry reference (tag or ref) to its concrete pinned digest/ref.",
		{
			registry_ref: z
				.string()
				.describe("The registry reference to resolve, e.g. myws/myimage:latest."),
		},
		async ({ registry_ref }) =>
			ok(await client.control("ResolveRegistryRef", { registryRef: registry_ref })),
	);

	// ── Share ──────────────────────────────────────────────────────────────────────
	server.tool(
		"tenki_share_image",
		"Grant another workspace access to a custom sandbox image.",
		{
			reference: z.string().describe("Image reference in the form <workspace>/<artifact>[:tag]."),
			grantee_workspace_id: z.string().describe("The workspace to grant access to."),
		},
		async ({ reference, grantee_workspace_id }) =>
			ok(await client.control("ShareImage", { reference, granteeWorkspaceId: grantee_workspace_id })),
	);

	// ── Unshare (revoke a share) ────────────────────────────────────────────────────
	server.tool(
		"tenki_unshare_image",
		"Revoke a previously-granted share on a custom sandbox image, identified by either the grantee workspace or a specific grant ID.",
		{
			reference: z.string().describe("Image reference in the form <workspace>/<artifact>[:tag]."),
			grantee_workspace_id: z
				.string()
				.optional()
				.describe("Workspace whose access to revoke (provide this or grant_id)."),
			grant_id: z
				.string()
				.optional()
				.describe("Specific share grant to revoke (provide this or grantee_workspace_id)."),
		},
		async ({ reference, grantee_workspace_id, grant_id }) =>
			ok(
				await client.control("UnshareRegistryImage", {
					reference,
					...(grantee_workspace_id !== undefined ? { granteeWorkspaceId: grantee_workspace_id } : {}),
					...(grant_id !== undefined ? { grantId: grant_id } : {}),
				}),
			),
	);

	// ── List share grants ───────────────────────────────────────────────────────────
	server.tool(
		"tenki_list_image_share_grants",
		"List the share grants (workspaces granted access) on custom sandbox images, optionally for a single image.",
		{
			reference: z
				.string()
				.describe("Image reference to list grants for (required — the API needs a target image)."),
			page_size: z.number().int().positive().optional().describe("Max grants to return per page."),
			page_token: z
				.string()
				.optional()
				.describe("Pagination token from a previous response's nextPageToken."),
		},
		async ({ reference, page_size, page_token }) =>
			ok(
				// The API field is `ref` (not `reference`) and a target is required:
				// "exactly one of image_id or ref is required" (live-verified).
				await client.control("ListRegistryShareGrants", {
					ref: reference,
					...(page_size !== undefined ? { pageSize: page_size } : {}),
					...(page_token !== undefined ? { pageToken: page_token } : {}),
				}),
			),
	);

	server.tool(
		"tenki_revoke_image_share_grant",
		"Revoke a previously-granted share of a registry image, removing another workspace's access to it.",
		{
			reference: z.string().describe("The image reference whose share grant to revoke."),
			grantee_workspace_id: z.string().describe("The workspace whose access to revoke."),
		},
		async ({ reference, grantee_workspace_id }) =>
			ok(await client.control("RevokeRegistryShareGrant", { reference, granteeWorkspaceId: grantee_workspace_id })),
	);
}