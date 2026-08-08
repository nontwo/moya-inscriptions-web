import type { CatalogRepository } from "@moya/data-access";
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
import { siteIdSchema } from "@moya/contracts/schemas";

import { runCatalogRepositoryContractSuite } from "./catalog-repository.contract-suite.js";

const records: SiteDetail[] = [
  {
    id: siteIdSchema.parse("site-0001"),
    title: "大佛寺摩崖题刻",
    aliases: [],
    region: { province: "浙江省" },
    historicalPeriod: { label: "唐" },
    dataStatus: "catalog-only" as const,
    categoryIds: [],
    imageIds: [],
    images: [],
    references: [],
    relatedSites: [],
  },
  {
    id: siteIdSchema.parse("site-0002"),
    title: "天台山摩崖石刻",
    aliases: [],
    region: { province: "浙江省" },
    historicalPeriod: { label: "宋" },
    dataStatus: "catalog-only" as const,
    categoryIds: [],
    imageIds: [],
    images: [],
    references: [],
    relatedSites: [],
  },
  {
    id: siteIdSchema.parse("site-0003"),
    title: "大足石刻",
    aliases: [],
    region: { province: "重庆市" },
    historicalPeriod: { label: "宋" },
    dataStatus: "catalog-only" as const,
    categoryIds: [],
    imageIds: [],
    images: [],
    references: [],
    relatedSites: [],
  },
];

const paginate = <Item>(
  items: Item[],
  page: number,
  pageSize: number,
): PaginatedResponse<Item> => ({
  total: items.length,
  page,
  pageSize,
  totalPages: items.length === 0 ? 0 : Math.ceil(items.length / pageSize),
  items: items.slice((page - 1) * pageSize, page * pageSize),
});

const toSummary = (site: SiteDetail): SiteSummary => ({
  id: site.id,
  title: site.title,
  aliases: site.aliases,
  region: site.region,
  historicalPeriod: site.historicalPeriod,
  dataStatus: site.dataStatus,
  categoryIds: site.categoryIds,
  imageIds: site.imageIds,
});

class InMemoryCatalogRepository implements CatalogRepository {
  async listSites(
    query: SiteListQuery,
  ): Promise<PaginatedResponse<SiteSummary>> {
    const matching = records.filter(
      (site) =>
        (query.province === undefined ||
          site.region.province === query.province) &&
        (query.period === undefined ||
          site.historicalPeriod.label === query.period) &&
        (query.categoryId === undefined ||
          site.categoryIds.includes(query.categoryId)),
    );
    return Promise.resolve(
      paginate(matching.map(toSummary), query.page, query.pageSize),
    );
  }

  async getSiteById(id: SiteId): Promise<SiteDetail | null> {
    return Promise.resolve(records.find((site) => site.id === id) ?? null);
  }

  async listRegionFacets(): Promise<RegionFacet[]> {
    return Promise.resolve([
      { province: "浙江省", count: 2 },
      { province: "重庆市", count: 1 },
    ]);
  }

  async listCategoryFacets(): Promise<CategoryFacet[]> {
    return Promise.resolve([]);
  }

  async searchSites(
    query: SiteSearchQuery,
  ): Promise<PaginatedResponse<SiteSummary>> {
    const matching = records.filter((site) =>
      site.title.includes(query.keyword),
    );
    return Promise.resolve(
      paginate(matching.map(toSummary), query.page, query.pageSize),
    );
  }
}

runCatalogRepositoryContractSuite("in-memory", {
  createRepository: () => new InMemoryCatalogRepository(),
  existingSiteId: siteIdSchema.parse("site-0001"),
  missingSiteId: siteIdSchema.parse("site-missing"),
});
