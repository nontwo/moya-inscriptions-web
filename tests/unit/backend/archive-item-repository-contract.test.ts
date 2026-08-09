import * as dataAccessRuntime from "@moya/data-access";
import type { ArchiveItemRepository } from "@moya/data-access";
import type {
  ArchiveItemDetail,
  ArchiveItemId,
  ArchiveItemListQuery,
  ArchiveItemListTransportQuery,
  ArchiveItemPage,
  ArchiveItemSearchQuery,
  ArchiveItemSearchTransportQuery,
  ArchiveItemSummary,
  CategoryFacet,
} from "@moya/contracts";
import {
  archiveItemDetailSchema,
  archiveItemIdSchema,
  archiveItemListQuerySchema,
  archiveItemPageSchema,
  archiveItemSearchQuerySchema,
  categoryFacetSchema,
} from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

const assertNormalizedInputs = (
  repository: ArchiveItemRepository,
  listQuery: ArchiveItemListQuery,
  listTransportQuery: ArchiveItemListTransportQuery,
  searchQuery: ArchiveItemSearchQuery,
  searchTransportQuery: ArchiveItemSearchTransportQuery,
) => {
  void repository.listItems(listQuery);
  void repository.searchItems(searchQuery);

  // @ts-expect-error Repository inputs are normalized, not transport values.
  void repository.listItems(listTransportQuery);
  // @ts-expect-error Repository inputs are normalized, not transport values.
  void repository.searchItems(searchTransportQuery);
};

void assertNormalizedInputs;

const firstId = archiveItemIdSchema.parse("archive-example-101");
const secondId = archiveItemIdSchema.parse("archive-example-102");
const missingId = archiveItemIdSchema.parse("archive-example-missing");

const details: ArchiveItemDetail[] = [
  {
    id: firstId,
    title: "虚构档案甲",
    aliases: [],
    historicalPeriod: { label: "虚构年代甲" },
    categoryIds: ["fictional-category"],
    images: [],
    references: [],
    relatedItemIds: [],
  },
  {
    id: secondId,
    title: "虚构档案乙",
    aliases: [],
    categoryIds: [],
    images: [],
    references: [],
    relatedItemIds: [],
  },
];

const toSummary = (detail: ArchiveItemDetail): ArchiveItemSummary => ({
  id: detail.id,
  title: detail.title,
  aliases: detail.aliases,
  categoryIds: detail.categoryIds,
  ...(detail.historicalPeriod === undefined
    ? {}
    : { historicalPeriod: detail.historicalPeriod }),
});

const paginate = (
  items: ArchiveItemSummary[],
  page: number,
  pageSize: number,
): ArchiveItemPage => ({
  items: items.slice((page - 1) * pageSize, page * pageSize),
  total: items.length,
  page,
  pageSize,
  totalPages: items.length === 0 ? 0 : Math.ceil(items.length / pageSize),
});

class FictionalArchiveItemRepository implements ArchiveItemRepository {
  async listItems(query: ArchiveItemListQuery): Promise<ArchiveItemPage> {
    const matching = details.filter(
      (item) =>
        (query.categoryId === undefined ||
          item.categoryIds.includes(query.categoryId)) &&
        (query.period === undefined ||
          item.historicalPeriod?.label === query.period),
    );
    return Promise.resolve(
      paginate(matching.map(toSummary), query.page, query.pageSize),
    );
  }

  async getItemById(id: ArchiveItemId): Promise<ArchiveItemDetail | null> {
    return Promise.resolve(details.find((item) => item.id === id) ?? null);
  }

  async searchItems(query: ArchiveItemSearchQuery): Promise<ArchiveItemPage> {
    const matching = details.filter((item) =>
      item.title.includes(query.keyword),
    );
    return Promise.resolve(
      paginate(matching.map(toSummary), query.page, query.pageSize),
    );
  }

  async listCategoryFacets(): Promise<CategoryFacet[]> {
    return Promise.resolve([
      { id: "fictional-category", label: "虚构分类", count: 1 },
    ]);
  }
}

describe("ArchiveItemRepository port", () => {
  it("uses the exact normalized public contract types", () => {
    const listInput: Equal<
      Parameters<ArchiveItemRepository["listItems"]>[0],
      ArchiveItemListQuery
    > = true;
    const searchInput: Equal<
      Parameters<ArchiveItemRepository["searchItems"]>[0],
      ArchiveItemSearchQuery
    > = true;
    const idInput: Equal<
      Parameters<ArchiveItemRepository["getItemById"]>[0],
      ArchiveItemId
    > = true;
    const listOutput: Equal<
      Awaited<ReturnType<ArchiveItemRepository["listItems"]>>,
      ArchiveItemPage
    > = true;
    const detailOutput: Equal<
      Awaited<ReturnType<ArchiveItemRepository["getItemById"]>>,
      ArchiveItemDetail | null
    > = true;

    expect([listInput, searchInput, idInput, listOutput, detailOutput]).toEqual(
      [true, true, true, true, true],
    );
  });

  it("has a types-only runtime surface", () => {
    expect(Object.keys(dataAccessRuntime)).toEqual([]);
  });

  it("normalizes transport query values before repository use", () => {
    expect(
      archiveItemListQuerySchema.parse({ page: "2", pageSize: "5" }),
    ).toEqual({
      page: 2,
      pageSize: 5,
      sortBy: "title",
      sortOrder: "asc",
    });
    expect(archiveItemSearchQuerySchema.parse({ keyword: "档案" })).toEqual({
      keyword: "档案",
      page: 1,
      pageSize: 20,
      sortBy: "relevance",
      sortOrder: "asc",
    });
  });

  it("returns only schema-valid public DTOs", async () => {
    const repository = new FictionalArchiveItemRepository();
    const page = await repository.listItems(
      archiveItemListQuerySchema.parse({}),
    );
    const detail = await repository.getItemById(firstId);
    const facets = await repository.listCategoryFacets();

    expect(archiveItemPageSchema.parse(page)).toEqual(page);
    expect(archiveItemDetailSchema.parse(detail)).toEqual(detail);
    expect(facets.map((facet) => categoryFacetSchema.parse(facet))).toEqual(
      facets,
    );
    await expect(repository.getItemById(missingId)).resolves.toBeNull();
  });

  it("keeps internal state out of serialized repository results", async () => {
    const repository = new FictionalArchiveItemRepository();
    const result = JSON.stringify({
      page: await repository.listItems(archiveItemListQuerySchema.parse({})),
      detail: await repository.getItemById(firstId),
    });
    const forbiddenFields = [
      ["life", "cycleStatus"],
      ["created", "At"],
      ["updated", "At"],
      ["trashed", "At"],
      ["raw", "Source"],
      ["source", "Index"],
      ["region", "Candidates"],
      ["review", "Evidence"],
    ].map((parts) => parts.join(""));

    for (const field of forbiddenFields) {
      expect(result).not.toContain(`"${field}"`);
    }
  });
});
