import type { ServerResponse } from "node:http";

/**
 * Decodes one URL path segment. A malformed percent-encoding is a client
 * error, not a server failure: the raw segment is returned instead, which no
 * identifier schema accepts, so the caller's existing validation refuses it
 * truthfully (a refusal status, never a thrown URIError).
 */
export const decodePathSegment = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch (error) {
    if (error instanceof URIError) return segment;
    throw error;
  }
};

/**
 * Route handlers answer their own failures. The router starts each handler
 * without awaiting it, so a handler that still rejects would become an
 * unhandled rejection and stop the whole process. This fails only that
 * request: a bounded error response when nothing was sent yet, otherwise the
 * connection is closed. The log line names the error class and code, never
 * the request, its body or the error text.
 */
export const containRequest = (
  response: ServerResponse,
  handling: Promise<unknown>,
  fail: (response: ServerResponse) => void,
): void => {
  handling.catch((error: unknown) => {
    const name = error instanceof Error ? error.name : typeof error;
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "none";
    console.error(
      `[backend-runtime] route handler rejected (${name}, code ${code}); the request failed`,
    );
    if (response.headersSent) {
      response.destroy();
      return;
    }
    try {
      fail(response);
    } catch {
      response.destroy();
    }
  });
};
