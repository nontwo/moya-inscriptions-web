import type { RequestListener } from "node:http";

import {
  handleCatalogDetail,
  handleCatalogList,
  handleCatalogSearch,
} from "../catalog/catalog-handler.js";
import {
  handleCreateComment,
  handleCreateReply,
  handleReadComments,
  handleReadReplies,
} from "../community/comment-handler.js";
import {
  handleCurrentUser,
  handleDevelopmentSignIn,
  handleDevelopmentSignOut,
} from "../community/community-handler.js";
import { handleOperatorRequest } from "../community/operator-handler.js";
import { healthHandler } from "../health/health-handler.js";
import { sendJson } from "./json-response.js";

import type {
  CatalogCommentService,
  CatalogReadService,
  CommunityModerationService,
  CommunitySessionService,
} from "@moya/api";
import type { HealthReadinessCheck } from "../health/health-handler.js";

type AllowedMethod = "GET" | "POST" | "GET, POST";

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
  /** Present only when a comment port is composed; identity works without it. */
  readonly commentService?: CatalogCommentService;
  readonly moderationService?: CommunityModerationService;
  /**
   * The Owner's operator boundary. An empty credential leaves the internal
   * subpath unreachable, so it is never accidentally open.
   */
  readonly operatorCredential: string;
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

    const commentService = community?.commentService;
    if (community !== undefined && commentService !== undefined) {
      const comments = {
        commentService,
        sessionService: community.sessionService,
      };
      const commentsRoute = /^\/v1\/catalog\/([^/]+)\/comments$/.exec(pathname);
      if (commentsRoute !== null) {
        const catalogId = commentsRoute[1] ?? "";
        if (request.method === "GET") {
          void handleReadComments(request, response, catalogId, comments);
          return;
        }
        if (request.method === "POST") {
          void handleCreateComment(request, response, catalogId, comments);
          return;
        }
        sendRouteError(response, 405, "Method Not Allowed", "GET, POST");
        return;
      }

      const repliesRoute =
        /^\/v1\/catalog\/([^/]+)\/comments\/([^/]+)\/replies$/.exec(pathname);
      if (repliesRoute !== null) {
        const catalogId = repliesRoute[1] ?? "";
        const commentId = repliesRoute[2] ?? "";
        if (request.method === "GET") {
          void handleReadReplies(
            request,
            response,
            catalogId,
            commentId,
            comments,
          );
          return;
        }
        if (request.method === "POST") {
          void handleCreateReply(
            request,
            response,
            catalogId,
            commentId,
            comments,
          );
          return;
        }
        sendRouteError(response, 405, "Method Not Allowed", "GET, POST");
        return;
      }
    }

    // Loopback-only operator boundary: never exposed by the public ingress and
    // never part of the Public API document.
    const moderationService = community?.moderationService;
    if (
      moderationService !== undefined &&
      pathname.startsWith("/internal/community/")
    ) {
      void handleOperatorRequest(request, response, pathname, {
        moderationService,
        operatorCredential: community?.operatorCredential ?? "",
      });
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
