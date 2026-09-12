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
export { mapPublicUserProfile } from "./modules/community/application/mappers/community-public-contract-mapper.js";
export { CommunitySessionService } from "./modules/community/application/services/community-session-service.js";
export type {
  CommunitySessionServiceOptions,
  DevelopmentSessionGrant,
} from "./modules/community/application/services/community-session-service.js";
export type {
  CommunityIdentityPort,
  SessionRecordInput,
} from "./modules/community/application/ports/community-identity-port.js";
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
