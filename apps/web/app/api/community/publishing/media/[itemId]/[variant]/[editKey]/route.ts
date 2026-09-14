import { relayServerPublishingMedia } from "../../../../../../../../lib/public-api/server";

export const runtime = "nodejs";

interface MediaRouteContext {
  params: Promise<{ itemId: string; variant: string; editKey: string }>;
}

/** Development-only streaming relay for one private derivative (Range aware). */
export const GET = async (
  request: Request,
  context: MediaRouteContext,
): Promise<Response> => {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, no-store", vary: "Cookie" },
    });
  const { itemId, variant, editKey } = await context.params;
  return relayServerPublishingMedia(request, itemId, variant, editKey);
};
