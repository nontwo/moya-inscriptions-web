import { readCommunitySessionToken } from "../../../../lib/public-api/community-session-cookie";
import { fetchServerCurrentUser } from "../../../../lib/public-api/server";

export const runtime = "nodejs";

const emptyResponse = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/** Relays the HttpOnly session cookie to the Backend; the token never reaches the browser. */
export const GET = async (request: Request): Promise<Response> => {
  const token = readCommunitySessionToken(request.headers.get("cookie"));
  if (token === undefined) return emptyResponse(401);
  try {
    const result = await fetchServerCurrentUser(token);
    switch (result.state) {
      case "success":
        return Response.json(result.profile, {
          headers: { "Cache-Control": "no-store" },
        });
      case "unauthenticated":
        return emptyResponse(401);
      case "unavailable":
        return emptyResponse(503);
      case "unexpected-error":
        return emptyResponse(502);
    }
  } catch {
    return emptyResponse(502);
  }
};
