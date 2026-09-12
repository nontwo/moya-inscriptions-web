import {
  isSecureRequest,
  serializeCommunitySessionCookie,
} from "../../../../../lib/public-api/community-session-cookie";
import { signInServerDevelopmentAccount } from "../../../../../lib/public-api/server";

export const runtime = "nodejs";

const developmentEntryPath = "/dev/community";

const emptyResponse = (status: number) =>
  new Response(null, { status, headers: { "Cache-Control": "no-store" } });

const redirectToEntry = (notice: string, setCookie?: string) =>
  new Response(null, {
    status: 303,
    headers: {
      Location: `${developmentEntryPath}?notice=${notice}`,
      "Cache-Control": "no-store",
      ...(setCookie === undefined ? {} : { "Set-Cookie": setCookie }),
    },
  });

const wantsHtml = (request: Request): boolean =>
  (request.headers.get("accept") ?? "").includes("text/html");

/** The handle from a JSON body or the Development page's form; anything else is null. */
const readHandle = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.startsWith("application/json")) {
      const body: unknown = await request.json();
      return typeof body === "object" && body !== null && "handle" in body
        ? body.handle
        : null;
    }
    if (contentType.startsWith("application/x-www-form-urlencoded")) {
      return (await request.formData()).get("handle");
    }
  } catch {
    return null;
  }
  return null;
};

/** Development-only sign-in: unavailable in Production before any Backend call. */
export const POST = async (request: Request): Promise<Response> => {
  if (process.env.NODE_ENV !== "development") return emptyResponse(404);
  const html = wantsHtml(request);
  const handle = await readHandle(request);
  if (typeof handle !== "string")
    return html ? redirectToEntry("invalid-request") : emptyResponse(400);
  try {
    const result = await signInServerDevelopmentAccount(handle);
    switch (result.state) {
      case "success": {
        const cookie = serializeCommunitySessionCookie(
          result.session.token,
          new Date(result.session.expiresAt),
          isSecureRequest(request),
        );
        return html
          ? redirectToEntry("signed-in", cookie)
          : Response.json(result.session.profile, {
              status: 200,
              headers: { "Cache-Control": "no-store", "Set-Cookie": cookie },
            });
      }
      case "invalid-request":
        return html ? redirectToEntry("invalid-request") : emptyResponse(400);
      case "not-found":
        return html ? redirectToEntry("unknown-account") : emptyResponse(404);
      case "unavailable":
        return html ? redirectToEntry("unavailable") : emptyResponse(503);
      case "unexpected-error":
        return html ? redirectToEntry("error") : emptyResponse(502);
    }
  } catch {
    return html ? redirectToEntry("error") : emptyResponse(502);
  }
};
