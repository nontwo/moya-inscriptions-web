import type {
  CategoryFacet,
  PaginatedResponse,
  RegionFacet,
  SiteDetail,
  SiteId,
  SiteListQuery,
  SiteSearchQuery,
  SiteSummary,
} from "@moya/contracts";

/**
 * Stable catalog persistence port.
 *
 * It accepts normalized domain queries and deliberately has no HTTP,
 * validation-library or infrastructure concerns.
 */
export interface CatalogRepository {
  listSites(query: SiteListQuery): Promise<PaginatedResponse<SiteSummary>>;

  getSiteById(id: SiteId): Promise<SiteDetail | null>;

  listRegionFacets(): Promise<RegionFacet[]>;

  listCategoryFacets(): Promise<CategoryFacet[]>;

  searchSites(query: SiteSearchQuery): Promise<PaginatedResponse<SiteSummary>>;
}
