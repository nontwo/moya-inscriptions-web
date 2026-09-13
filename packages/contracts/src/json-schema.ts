import { z } from "zod";

import {
  apiErrorCodeSchema,
  apiErrorSchema,
  catalogCitationScopeSchema,
  catalogCommentIdSchema,
  catalogCommentPageSchema,
  catalogCommentReplyPageSchema,
  catalogCommentReplySchema,
  catalogCommentSchema,
  catalogCommentListingTransportQuerySchema,
  catalogCommentTransportQuerySchema,
  catalogContributorRoleSchema,
  catalogContributorSchema,
  catalogDetailSchema,
  catalogIdSchema,
  commentAuthorSchema,
  createCatalogCommentReplyRequestSchema,
  createCatalogCommentRequestSchema,
  catalogKindSchema,
  catalogListTransportQuerySchema,
  catalogPageSchema,
  catalogSummarySchema,
  catalogSearchMatchKindSchema,
  catalogSearchTransportQuerySchema,
  catalogSearchItemSchema,
  catalogSearchPageSchema,
  healthResponseSchema,
  mediaIdSchema,
  noQueryTransportSchema,
  publicMediaSchema,
  publicSourceCitationSchema,
  publicUserIdSchema,
  publicUserProfileSchema,
} from "./schemas.js";

const toJsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "draft-2020-12" });

export const catalogIdJsonSchema = toJsonSchema(catalogIdSchema);
export const catalogKindJsonSchema = toJsonSchema(catalogKindSchema);
export const catalogContributorRoleJsonSchema = toJsonSchema(
  catalogContributorRoleSchema,
);
export const catalogContributorJsonSchema = toJsonSchema(
  catalogContributorSchema,
);
export const catalogCitationScopeJsonSchema = toJsonSchema(
  catalogCitationScopeSchema,
);
export const mediaIdJsonSchema = toJsonSchema(mediaIdSchema);
export const publicMediaJsonSchema = toJsonSchema(publicMediaSchema);
export const catalogSummaryJsonSchema = toJsonSchema(catalogSummarySchema);
export const catalogDetailJsonSchema = toJsonSchema(catalogDetailSchema);
export const catalogListTransportQueryJsonSchema = toJsonSchema(
  catalogListTransportQuerySchema,
);
export const noQueryTransportJsonSchema = toJsonSchema(noQueryTransportSchema);
export const catalogPageJsonSchema = toJsonSchema(catalogPageSchema);
export const catalogSearchMatchKindJsonSchema = toJsonSchema(
  catalogSearchMatchKindSchema,
);
export const catalogSearchTransportQueryJsonSchema = toJsonSchema(
  catalogSearchTransportQuerySchema,
);
export const catalogSearchItemJsonSchema = toJsonSchema(
  catalogSearchItemSchema,
);
export const catalogSearchPageJsonSchema = toJsonSchema(
  catalogSearchPageSchema,
);
export const publicSourceCitationJsonSchema = toJsonSchema(
  publicSourceCitationSchema,
);
export const publicUserIdJsonSchema = toJsonSchema(publicUserIdSchema);
export const publicUserProfileJsonSchema = toJsonSchema(
  publicUserProfileSchema,
);
export const catalogCommentIdJsonSchema = toJsonSchema(catalogCommentIdSchema);
export const commentAuthorJsonSchema = toJsonSchema(commentAuthorSchema);
export const catalogCommentReplyJsonSchema = toJsonSchema(
  catalogCommentReplySchema,
);
export const catalogCommentJsonSchema = toJsonSchema(catalogCommentSchema);
export const catalogCommentPageJsonSchema = toJsonSchema(
  catalogCommentPageSchema,
);
export const catalogCommentReplyPageJsonSchema = toJsonSchema(
  catalogCommentReplyPageSchema,
);
export const catalogCommentTransportQueryJsonSchema = toJsonSchema(
  catalogCommentTransportQuerySchema,
);
export const catalogCommentListingTransportQueryJsonSchema = toJsonSchema(
  catalogCommentListingTransportQuerySchema,
);
export const createCatalogCommentRequestJsonSchema = toJsonSchema(
  createCatalogCommentRequestSchema,
);
export const createCatalogCommentReplyRequestJsonSchema = toJsonSchema(
  createCatalogCommentReplyRequestSchema,
);
export const healthResponseJsonSchema = toJsonSchema(healthResponseSchema);
export const apiErrorCodeJsonSchema = toJsonSchema(apiErrorCodeSchema);
export const apiErrorJsonSchema = toJsonSchema(apiErrorSchema);

import {
  authorProfileSchema,
  authorPeoplePageSchema,
  authorMediaSchema,
  workSchema,
  workPageSchema,
  workDraftPageSchema,
  workDraftResultSchema,
  workApplyResultSchema,
  profileUpdateSchema,
  privacyUpdateSchema,
  avatarUpdateSchema,
  avatarUpdateResultSchema,
  relationshipUpdateSchema,
  contentRelationUpdateSchema,
  guestFavoriteMergeSchema,
  guestFavoriteMergeResultSchema,
  workDraftSaveSchema,
  workDraftApplySchema,
  requestIdentitySchema,
} from "./schemas.js";

import {
  contentIdentitySchema,
  discussionReplySchema,
  discussionCommentSchema,
  discussionPageSchema,
  discussionReplyPageSchema,
  ownCommentSchema,
  ownCommentPageSchema,
  discussionSubmitResultSchema,
  discussionLocationSchema,
  commentLikeUpdateSchema,
  contentCardSchema,
  inscriptionFiltersSchema,
  discoveryQuerySchema,
  discoveryPageSchema,
  contentCollectionPageSchema,
  inscriptionFilterOptionsSchema,
  contentStateSchema,
  savedResultSchema,
  deletedResultSchema,
  discardedResultSchema,
} from "./schemas.js";

export const authorCommunityJsonSchemas = {
  ContentIdentity: toJsonSchema(contentIdentitySchema),
  DiscussionReply: toJsonSchema(discussionReplySchema),
  DiscussionComment: toJsonSchema(discussionCommentSchema),
  DiscussionPage: toJsonSchema(discussionPageSchema),
  DiscussionReplyPage: toJsonSchema(discussionReplyPageSchema),
  OwnComment: toJsonSchema(ownCommentSchema),
  OwnCommentPage: toJsonSchema(ownCommentPageSchema),
  DiscussionSubmitResult: toJsonSchema(discussionSubmitResultSchema),
  DiscussionLocation: toJsonSchema(discussionLocationSchema),
  CommentLikeUpdate: toJsonSchema(commentLikeUpdateSchema),
  ContentCard: toJsonSchema(contentCardSchema),
  InscriptionFilters: toJsonSchema(inscriptionFiltersSchema),
  DiscoveryQuery: toJsonSchema(discoveryQuerySchema),
  DiscoveryPage: toJsonSchema(discoveryPageSchema),
  ContentCollectionPage: toJsonSchema(contentCollectionPageSchema),
  InscriptionFilterOptions: toJsonSchema(inscriptionFilterOptionsSchema),
  ContentState: toJsonSchema(contentStateSchema),
  SavedResult: toJsonSchema(savedResultSchema),
  DeletedResult: toJsonSchema(deletedResultSchema),
  DiscardedResult: toJsonSchema(discardedResultSchema),

  AuthorProfile: toJsonSchema(authorProfileSchema),
  AuthorPeoplePage: toJsonSchema(authorPeoplePageSchema),
  AuthorMedia: toJsonSchema(authorMediaSchema),
  UserWork: toJsonSchema(workSchema),
  WorkPage: toJsonSchema(workPageSchema),
  WorkDraftPage: toJsonSchema(workDraftPageSchema),
  WorkDraftResult: toJsonSchema(workDraftResultSchema),
  WorkApplyResult: toJsonSchema(workApplyResultSchema),
  ProfileUpdate: toJsonSchema(profileUpdateSchema),
  PrivacyUpdate: toJsonSchema(privacyUpdateSchema),
  AvatarUpdate: toJsonSchema(avatarUpdateSchema),
  AvatarUpdateResult: toJsonSchema(avatarUpdateResultSchema),
  RelationshipUpdate: toJsonSchema(relationshipUpdateSchema),
  ContentRelationUpdate: toJsonSchema(contentRelationUpdateSchema),
  GuestFavoriteMerge: toJsonSchema(guestFavoriteMergeSchema),
  GuestFavoriteMergeResult: toJsonSchema(guestFavoriteMergeResultSchema),
  WorkDraftSave: toJsonSchema(workDraftSaveSchema),
  WorkDraftApply: toJsonSchema(workDraftApplySchema),
  RequestIdentity: toJsonSchema(requestIdentitySchema),
};
