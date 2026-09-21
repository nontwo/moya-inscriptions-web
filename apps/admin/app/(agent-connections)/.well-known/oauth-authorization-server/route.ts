import { redirect } from "next/navigation";

import { authorizationServerMetadataUrl } from "../../../../src/agent-connections/discovery";

/**
 * Where the authorization server's metadata really is.
 *
 * RFC 8414 puts this document on the ISSUER, and ours is a different origin.
 * Some clients — Cursor among them — look for it on the MCP server's own
 * origin instead. Copying the issuer's document under this host would serve a
 * document whose `issuer` disagrees with the URL it came from, and a strict
 * client would be right to reject that, so this redirects to the real one and
 * lets the issuer stay authoritative about itself.
 */
export const dynamic = "force-dynamic";

export const GET = (): Response => {
  const target = authorizationServerMetadataUrl();
  if (target === null) return new Response(null, { status: 404 });
  redirect(target);
};
