import {
  catalogCommentListingTransportQuerySchema,
  catalogCommentTransportQuerySchema,
  createCatalogCommentReplyRequestSchema,
  createCatalogCommentRequestSchema,
} from "@moya/contracts/schemas";

import { CommunityInputError } from "../application/errors/community-request-errors.js";

import type {
  CatalogCommentId,
  CreateCatalogCommentReplyRequest,
  CreateCatalogCommentRequest,
} from "@moya/contracts";

/**
 * Transport parsing for the comment operations. Runtime schemas stay outside
 * the application layer; the service receives normalized values only.
 */

export interface CommentPageRequest {
  readonly page: number;
  readonly pageSize: number;
}

/** The root listing request; `pinned` is present on load-more requests only. */
export interface CommentListingRequest extends CommentPageRequest {
  readonly pinned?: readonly CatalogCommentId[];
}

/** Fixed by the Mission 2B Contract review; Web never widens them. */
export const COMMENT_PAGE_SIZE_DEFAULT = 20;
export const COMMENT_REPLY_PAGE_SIZE_DEFAULT = 10;

export const parseCommentPageQuery = (
  input: unknown,
  fallbackPageSize: number = COMMENT_PAGE_SIZE_DEFAULT,
): CommentPageRequest => {
  const parsed = catalogCommentTransportQuerySchema.safeParse(input ?? {});
  if (!parsed.success)
    throw new CommunityInputError("Comment query is invalid");
  return {
    page: parsed.data.page ? Number(parsed.data.page) : 1,
    pageSize: parsed.data.pageSize
      ? Number(parsed.data.pageSize)
      : fallbackPageSize,
  };
};

export const parseCommentListingQuery = (
  input: unknown,
): CommentListingRequest => {
  const parsed = catalogCommentListingTransportQuerySchema.safeParse(
    input ?? {},
  );
  if (!parsed.success)
    throw new CommunityInputError("Comment listing query is invalid");
  const { pinned, ...page } = parsed.data;
  return {
    ...parseCommentPageQuery(page),
    ...(pinned === undefined
      ? {}
      : { pinned: pinned.split(",") as CatalogCommentId[] }),
  };
};

export const parseCreateCommentRequest = (
  body: unknown,
): CreateCatalogCommentRequest => {
  const parsed = createCatalogCommentRequestSchema.safeParse(body);
  if (!parsed.success) throw new CommunityInputError("Comment body is invalid");
  return parsed.data;
};

export const parseCreateReplyRequest = (
  body: unknown,
): CreateCatalogCommentReplyRequest => {
  const parsed = createCatalogCommentReplyRequestSchema.safeParse(body);
  if (!parsed.success) throw new CommunityInputError("Reply body is invalid");
  return parsed.data;
};
