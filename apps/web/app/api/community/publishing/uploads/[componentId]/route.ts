import { relayServerPublishingUpload } from "../../../../../../lib/public-api/server";

export const runtime = "nodejs";

interface UploadRouteContext {
  params: Promise<{ componentId: string }>;
}

/** Development-only streaming relay for one media component (raw bytes, POST only). */
export const POST = async (
  request: Request,
  context: UploadRouteContext,
): Promise<Response> => {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, no-store", vary: "Cookie" },
    });
  const { componentId } = await context.params;
  return relayServerPublishingUpload(request, componentId);
};
