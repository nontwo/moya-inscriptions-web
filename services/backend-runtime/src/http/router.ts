import type { RequestListener } from "node:http";

import {
  handleCatalogDetail,
  handleCatalogList,
} from "../catalog/catalog-handler.js";
import { healthHandler } from "../health/health-handler.js";
import { sendJson } from "./json-response.js";

import type { CatalogReadService } from "@moya/api";
import type { HealthReadinessCheck } from "../health/health-handler.js";

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

export interface RouterDependencies {
  readonly catalogReadService: CatalogReadService;
  readonly healthReadinessCheck: HealthReadinessCheck;
}

export const createRouter =
  ({
    catalogReadService,
    healthReadinessCheck,
  }: RouterDependencies): RequestListener =>
  (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://backend-runtime.local")
      .pathname;

    if (pathname === "/health") {
      if (request.method !== "GET") {
        sendRouteError(response, 405, "Method Not Allowed");
        return;
      }

      void healthHandler(request, response, healthReadinessCheck);
      return;
    }

    if (pathname === "/v1/catalog") {
      if (request.method !== "GET") {
        sendRouteError(response, 405, "Method Not Allowed");
        return;
      }

      void handleCatalogList(request, response, catalogReadService);
      return;
    }

    const detailRoute = /^\/v1\/catalog\/([^/]+)$/.exec(pathname);
    if (detailRoute !== null) {
      if (request.method !== "GET") {
        sendRouteError(response, 405, "Method Not Allowed");
        return;
      }

      void handleCatalogDetail(
        request,
        detailRoute[1] ?? "",
        response,
        catalogReadService,
      );
      return;
    }

    sendRouteError(response, 404, "Not Found");
  };
