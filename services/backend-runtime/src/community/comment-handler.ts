import {
  COMMENT_REPLY_PAGE_SIZE_DEFAULT,
  isCommunityInputError,
  isCommunityNotFoundError,
  isCommunityStoreUnavailableError,
  parseCommentPageQuery,
  parseCreateCommentRequest,
  parseCreateReplyRequest,
} from "@moya/api";
import {
  catalogCommentIdSchema,
  catalogIdSchema,
} from "@moya/contracts/schemas";

import { sendApiError } from "../http/api-error-response.js";
import { JsonBodyError, readJsonBody } from "../http/json-body.js";
import { sendJson } from "../http/json-response.js";
import { collectTransportQuery } from "../http/transport-query.js";
import { readBearerToken } from "./session-credential.js";

import type {
  CatalogCommentService,
  CommentPageRequest,
  CommentSubmission,
  CommunitySessionService,
} from "@moya/api";
import type {
  CatalogCommentId,
  CatalogId,
  PublicUserId,
} from "@moya/contracts";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface CommentRouteDependencies {
  readonly commentService: CatalogCommentService;
  readonly sessionService: CommunitySessionService;
}

const sendFailure = (response: ServerResponse, error: unknown): void => {
  if (isCommunityNotFoundError(error)) {
    sendApiError(
      response,
      "ITEM_NOT_FOUND",
      "The requested item was not found",
    );
    return;
  }
  if (isCommunityInputError(error)) {
    sendApiError(response, "INVALID_INPUT", "The submitted comment is invalid");
    return;
  }
  if (isCommunityStoreUnavailableError(error)) {
    sendApiError(
      response,
      "SERVICE_UNAVAILABLE",
      "Service temporarily unavailable",
    );
    return;
  }
  sendApiError(response, "INTERNAL_ERROR", "Internal server error");
};

const sendNotFound = (response: ServerResponse): void =>
  sendApiError(response, "ITEM_NOT_FOUND", "The requested item was not found");

const parseCatalogId = (
  response: ServerResponse,
  catalogId: string,
): CatalogId | undefined => {
  const parsed = catalogIdSchema.safeParse(decodeURIComponent(catalogId));
  if (!parsed.success) {
    sendNotFound(response);
    return undefined;
  }
  return parsed.data;
};

const parseCommentId = (
  response: ServerResponse,
  commentId: string,
): CatalogCommentId | undefined => {
  const parsed = catalogCommentIdSchema.safeParse(
    decodeURIComponent(commentId),
  );
  if (!parsed.success) {
    sendNotFound(response);
    return undefined;
  }
  return parsed.data;
};

/** An invalid page query is a transport error, not a body error. */
const parsePage = (
  request: IncomingMessage,
  response: ServerResponse,
  fallbackPageSize?: number,
): CommentPageRequest | undefined => {
  const url = new URL(request.url ?? "/", "http://request.invalid");
  try {
    return parseCommentPageQuery(
      collectTransportQuery(url.searchParams),
      fallbackPageSize,
    );
  } catch {
    sendApiError(response, "INVALID_QUERY", "Invalid comment query");
    return undefined;
  }
};

/** Resolves the session owner; undefined means the request is unauthenticated. */
const identify = async (
  request: IncomingMessage,
  response: ServerResponse,
  sessionService: CommunitySessionService,
): Promise<PublicUserId | undefined> => {
  const token = readBearerToken(request);
  const profile =
    token === undefined ? null : await sessionService.identify(token);
  if (profile === null) {
    sendApiError(response, "UNAUTHENTICATED", "A valid session is required");
    return undefined;
  }
  return profile.id;
};

const sendSubmission = <Item>(
  response: ServerResponse,
  submission: CommentSubmission<Item>,
): void => {
  // 202 tells the author the submission is awaiting Owner approval under
  // PRE_MODERATION; the body shape is the same Public DTO either way.
  sendJson(response, submission.awaitingApproval ? 202 : 201, submission.item);
};

const sendBodyFailure = (response: ServerResponse, error: unknown): void => {
  if (error instanceof JsonBodyError) {
    sendApiError(response, "INVALID_INPUT", "The submitted comment is invalid");
    return;
  }
  sendFailure(response, error);
};

export const handleReadComments = async (
  request: IncomingMessage,
  response: ServerResponse,
  rawCatalogId: string,
  { commentService }: CommentRouteDependencies,
): Promise<void> => {
  const catalogId = parseCatalogId(response, rawCatalogId);
  if (catalogId === undefined) return;
  const page = parsePage(request, response);
  if (page === undefined) return;
  try {
    sendJson(response, 200, await commentService.readComments(catalogId, page));
  } catch (error) {
    sendFailure(response, error);
  }
};

export const handleCreateComment = async (
  request: IncomingMessage,
  response: ServerResponse,
  rawCatalogId: string,
  dependencies: CommentRouteDependencies,
): Promise<void> => {
  const catalogId = parseCatalogId(response, rawCatalogId);
  if (catalogId === undefined) return;
  const authorId = await identify(
    request,
    response,
    dependencies.sessionService,
  );
  if (authorId === undefined) return;
  try {
    const body = parseCreateCommentRequest(await readJsonBody(request));
    sendSubmission(
      response,
      await dependencies.commentService.createComment(
        catalogId,
        authorId,
        body,
      ),
    );
  } catch (error) {
    sendBodyFailure(response, error);
  }
};

export const handleReadReplies = async (
  request: IncomingMessage,
  response: ServerResponse,
  rawCatalogId: string,
  rawCommentId: string,
  { commentService }: CommentRouteDependencies,
): Promise<void> => {
  const catalogId = parseCatalogId(response, rawCatalogId);
  if (catalogId === undefined) return;
  const commentId = parseCommentId(response, rawCommentId);
  if (commentId === undefined) return;
  const page = parsePage(request, response, COMMENT_REPLY_PAGE_SIZE_DEFAULT);
  if (page === undefined) return;
  try {
    sendJson(
      response,
      200,
      await commentService.readReplies(catalogId, commentId, page),
    );
  } catch (error) {
    sendFailure(response, error);
  }
};

export const handleCreateReply = async (
  request: IncomingMessage,
  response: ServerResponse,
  rawCatalogId: string,
  rawCommentId: string,
  dependencies: CommentRouteDependencies,
): Promise<void> => {
  const catalogId = parseCatalogId(response, rawCatalogId);
  if (catalogId === undefined) return;
  const commentId = parseCommentId(response, rawCommentId);
  if (commentId === undefined) return;
  const authorId = await identify(
    request,
    response,
    dependencies.sessionService,
  );
  if (authorId === undefined) return;
  try {
    const body = parseCreateReplyRequest(await readJsonBody(request));
    sendSubmission(
      response,
      await dependencies.commentService.createReply(
        catalogId,
        commentId,
        authorId,
        body,
      ),
    );
  } catch (error) {
    sendBodyFailure(response, error);
  }
};
