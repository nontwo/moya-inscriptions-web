import { describe, expect, it } from "vitest";

import { mapCatalogDetail, mapCatalogPage, mapCatalogSummary } from "@moya/api";
import {
  catalogDetailSchema,
  catalogIdSchema,
  catalogPageSchema,
  catalogSummarySchema,
} from "@moya/contracts/schemas";

const id = catalogIdSchema.parse("catalog-mapper-001");

const internalListItem = {
  id,
  kind: "calligraphy" as const,
  title: "虚构书帖甲",
  aliases: ["虚构别名"],
  summary: "公开摘要",
  periodLabel: "宋",
  sourceId: "source-internal-001",
  evidence: { reviewedBy: "internal" },
  objectKey: "private/catalog-mapper-001.tif",
};

const internalDetail = {
  ...internalListItem,
  description: "公开详情",
  rawSource: { sourcePath: "private/raw-source.json" },
  sourceCitations: [
    {
      label: "虚构公开名录",
      citation: "第 2 页",
      url: "https://example.com/catalogue",
      sourceId: "source-internal-001",
      verificationState: "approved",
      internalNotes: "not public",
    },
  ],
};

describe("Catalog public-contract mapper", () => {
  it("maps only approved summary fields", () => {
    const summary = mapCatalogSummary(internalListItem);

    expect(summary).toEqual({
      id,
      kind: "calligraphy",
      title: "虚构书帖甲",
      aliases: ["虚构别名"],
      summary: "公开摘要",
      periodLabel: "宋",
    });
    expect(summary).not.toBe(internalListItem);
    expect(summary.aliases).not.toBe(internalListItem.aliases);
    expect(catalogSummarySchema.parse(summary)).toEqual(summary);
  });

  it("curates citations and excludes every wider internal field", () => {
    const detail = mapCatalogDetail(internalDetail);

    expect(detail).toEqual({
      id,
      kind: "calligraphy",
      title: "虚构书帖甲",
      aliases: ["虚构别名"],
      summary: "公开摘要",
      periodLabel: "宋",
      description: "公开详情",
      sourceCitations: [
        {
          label: "虚构公开名录",
          citation: "第 2 页",
          url: "https://example.com/catalogue",
        },
      ],
    });
    expect(catalogDetailSchema.parse(detail)).toEqual(detail);

    const serialized = JSON.stringify(detail);
    for (const internalField of [
      "sourceId",
      "evidence",
      "objectKey",
      "rawSource",
      "verificationState",
      "internalNotes",
    ]) {
      expect(serialized).not.toContain(internalField);
    }
  });

  it("maps list items and pagination without reusing projection objects", () => {
    const pageProjection = {
      items: [internalListItem],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      internalCursor: "not-public",
    };

    const page = mapCatalogPage(pageProjection);

    expect(page).toEqual({
      items: [mapCatalogSummary(internalListItem)],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    expect(page).not.toBe(pageProjection);
    expect(page.items[0]).not.toBe(internalListItem);
    expect(catalogPageSchema.parse(page)).toEqual(page);
  });

  it("omits absent optional fields and rejects invalid public values", () => {
    expect(
      mapCatalogSummary({
        id,
        kind: "inscription",
        title: "虚构碑刻乙",
        aliases: [],
      }),
    ).toEqual({
      id,
      kind: "inscription",
      title: "虚构碑刻乙",
      aliases: [],
    });

    expect(() =>
      mapCatalogSummary({
        id,
        kind: "inscription",
        title: " invalid ",
        aliases: [],
      }),
    ).toThrow();
  });
});
