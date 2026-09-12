import { timingSafeEqual } from "node:crypto";

import {
  CommunityInputError,
  isCommunityInputError,
  isCommunityNotFoundError,
  isCommunityStoreUnavailableError,
} from "@moya/api";
import {
  catalogCommentIdSchema,
  publicUserIdSchema,
} from "@moya/contracts/schemas";

import { JsonBodyError, readJsonBody } from "../http/json-body.js";
import { sendJson } from "../http/json-response.js";
import { collectTransportQuery } from "../http/transport-query.js";

import type { CommunityModerationService } from "@moya/api";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface OperatorRouteDependencies {
  readonly moderationService: CommunityModerationService;
  /** Shared credential the Owner's Payload Admin holds server-side. */
  readonly operatorCredential: string;
}

/** The operator boundary is not the Public API: it returns bare codes, no ApiError. */
const sendOperatorError = (
  response: ServerResponse,
  status: 400 | 401 | 404 | 405 | 500 | 503,
  code: string,
): void => sendJson(response, status, { error: { status, code } });

const constantTimeEquals = (left: string, right: string): boolean => {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
};

export const isAuthorizedOperator = (
  request: IncomingMessage,
  credential: string,
): boolean => {
  const header = request.headers.authorization;
  if (typeof header !== "string" || credential.length === 0) return false;
  const presented = /^Bearer (\S+)$/.exec(header)?.[1];
  return presented !== undefined && constantTimeEquals(presented, credential);
};

const sendFailure = (response: ServerResponse, error: unknown): void => {
  if (isCommunityNotFoundError(error)) {
    sendOperatorError(response, 404, "NOT_FOUND");
    return;
  }
  if (isCommunityInputError(error)) {
    sendOperatorError(response, 400, "INVALID_COMMAND");
    return;
  }
  if (isCommunityStoreUnavailableError(error)) {
    sendOperatorError(response, 503, "STORE_UNAVAILABLE");
    return;
  }
  sendOperatorError(response, 500, "INTERNAL_ERROR");
};

/**
 * Duplicate or non-string query values must fail, not be silently dropped:
 * an unfiltered moderation queue is not what the Owner asked for.
 */
const numericQuery = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[1-9]\d{0,5}$/.test(value))
    throw new CommunityInputError("Operator query is invalid");
  return Number(value);
};

const moderationQuery = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== "string")
    throw new CommunityInputError("Operator query is invalid");
  return value;
};

/** A malformed percent escape is a missing subject, never a 500. */
const decodeSegment = (segment: string): string | undefined => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
};

export const handleOperatorRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  { moderationService, operatorCredential }: OperatorRouteDependencies,
): Promise<void> => {
  if (!isAuthorizedOperator(request, operatorCredential)) {
    sendOperatorError(response, 401, "OPERATOR_UNAUTHORIZED");
    return;
  }
  const method = request.method ?? "GET";
  try {
    if (pathname === "/internal/community/publication-policy") {
      if (method === "GET") {
        sendJson(
          response,
          200,
          await moderationService.readPublicationPolicy(),
        );
        return;
      }
      if (method === "PUT") {
        sendJson(
          response,
          200,
          await moderationService.setPublicationPolicy(
            await readJsonBody(request),
          ),
        );
        return;
      }
      sendOperatorError(response, 405, "METHOD_NOT_ALLOWED");
      return;
    }

    if (pathname === "/internal/community/comments") {
      if (method !== "GET") {
        sendOperatorError(response, 405, "METHOD_NOT_ALLOWED");
        return;
      }
      const url = new URL(request.url ?? "/", "http://request.invalid");
      const query = collectTransportQuery(url.searchParams);
      const moderation = moderationQuery(query.moderation);
      const page = numericQuery(query.page);
      const pageSize = numericQuery(query.pageSize);
      sendJson(
        response,
        200,
        await moderationService.readComments({
          ...(moderation === undefined ? {} : { moderation }),
          ...(page === undefined ? {} : { page }),
          ...(pageSize === undefined ? {} : { pageSize }),
        }),
      );
      return;
    }

    const commentRoute =
      /^\/internal\/community\/comments\/([^/]+)\/moderation$/.exec(pathname);
    if (commentRoute !== null) {
      if (method !== "POST") {
        sendOperatorError(response, 405, "METHOD_NOT_ALLOWED");
        return;
      }
      const decoded = decodeSegment(commentRoute[1] ?? "");
      const id =
        decoded === undefined
          ? undefined
          : catalogCommentIdSchema.safeParse(decoded);
      if (id?.success !== true) {
        sendOperatorError(response, 404, "NOT_FOUND");
        return;
      }
      sendJson(
        response,
        200,
        await moderationService.moderateComment(
          id.data,
          await readJsonBody(request),
        ),
      );
      return;
    }

    const userRoute = /^\/internal\/community\/users\/([^/]+)\/status$/.exec(
      pathname,
    );
    if (userRoute !== null) {
      if (method !== "POST") {
        sendOperatorError(response, 405, "METHOD_NOT_ALLOWED");
        return;
      }
      const decoded = decodeSegment(userRoute[1] ?? "");
      const id =
        decoded === undefined
          ? undefined
          : publicUserIdSchema.safeParse(decoded);
      if (id?.success !== true) {
        sendOperatorError(response, 404, "NOT_FOUND");
        return;
      }
      sendJson(
        response,
        200,
        await moderationService.moderateUser(
          id.data,
          await readJsonBody(request),
        ),
      );
      return;
    }

    sendOperatorError(response, 404, "NOT_FOUND");
  } catch (error) {
    if (error instanceof JsonBodyError) {
      sendOperatorError(response, 400, "INVALID_COMMAND");
      return;
    }
    sendFailure(response, error);
  }
};
