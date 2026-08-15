export { parseCatalogListQuery } from "./modules/catalog/transport/catalog-list-query-parser.js";
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

export type { CatalogQueryPort } from "./modules/catalog/application/ports/catalog-query-port.js";
export type {
  ResolvedMediaUrl,
  StorageMediaLocator,
  StorageUrlResolver,
} from "./modules/catalog/application/ports/storage-url-resolver.js";
export type { CatalogListQuery } from "./modules/catalog/application/queries/catalog-list-query.js";
export type {
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogListPageProjection,
  CatalogMediaProjection,
  CatalogSourceCitationProjection,
} from "./modules/catalog/application/catalog-read-projections.js";
export type { CatalogRecord } from "./modules/catalog/domain/catalog-record.js";
