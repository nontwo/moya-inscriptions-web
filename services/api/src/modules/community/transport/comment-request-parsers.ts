import {
  catalogCommentTransportQuerySchema,
  createCatalogCommentReplyRequestSchema,
  createCatalogCommentRequestSchema,
} from "@moya/contracts/schemas";

import { CommunityInputError } from "../application/errors/community-request-errors.js";

import type {
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
