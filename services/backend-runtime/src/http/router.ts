import type { RequestListener } from "node:http";

import { healthHandler } from "../health/health-handler.js";
import { sendJson } from "./json-response.js";

const sendRouteError = (
  response: Parameters<RequestListener>[1],
  status: 404 | 405,
  message: "Method Not Allowed" | "Not Found",
): void => {
  sendJson(
    response,
    status,
    { error: { status, message } },
    status === 405 ? { allow: "GET" } : {},
  );
};

export const createRouter = (): RequestListener => (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://backend-runtime.local")
    .pathname;

  if (pathname !== "/health") {
    sendRouteError(response, 404, "Not Found");
    return;
  }

  if (request.method !== "GET") {
    sendRouteError(response, 405, "Method Not Allowed");
    return;
  }

  healthHandler(request, response);
};
