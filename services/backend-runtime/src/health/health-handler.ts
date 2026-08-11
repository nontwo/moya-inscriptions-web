import type { RequestListener } from "node:http";

import { getHealth } from "@moya/public-api";

import { sendApiError } from "../http/api-error-response.js";
import { sendJson } from "../http/json-response.js";

export type HealthReadinessCheck = () => Promise<void>;

export const healthHandler = async (
  _request: Parameters<RequestListener>[0],
  response: Parameters<RequestListener>[1],
  readinessCheck: HealthReadinessCheck,
): Promise<void> => {
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
