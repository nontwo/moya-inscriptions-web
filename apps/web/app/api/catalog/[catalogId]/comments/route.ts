import { readCommunitySessionToken } from "../../../../../lib/public-api/community-session-cookie";
import {
  createServerCatalogComment,
  fetchServerCatalogCommentPage,
} from "../../../../../lib/public-api/server";

export const runtime = "nodejs";

const allowedParameters = new Set(["page", "pageSize"]);
const maximumBodyBytes = 4_096;

const emptyResponse = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });

const jsonResponse = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

interface CommentRouteContext {
  params: Promise<{ catalogId: string }>;
}

const readQuery = (request: Request): Record<string, string> | null => {
  const parameters = new URL(request.url).searchParams;
  for (const name of parameters.keys()) {
    if (!allowedParameters.has(name) || parameters.getAll(name).length !== 1)
      return null;
  }
  return Object.fromEntries(parameters.entries());
};

export const GET = async (
  request: Request,
  context: CommentRouteContext,
): Promise<Response> => {
  const query = readQuery(request);
  if (query === null) return emptyResponse(400);
  const { catalogId } = await context.params;
  try {
    const result = await fetchServerCatalogCommentPage(catalogId, query);
    switch (result.state) {
      case "success":
        return jsonResponse(result.page, 200);
      case "invalid-query":
        return emptyResponse(400);
      case "not-found":
        return emptyResponse(404);
      case "unavailable":
        return emptyResponse(503);
      case "unexpected-error":
        return emptyResponse(502);
    }
  } catch {
    return emptyResponse(502);
  }
};

/** The session credential stays in the HttpOnly cookie; Web only relays it. */
export const POST = async (
  request: Request,
  context: CommentRouteContext,
): Promise<Response> => {
  const token = readCommunitySessionToken(request.headers.get("cookie"));
  if (token === undefined) return emptyResponse(401);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > maximumBodyBytes)
    return emptyResponse(422);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return emptyResponse(422);
  }
  const { catalogId } = await context.params;
  try {
    const result = await createServerCatalogComment(catalogId, token, body);
    switch (result.state) {
      case "success":
        // 202 keeps the author's pending submission truthful.
        return jsonResponse(result.item, result.awaitingApproval ? 202 : 201);
      case "unauthenticated":
        return emptyResponse(401);
      case "not-found":
        return emptyResponse(404);
      case "invalid-input":
        return emptyResponse(422);
      case "unavailable":
        return emptyResponse(503);
      case "unexpected-error":
        return emptyResponse(502);
    }
  } catch {
    return emptyResponse(502);
  }
};
