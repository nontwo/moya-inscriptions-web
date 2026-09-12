export { deriveCatalogPeriodLabel } from "./modules/catalog/application/catalog-read-projections.js";
export { parseCatalogListQuery } from "./modules/catalog/transport/catalog-list-query-parser.js";
export { parseCatalogSearchQuery } from "./modules/catalog/transport/catalog-search-query-parser.js";
export type { CatalogSearchQuery } from "./modules/catalog/application/queries/catalog-search-query.js";
export type {
  CatalogSearchQueryPort,
  CatalogSearchItemProjection,
  CatalogSearchPageProjection,
} from "./modules/catalog/application/ports/catalog-search-query-port.js";
export {
  mapCatalogDetail,
  mapCatalogPage,
  mapCatalogSummary,
} from "./modules/catalog/application/mappers/catalog-public-contract-mapper.js";
export {
  CatalogMediaResolutionError,
  isCatalogMediaResolutionError,
} from "./modules/catalog/application/errors/catalog-media-resolution-error.js";
export {
  CatalogQueryUnavailableError,
  isCatalogQueryUnavailableError,
} from "./modules/catalog/application/errors/catalog-query-unavailable-error.js";
export { CatalogReadService } from "./modules/catalog/application/services/catalog-read-service.js";
export {
  CommunityStoreUnavailableError,
  isCommunityStoreUnavailableError,
} from "./modules/community/application/errors/community-store-unavailable-error.js";
export {
  CommunityInputError,
  CommunityNotFoundError,
  isCommunityInputError,
  isCommunityNotFoundError,
} from "./modules/community/application/errors/community-request-errors.js";
export { mapPublicUserProfile } from "./modules/community/application/mappers/community-public-contract-mapper.js";
export { CatalogCommentService } from "./modules/community/application/services/catalog-comment-service.js";
export { CommunityModerationService } from "./modules/community/application/services/community-moderation-service.js";
export { CommunitySessionService } from "./modules/community/application/services/community-session-service.js";
export type {
  CatalogCommentServiceOptions,
  CommentPageInput,
  CommentSubmission,
} from "./modules/community/application/services/catalog-comment-service.js";
export {
  COMMENT_EMBEDDED_REPLY_LIMIT,
  COMMENT_PAGE_SIZE_DEFAULT,
  COMMENT_REPLY_PAGE_SIZE_DEFAULT,
  parseCommentPageQuery,
  parseCreateCommentRequest,
  parseCreateReplyRequest,
} from "./modules/community/transport/comment-request-parsers.js";
export type { CommentPageRequest } from "./modules/community/transport/comment-request-parsers.js";
export type { CommunityModerationServiceOptions } from "./modules/community/application/services/community-moderation-service.js";
export type {
  CommunitySessionServiceOptions,
  DevelopmentSessionGrant,
} from "./modules/community/application/services/community-session-service.js";
export type {
  CommunityIdentityPort,
  SessionRecordInput,
} from "./modules/community/application/ports/community-identity-port.js";
export type { CatalogPublicationPort } from "./modules/community/application/ports/catalog-publication-port.js";
export type {
  CommentInsert,
  CommentPageQuery,
  CommunityCommentPort,
  ModeratedSubject,
  ModerationEvent,
  ModerationEventAction,
  OperatorCommentQueryInput,
  ReplyInsert,
  ReplyPageQuery,
} from "./modules/community/application/ports/community-comment-port.js";
export type {
  CatalogCommentRecord,
  CatalogCommentReplyRecord,
  CatalogCommentWithReplies,
  CommentAuthorRecord,
  CommentPageRecord,
} from "./modules/community/domain/catalog-comment.js";
export type {
  PublicUserRecord,
  PublicUserStatus,
} from "./modules/community/domain/public-user.js";

export type { CatalogQueryPort } from "./modules/catalog/application/ports/catalog-query-port.js";
export type {
  ResolvedMediaUrl,
  StorageMediaLocator,
  StorageUrlResolver,
} from "./modules/catalog/application/ports/storage-url-resolver.js";
export type { CatalogListQuery } from "./modules/catalog/application/queries/catalog-list-query.js";
export type {
  CatalogFieldState,
  CatalogContributorProjection,
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogListPageProjection,
  CatalogMediaProjection,
  CatalogSourceCitationProjection,
  CatalogStatefulTextProjection,
} from "./modules/catalog/application/catalog-read-projections.js";
export type { CatalogRecord } from "./modules/catalog/domain/catalog-record.js";
