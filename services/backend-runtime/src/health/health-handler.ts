import type { RequestListener } from "node:http";

import { getHealth } from "@moya/public-api";

import { sendJson } from "../http/json-response.js";

export const healthHandler: RequestListener = (_request, response): void => {
  sendJson(response, 200, getHealth());
};
