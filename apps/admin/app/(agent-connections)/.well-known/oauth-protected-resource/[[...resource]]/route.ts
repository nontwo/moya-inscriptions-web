import { protectedResourceMetadata } from "../../../../../src/agent-connections/discovery";

/**
 * RFC 9728 protected-resource metadata for the MCP endpoint.
 *
 * A Next route rather than a Payload endpoint, because Payload prefixes every
 * endpoint path with `/api` and this document has a fixed well-known location.
 *
 * An OPTIONAL catch-all so both spellings work from one handler: the bare
 * `/.well-known/oauth-protected-resource`, and RFC 9728's path-aware form
 * where the resource's own path is appended —
 * `/.well-known/oauth-protected-resource/api/mcp`. The second is what the
 * `WWW-Authenticate` header points at, and a client that follows the header
 * must not land on a 404.
 *
 * A suffix that is not this resource's path is a 404 rather than the metadata:
 * answering for a path we do not serve would be claiming to be the resource
 * server for something we are not.
 */
export const dynamic = "force-dynamic";

export const GET = async (
  _request: Request,
  context: { params: Promise<{ resource?: string[] }> },
): Promise<Response> => {
  const metadata = protectedResourceMetadata();
  if (metadata === null) return new Response(null, { status: 404 });
  const { resource } = await context.params;
  if (resource !== undefined && resource.length > 0) {
    const asked = `/${resource.join("/")}`;
    if (asked !== new URL(metadata.resource).pathname)
      return new Response(null, { status: 404 });
  }
  return Response.json(metadata, { headers: { "cache-control": "no-store" } });
};
