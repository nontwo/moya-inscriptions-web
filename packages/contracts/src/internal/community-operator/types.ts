import type { z } from "zod";

import type {
  commentModerationActionSchema,
  commentModerationStateSchema,
  moderateCommentCommandSchema,
  moderateUserCommandSchema,
  moderationResultSchema,
  operatorCommentPageSchema,
  operatorCommentQuerySchema,
  operatorCommentSchema,
  operatorLabelSchema,
  publicationPolicySchema,
  publicationPolicyStateSchema,
  setPublicationPolicyCommandSchema,
  userModerationActionSchema,
  userModerationResultSchema,
} from "./schemas.js";

export type PublicationPolicy = z.infer<typeof publicationPolicySchema>;
export type OperatorLabel = z.infer<typeof operatorLabelSchema>;
export type PublicationPolicyState = z.infer<
  typeof publicationPolicyStateSchema
>;
export type SetPublicationPolicyCommand = z.infer<
  typeof setPublicationPolicyCommandSchema
>;
export type CommentModerationState = z.infer<
  typeof commentModerationStateSchema
>;
export type CommentModerationAction = z.infer<
  typeof commentModerationActionSchema
>;
export type UserModerationAction = z.infer<typeof userModerationActionSchema>;
export type ModerateCommentCommand = z.infer<
  typeof moderateCommentCommandSchema
>;
export type ModerateUserCommand = z.infer<typeof moderateUserCommandSchema>;
export type OperatorComment = z.infer<typeof operatorCommentSchema>;
export type OperatorCommentPage = z.infer<typeof operatorCommentPageSchema>;
export type OperatorCommentQuery = z.infer<typeof operatorCommentQuerySchema>;
export type ModerationResult = z.infer<typeof moderationResultSchema>;
export type UserModerationResult = z.infer<typeof userModerationResultSchema>;
