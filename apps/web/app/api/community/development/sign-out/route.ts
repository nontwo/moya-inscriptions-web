import {
  isSecureRequest,
  readCommunitySessionToken,
  serializeClearedCommunitySessionCookie,
} from "../../../../../lib/public-api/community-session-cookie";
import { signOutServerDevelopmentSession } from "../../../../../lib/public-api/server";

export const runtime = "nodejs";

const developmentEntryPath = "/dev/community";

const respond = (status: number, setCookie?: string) =>
  new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(setCookie === undefined ? {} : { "Set-Cookie": setCookie }),
    },
  });

const redirectToEntry = (notice: string, setCookie?: string) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: `${developmentEntryPath}?notice=${notice}`,
      "Cache-Control": "no-store",
      ...(setCookie === undefined ? {} : { "Set-Cookie": setCookie }),
    },
  });

/** Development-only sign-out: the Backend revokes the session, then the cookie is cleared. */
export const POST = async (request: Request): Promise<Response> => {
  if (process.env.NODE_ENV !== "development") return respond(404);
  const html = (request.headers.get("accept") ?? "").includes("text/html");
  const cleared = serializeClearedCommunitySessionCookie(
    isSecureRequest(request),
  );
  const token = readCommunitySessionToken(request.headers.get("cookie"));
  if (token === undefined)
    return html
      ? redirectToEntry("signed-out", cleared)
      : respond(204, cleared);
  try {
    const result = await signOutServerDevelopmentSession(token);
    switch (result.state) {
      case "success":
      case "unauthenticated":
        // Either the Backend revoked the session or it was already inactive.
        return html
          ? redirectToEntry("signed-out", cleared)
          : respond(204, cleared);
      case "unavailable":
        // Keep the cookie: the server-side session was not revoked.
        return html ? redirectToEntry("unavailable") : respond(503);
      case "unexpected-error":
        return html ? redirectToEntry("error") : respond(502);
    }
  } catch {
    return html ? redirectToEntry("error") : respond(502);
  }
};
