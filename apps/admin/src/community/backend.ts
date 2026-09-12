import { APIError } from "payload";

/**
 * The Owner's Payload Admin is only a client of the Backend operator boundary:
 * it holds the credential server-side, never in the browser, and never touches
 * community tables itself. The Backend stays the sole writer.
 */

export class CommunityOperatorError extends APIError {
  readonly code: string;

  constructor(code: string, status = 400) {
    super(code, status, { code }, true);
    this.code = code;
  }
}

/**
 * A dedicated variable, never the public Backend base URL: the operator
 * credential must not follow a value that could legitimately point off-box.
 */
const operatorBaseUrlVariable = "COMMUNITY_OPERATOR_BASE_URL" as const;
const operatorTokenVariable = "COMMUNITY_OPERATOR_TOKEN" as const;

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The boundary is reached over loopback only, whatever the scheme. */
const operatorBaseUrl = (): URL => {
  const value = process.env[operatorBaseUrlVariable];
  if (value === undefined || value === "")
    throw new CommunityOperatorError("OPERATOR_NOT_CONFIGURED", 503);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CommunityOperatorError("OPERATOR_NOT_CONFIGURED", 503);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    !loopbackHosts.has(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  )
    throw new CommunityOperatorError("OPERATOR_NOT_CONFIGURED", 503);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
};

const operatorToken = (): string => {
  const value = process.env[operatorTokenVariable];
  if (value === undefined || value === "")
    throw new CommunityOperatorError("OPERATOR_NOT_CONFIGURED", 503);
  return value;
};

const statusCode = (status: number): number =>
  status === 404
    ? 404
    : status === 409
      ? 409
      : status === 400
        ? 400
        : status === 503
          ? 503
          : 502;

/**
 * The Backend's bare codes become Admin codes the view can explain: a stale
 * state is a conflict to refresh from, an unknown subject is gone, an
 * unavailable store is a retry later; anything else is a plain failure.
 */
const operatorFailureCode = (status: number): string =>
  status === 401
    ? "OPERATOR_UNAUTHORIZED"
    : status === 404
      ? "NOT_FOUND"
      : status === 409
        ? "STATE_CONFLICT"
        : status === 503
          ? "OPERATOR_UNAVAILABLE"
          : "OPERATION_FAILED";

export const callCommunityOperator = async <Result>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
): Promise<Result> => {
  const url = new URL(`internal/community/${path}`, operatorBaseUrl());
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${operatorToken()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    // Never surface the URL, the credential or a driver message.
    throw new CommunityOperatorError("OPERATOR_UNREACHABLE", 502);
  }
  if (!response.ok)
    throw new CommunityOperatorError(
      operatorFailureCode(response.status),
      statusCode(response.status),
    );
  return (await response.json()) as Result;
};
