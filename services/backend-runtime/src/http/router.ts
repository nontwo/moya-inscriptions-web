import type { RequestListener } from "node:http";

import {
  handleCatalogDetail,
  handleCatalogList,
  handleCatalogSearch,
} from "../catalog/catalog-handler.js";
import {
  handleCurrentUser,
  handleDevelopmentSignIn,
  handleDevelopmentSignOut,
} from "../community/community-handler.js";
import { healthHandler } from "../health/health-handler.js";
import { sendJson } from "./json-response.js";

import type { CatalogReadService, CommunitySessionService } from "@moya/api";
import type { HealthReadinessCheck } from "../health/health-handler.js";

type AllowedMethod = "GET" | "POST";

const sendRouteError = (
  response: Parameters<RequestListener>[1],
  status: 404 | 405,
  message: "Method Not Allowed" | "Not Found",
  allow: AllowedMethod = "GET",
): void => {
  sendJson(
    response,
    status,
    { error: { status, message } },
    status === 405 ? { allow } : {},
  );
};

export interface CommunityRouterDependencies {
  readonly sessionService: CommunitySessionService;
  /** True only under NODE_ENV=development; Production never composes the entry. */
  readonly developmentEntry: boolean;
}

export interface RouterDependencies {
  readonly catalogReadService: CatalogReadService;
  readonly healthReadinessCheck: HealthReadinessCheck;
  readonly community?: CommunityRouterDependencies;
}

export const createRouter =
  ({
    catalogReadService,
    healthReadinessCheck,
    community,
  }: RouterDependencies): RequestListener =>
  (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://request.invalid")
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

    if (pathname === "/v1/catalog-search") {
      if (request.method !== "GET") {
        sendRouteError(response, 405, "Method Not Allowed");
        return;
      }
      void handleCatalogSearch(request, response, catalogReadService);
      return;
    }

    if (pathname === "/v1/me") {
      if (request.method !== "GET") {
        sendRouteError(response, 405, "Method Not Allowed");
        return;
      }
      void handleCurrentUser(request, response, community?.sessionService);
      return;
    }

    if (community?.developmentEntry === true) {
      if (pathname === "/v1/development/sign-in") {
        if (request.method !== "POST") {
          sendRouteError(response, 405, "Method Not Allowed", "POST");
          return;
        }
        void handleDevelopmentSignIn(
          request,
          response,
          community.sessionService,
        );
        return;
      }

      if (pathname === "/v1/development/sign-out") {
        if (request.method !== "POST") {
          sendRouteError(response, 405, "Method Not Allowed", "POST");
          return;
        }
        void handleDevelopmentSignOut(
          request,
          response,
          community.sessionService,
        );
        return;
      }
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
