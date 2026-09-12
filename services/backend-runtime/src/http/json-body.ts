import type { IncomingMessage } from "node:http";

export class JsonBodyError extends Error {
  override readonly name = "JsonBodyError";
}

const defaultMaximumBytes = 4_096;

/** Reads one bounded JSON request body; anything else is a client error. */
export const readJsonBody = async (
  request: IncomingMessage,
  maximumBytes = defaultMaximumBytes,
): Promise<unknown> => {
  const contentType = request.headers["content-type"] ?? "";
  if (!/^application\/json(?:\s*;.*)?$/i.test(contentType.trim()))
    throw new JsonBodyError("Request body must be application/json");
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    received += buffer.byteLength;
    if (received > maximumBytes)
      throw new JsonBodyError("Request body exceeds the allowed size");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new JsonBodyError("Request body is not valid JSON");
  }
};
