import type { CatalogSearchMatchKind } from "@moya/contracts";
import type {
  CatalogListItemProjection,
  CatalogListPageProjection,
} from "../catalog-read-projections.js";
import type { CatalogSearchQuery } from "../queries/catalog-search-query.js";

export interface CatalogSearchItemProjection extends CatalogListItemProjection {
  readonly matchKind: CatalogSearchMatchKind;
}
export interface CatalogSearchPageProjection extends CatalogListPageProjection {
  readonly items: readonly CatalogSearchItemProjection[];
}
export interface CatalogSearchQueryPort {
  search(query: CatalogSearchQuery): Promise<CatalogSearchPageProjection>;
}
