import { z } from "zod";
import {
  contentIdentitySchema,
  catalogCommentIdSchema,
} from "../../schemas.js";
const version = z.number().int().nonnegative().max(2147483647);
const position = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const workId = z.string().regex(/^work-[0-9a-f]{32}$/u);
const userId = z.string().regex(/^user-[0-9a-f]{32}$/u);
const recommendationSchema = z.strictObject({
  enabled: z.boolean(),
  version,
  position,
  source: z.enum(["work", "user", "none"]),
});
export const operatorContentQuerySchema = z.strictObject({
  page: z
    .union([z.number(), z.string().regex(/^[1-9]\d*$/u)])
    .pipe(z.coerce.number<string | number>().int().min(1).max(100000))
    .default(1),
  pageSize: z
    .union([z.number(), z.string().regex(/^[1-9]\d*$/u)])
    .pipe(z.coerce.number<string | number>().int().min(1).max(50))
    .default(20),
  search: z.string().trim().max(200).default(""),
});
export const operatorWorksQuerySchema = operatorContentQuerySchema.extend({
  authorId: userId.optional(),
});
export const operatorFeaturedQuerySchema = operatorContentQuerySchema.extend({
  filter: z.enum(["all", "active"]).optional(),
});
export const operatorUsersQuerySchema = operatorContentQuerySchema.extend({
  userId: userId.optional(),
});
export const operatorUserSchema = z.strictObject({
  id: userId,
  handle: z.string(),
  displayName: z.string(),
  bio: z.string(),
  status: z.enum(["active", "suspended"]),
  createdAt: z.iso.datetime(),
  submittedWorks: z.number().int().nonnegative(),
  recommended: z.boolean(),
  recommendationVersion: version,
});
export const operatorUserPageSchema = z.strictObject({
  items: z.array(operatorUserSchema).max(50),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const recommendUserCommandSchema = z.strictObject({
  requestId: z.uuid(),
  id: userId,
  enabled: z.boolean(),
  expectedVersion: version,
});
export const operatorWorkSchema = z.strictObject({
  id: workId,
  title: z.string(),
  text: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  authorStatus: z.enum(["active", "suspended"]),
  state: z.enum(["visible", "hidden", "removed"]),
  authorDeleted: z.boolean(),
  version,
  /** Null for a work never publicly exposed (self-only or pending first submission). */
  firstPublishedAt: z.iso.datetime().nullable(),
  /** Only queue-readable immutable submissions; never a private draft. */
  latestSubmission: z
    .strictObject({
      revisionId: z.string().regex(/^work-revision-[0-9a-f]{32}$/u),
      title: z.string(),
      disposition: z.enum([
        "pending",
        "approved",
        "rejected",
        "superseded",
        "withdrawn",
      ]),
    })
    .nullable()
    .optional(),
  publicRevisionId: z
    .string()
    .regex(/^work-revision-[0-9a-f]{32}$/u)
    .nullable()
    .optional(),
  publiclyVisible: z.boolean().optional(),
  recommendation: recommendationSchema.optional(),
});
export const operatorWorkPageSchema = z.strictObject({
  items: z.array(operatorWorkSchema).max(50),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const moderateWorkCommandSchema = z.strictObject({
  requestId: z.uuid(),
  state: z.enum(["visible", "hidden", "removed"]),
  expectedVersion: version,
});
export const adminModerateWorkRequestSchema = moderateWorkCommandSchema.extend({
  id: workId,
});
export const featuredMutationSchema = z.strictObject({
  requestId: z.uuid(),
  target: contentIdentitySchema,
  enabled: z.boolean(),
  position,
  expectedVersion: version,
});
export const featuredSettingsMutationSchema = z.strictObject({
  requestId: z.uuid(),
  enabledQuantity: position.nullable(),
  expectedVersion: version,
});
export const featuredItemSchema = z.strictObject({
  target: contentIdentitySchema,
  title: z.string().nullable(),
  eligible: z.boolean(),
  enabled: z.boolean(),
  position,
  version,
});
export const featuredPageSchema = z.strictObject({
  items: z.array(featuredItemSchema).max(50),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  enabledQuantity: position.nullable(),
  settingsVersion: version,
});
export const operatorDeleteBodySchema = z.strictObject({ requestId: z.uuid() });
export const operatorRemoveThreadSchema = z.strictObject({
  requestId: z.uuid(),
  expectedAffectedCount: z.number().int().positive(),
});
export const adminDeleteBodySchema = operatorDeleteBodySchema.extend({
  id: catalogCommentIdSchema.refine((id) => /^comment-[0-9a-f]{32}$/u.test(id)),
});
export const adminRemoveThreadSchema = operatorRemoveThreadSchema.extend({
  id: catalogCommentIdSchema.refine((id) => /^comment-[0-9a-f]{32}$/u.test(id)),
});
export type OperatorContentQuery = z.infer<typeof operatorContentQuerySchema>;
export type OperatorWorksQuery = z.infer<typeof operatorWorksQuerySchema>;
export type OperatorFeaturedQuery = z.infer<typeof operatorFeaturedQuerySchema>;
export type OperatorUsersQuery = z.infer<typeof operatorUsersQuerySchema>;
export type OperatorUser = z.infer<typeof operatorUserSchema>;
export type OperatorUserPage = z.infer<typeof operatorUserPageSchema>;
export type RecommendUserCommand = z.infer<typeof recommendUserCommandSchema>;
export type OperatorWork = z.infer<typeof operatorWorkSchema>;
export type OperatorWorkPage = z.infer<typeof operatorWorkPageSchema>;
export type ModerateWorkCommand = z.infer<typeof moderateWorkCommandSchema>;
export type FeaturedMutation = z.infer<typeof featuredMutationSchema>;
export type FeaturedSettingsMutation = z.infer<
  typeof featuredSettingsMutationSchema
>;
export type FeaturedPage = z.infer<typeof featuredPageSchema>;
