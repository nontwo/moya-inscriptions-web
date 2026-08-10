import type { OutgoingHttpHeaders, ServerResponse } from "node:http";

export const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: OutgoingHttpHeaders = {},
): void => {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-length": Buffer.byteLength(payload),
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(payload);
};
