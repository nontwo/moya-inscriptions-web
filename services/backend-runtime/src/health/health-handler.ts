import type { RequestListener } from "node:http";

import { getHealth } from "@moya/public-api";
import { noQueryTransportSchema } from "@moya/contracts/schemas";

import { sendApiError } from "../http/api-error-response.js";
import { sendJson } from "../http/json-response.js";
import { collectTransportQuery } from "../http/transport-query.js";

export type HealthReadinessCheck = () => Promise<void>;

export const healthHandler = async (
  request: Parameters<RequestListener>[0],
  response: Parameters<RequestListener>[1],
  readinessCheck: HealthReadinessCheck,
): Promise<void> => {
  const url = new URL(request.url ?? "/", "http://backend-runtime.local");
  try {
    noQueryTransportSchema.parse(collectTransportQuery(url.searchParams));
  } catch {
    sendApiError(response, "INVALID_QUERY", "Invalid health query");
    return;
  }

  try {
    await readinessCheck();
    sendJson(response, 200, getHealth());
  } catch {
    sendApiError(
      response,
      "SERVICE_UNAVAILABLE",
      "Service temporarily unavailable",
    );
  }
};
