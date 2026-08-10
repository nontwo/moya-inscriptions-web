import { randomUUID } from "node:crypto";

import { apiErrorSchema } from "@moya/contracts/schemas";

import { sendJson } from "./json-response.js";

import type { ApiErrorCode } from "@moya/contracts";
import type { ServerResponse } from "node:http";

const statusByErrorCode = {
  INTERNAL_ERROR: 500,
  INVALID_QUERY: 400,
  ITEM_NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 503,
} as const satisfies Record<ApiErrorCode, 400 | 404 | 500 | 503>;

export const sendApiError = (
  response: ServerResponse,
  code: ApiErrorCode,
  message: string,
): void => {
  const body = apiErrorSchema.parse({
    error: { code, message, requestId: randomUUID() },
  });
  sendJson(response, statusByErrorCode[code], body);
};
