export { parseCatalogListQuery } from "./modules/catalog/transport/catalog-list-query-parser.js";
export {
  mapCatalogDetail,
  mapCatalogPage,
  mapCatalogSummary,
} from "./modules/catalog/application/mappers/catalog-public-contract-mapper.js";
export {
  CatalogQueryUnavailableError,
  isCatalogQueryUnavailableError,
} from "./modules/catalog/application/errors/catalog-query-unavailable-error.js";

export type { CatalogQueryPort } from "./modules/catalog/application/ports/catalog-query-port.js";
export type { CatalogListQuery } from "./modules/catalog/application/queries/catalog-list-query.js";
export type {
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogListPageProjection,
  CatalogSourceCitationProjection,
} from "./modules/catalog/application/catalog-read-projections.js";
export type { CatalogRecord } from "./modules/catalog/domain/catalog-record.js";
