import { z } from "zod";

import {
  catalogCommentIdSchema,
  catalogIdSchema,
  publicUserHandleSchema,
  publicUserDisplayNameSchema,
  publicUserIdSchema,
  COMMENT_TEXT_MAXIMUM,
} from "../../schemas.js";

/**
 * Server-only operator boundary between the Owner's Payload Admin interface and
 * the Backend (amendment decision 4). Nothing here is a Public DTO, appears in
 * the OpenAPI document, or is reachable from a browser: the Backend serves it on
 * a loopback-only internal subpath behind an operator credential.
 */

/** The Owner-controlled global publication setting (decision 1). */
export const publicationPolicySchema = z.enum([
  "PRE_MODERATION",
  "DIRECT_PUBLICATION",
]);

/** Never a PublicUserId and never a Payload row id reused as public identity. */
export const operatorLabelSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/);

export const publicationPolicyStateSchema = z.strictObject({
  policy: publicationPolicySchema,
  updatedAt: z.iso.datetime({ offset: false }),
  updatedBy: operatorLabelSchema,
});

export const setPublicationPolicyCommandSchema = z.strictObject({
  policy: publicationPolicySchema,
});

export const commentModerationStateSchema = z.enum([
  "pending",
  "visible",
  "hidden",
]);

export const commentModerationActionSchema = z.enum([
  "approve",
  "hide",
  "unhide",
]);

export const userModerationActionSchema = z.enum(["suspend", "reinstate"]);

export const moderateCommentCommandSchema = z.strictObject({
  action: commentModerationActionSchema,
});

export const moderateUserCommandSchema = z.strictObject({
  action: userModerationActionSchema,
});

/** One moderation-queue row: the operator sees text and state, never credentials. */
export const operatorCommentSchema = z.strictObject({
  id: catalogCommentIdSchema,
  kind: z.enum(["comment", "reply"]),
  catalogId: catalogIdSchema,
  rootCommentId: catalogCommentIdSchema.optional(),
  author: z.strictObject({
    id: publicUserIdSchema,
    handle: publicUserHandleSchema,
    displayName: publicUserDisplayNameSchema,
    status: z.enum(["active", "suspended"]),
  }),
  text: z.string().min(1).max(COMMENT_TEXT_MAXIMUM),
  createdAt: z.iso.datetime({ offset: false }),
  moderation: commentModerationStateSchema,
});

const operatorPageSizeSchema = z.number().int().min(1).max(50);

export const operatorCommentPageSchema = z.strictObject({
  items: z.array(operatorCommentSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: operatorPageSizeSchema,
  totalPages: z.number().int().min(0),
});

/** Bounded review listing; V1 has no large review queue, keyword engine or scoring. */
export const operatorCommentQuerySchema = z.strictObject({
  moderation: commentModerationStateSchema.optional(),
  page: z.number().int().min(1).max(10_000).optional(),
  pageSize: operatorPageSizeSchema.optional(),
});

export const moderationResultSchema = z.strictObject({
  id: catalogCommentIdSchema,
  moderation: commentModerationStateSchema,
});

export const userModerationResultSchema = z.strictObject({
  id: publicUserIdSchema,
  status: z.enum(["active", "suspended"]),
  revokedSessions: z.number().int().min(0),
});
