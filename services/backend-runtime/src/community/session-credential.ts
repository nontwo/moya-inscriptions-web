import type { IncomingMessage } from "node:http";

const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;

/** The opaque bearer credential relayed by Web; anything else is unauthenticated. */
export const readBearerToken = (
  request: IncomingMessage,
): string | undefined => {
  const header = request.headers.authorization;
  if (typeof header !== "string") return undefined;
  return bearerPattern.exec(header)?.[1];
};
