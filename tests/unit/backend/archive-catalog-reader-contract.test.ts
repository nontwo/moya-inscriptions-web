import * as dataAccessRuntime from "@moya/data-access";
import type { ArchiveCatalogReader } from "@moya/data-access";
import type {
  ArchiveItemDetail,
  ArchiveItemId,
  ArchiveItemListQuery,
  ArchiveItemListTransportQuery,
  ArchiveItemPage,
  ArchiveItemSummary,
} from "@moya/contracts";
import {
  archiveItemDetailSchema,
  archiveItemIdSchema,
  archiveItemListQueryParserSchema,
  archiveItemPageSchema,
} from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

const assertNormalizedInputs = (
  reader: ArchiveCatalogReader,
  query: ArchiveItemListQuery,
  transportQuery: ArchiveItemListTransportQuery,
) => {
  void reader.listItems(query);

  // @ts-expect-error Reader inputs are normalized, not HTTP strings.
  void reader.listItems(transportQuery);
};

void assertNormalizedInputs;

const firstId = archiveItemIdSchema.parse("archive-example-101");
const secondId = archiveItemIdSchema.parse("archive-example-102");
const missingId = archiveItemIdSchema.parse("archive-example-missing");

const details: ArchiveItemDetail[] = [
  {
    id: firstId,
    title: "虚构碑刻甲",
    aliases: [],
    periodLabel: "虚构年代甲",
    provinceLabel: "虚构省份甲",
    protectionOrCollectionUnitLabel: "虚构保护单位甲",
    sources: [{ label: "虚构公开名录甲" }],
  },
  {
    id: secondId,
    title: "虚构碑刻乙",
    aliases: [],
    sources: [],
  },
];

const toSummary = (detail: ArchiveItemDetail): ArchiveItemSummary => ({
  id: detail.id,
  title: detail.title,
  aliases: detail.aliases,
  ...(detail.summary === undefined ? {} : { summary: detail.summary }),
  ...(detail.periodLabel === undefined
    ? {}
    : { periodLabel: detail.periodLabel }),
  ...(detail.provinceLabel === undefined
    ? {}
    : { provinceLabel: detail.provinceLabel }),
  ...(detail.protectionOrCollectionUnitLabel === undefined
    ? {}
    : {
        protectionOrCollectionUnitLabel: detail.protectionOrCollectionUnitLabel,
      }),
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

class FictionalArchiveCatalogReader implements ArchiveCatalogReader {
  async listItems(query: ArchiveItemListQuery): Promise<ArchiveItemPage> {
    return Promise.resolve(
      paginate(details.map(toSummary), query.page, query.pageSize),
    );
  }

  async getItemById(id: ArchiveItemId): Promise<ArchiveItemDetail | null> {
    return Promise.resolve(details.find((item) => item.id === id) ?? null);
  }
}

describe("ArchiveCatalogReader port", () => {
  it("uses exact normalized public contract types", () => {
    const listInput: Equal<
      Parameters<ArchiveCatalogReader["listItems"]>[0],
      ArchiveItemListQuery
    > = true;
    const idInput: Equal<
      Parameters<ArchiveCatalogReader["getItemById"]>[0],
      ArchiveItemId
    > = true;
    const listOutput: Equal<
      Awaited<ReturnType<ArchiveCatalogReader["listItems"]>>,
      ArchiveItemPage
    > = true;
    const detailOutput: Equal<
      Awaited<ReturnType<ArchiveCatalogReader["getItemById"]>>,
      ArchiveItemDetail | null
    > = true;

    expect([listInput, idInput, listOutput, detailOutput]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it("has a types-only runtime surface", () => {
    expect(Object.keys(dataAccessRuntime)).toEqual([]);
  });

  it("normalizes HTTP query strings before Reader use", () => {
    expect(
      archiveItemListQueryParserSchema.parse({ page: "2", pageSize: "5" }),
    ).toEqual({ page: 2, pageSize: 5 });
  });

  it("returns schema-valid deterministic pages and null for a missing item", async () => {
    const reader = new FictionalArchiveCatalogReader();
    const firstPage = await reader.listItems(
      archiveItemListQueryParserSchema.parse({ page: "1", pageSize: "1" }),
    );
    const outOfRange = await reader.listItems(
      archiveItemListQueryParserSchema.parse({ page: "3", pageSize: "1" }),
    );

    expect(archiveItemPageSchema.parse(firstPage)).toEqual(firstPage);
    expect(firstPage.items).toHaveLength(1);
    expect(outOfRange).toMatchObject({
      items: [],
      total: 2,
      page: 3,
      pageSize: 1,
      totalPages: 2,
    });
    await expect(reader.getItemById(missingId)).resolves.toBeNull();
    expect(
      archiveItemDetailSchema.parse(await reader.getItemById(firstId)),
    ).toEqual(details[0]);
  });

  it("keeps deferred internal and feature state out of results", async () => {
    const reader = new FictionalArchiveCatalogReader();
    const serialized = JSON.stringify({
      page: await reader.listItems(archiveItemListQueryParserSchema.parse({})),
      detail: await reader.getItemById(secondId),
    });

    for (const field of [
      "lifecycleStatus",
      "createdAt",
      "updatedAt",
      "rawSource",
      "objectKey",
      "images",
      "relatedItemIds",
      "categoryIds",
    ]) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });
});
