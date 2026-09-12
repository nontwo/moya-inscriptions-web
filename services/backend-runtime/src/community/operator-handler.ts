import { timingSafeEqual } from "node:crypto";

import {
  CommunityInputError,
  isCommunityConflictError,
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
  status: 400 | 401 | 404 | 405 | 409 | 500 | 503,
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
  if (isCommunityConflictError(error)) {
    // The subject moved on; the caller refreshes rather than retries.
    sendOperatorError(response, 409, "STATE_CONFLICT");
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

const stringQuery = (value: unknown): string | undefined => {
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

const queryOf = (request: IncomingMessage) =>
  collectTransportQuery(
    new URL(request.url ?? "/", "http://request.invalid").searchParams,
  );

const withDefined = <Value>(
  entries: readonly (readonly [string, Value | undefined])[],
): Record<string, Value> =>
  Object.fromEntries(
    entries.filter(
      (entry): entry is readonly [string, Value] => entry[1] !== undefined,
    ),
  );

/**
 * Routes, all behind the operator credential:
 *   GET  /internal/community/publication-policy
 *   PUT  /internal/community/publication-policy
 *   GET  /internal/community/comments?moderation&kind&catalogId&search&order&page&pageSize
 *   POST /internal/community/comments/moderation          (selected items, bounded)
 *   GET  /internal/community/comments/{id}                (detail with context)
 *   GET  /internal/community/comments/{id}/analysis       (advisory state only)
 *   POST /internal/community/comments/{id}/moderation
 *   POST /internal/community/users/{id}/status
 *   GET  /internal/community/moderation-events?subjectId&action&page&pageSize
 *   GET  /internal/community/summary?range
 * The subject id always travels in the route; a body carries the command only.
 */
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
  const methodNotAllowed = () =>
    sendOperatorError(response, 405, "METHOD_NOT_ALLOWED");
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
      methodNotAllowed();
      return;
    }

    if (pathname === "/internal/community/comments") {
      if (method !== "GET") {
        methodNotAllowed();
        return;
      }
      const query = queryOf(request);
      sendJson(
        response,
        200,
        await moderationService.readComments({
          ...withDefined([
            ["moderation", stringQuery(query.moderation)],
            ["kind", stringQuery(query.kind)],
            ["catalogId", stringQuery(query.catalogId)],
            ["search", stringQuery(query.search)],
            ["order", stringQuery(query.order)],
          ]),
          ...withDefined([
            ["page", numericQuery(query.page)],
            ["pageSize", numericQuery(query.pageSize)],
          ]),
        }),
      );
      return;
    }

    if (pathname === "/internal/community/comments/moderation") {
      if (method !== "POST") {
        methodNotAllowed();
        return;
      }
      sendJson(
        response,
        200,
        await moderationService.moderateComments(await readJsonBody(request)),
      );
      return;
    }

    if (pathname === "/internal/community/moderation-events") {
      if (method !== "GET") {
        methodNotAllowed();
        return;
      }
      const query = queryOf(request);
      sendJson(
        response,
        200,
        await moderationService.readModerationEvents({
          ...withDefined([
            ["subjectId", stringQuery(query.subjectId)],
            ["action", stringQuery(query.action)],
          ]),
          ...withDefined([
            ["page", numericQuery(query.page)],
            ["pageSize", numericQuery(query.pageSize)],
          ]),
        }),
      );
      return;
    }

    if (pathname === "/internal/community/summary") {
      if (method !== "GET") {
        methodNotAllowed();
        return;
      }
      const query = queryOf(request);
      sendJson(
        response,
        200,
        await moderationService.readSummary(
          withDefined([["range", stringQuery(query.range)]]),
        ),
      );
      return;
    }

    const commentRoute =
      /^\/internal\/community\/comments\/([^/]+)(?:\/(moderation|analysis))?$/.exec(
        pathname,
      );
    if (commentRoute !== null) {
      const decoded = decodeSegment(commentRoute[1] ?? "");
      const id =
        decoded === undefined
          ? undefined
          : catalogCommentIdSchema.safeParse(decoded);
      if (id?.success !== true) {
        sendOperatorError(response, 404, "NOT_FOUND");
        return;
      }
      const leaf = commentRoute[2];
      if (leaf === undefined) {
        if (method !== "GET") {
          methodNotAllowed();
          return;
        }
        sendJson(
          response,
          200,
          await moderationService.readCommentDetail(id.data),
        );
        return;
      }
      if (leaf === "analysis") {
        if (method !== "GET") {
          methodNotAllowed();
          return;
        }
        const detail = await moderationService.readCommentDetail(id.data);
        sendJson(response, 200, detail.analysis);
        return;
      }
      if (method !== "POST") {
        methodNotAllowed();
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
        methodNotAllowed();
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
