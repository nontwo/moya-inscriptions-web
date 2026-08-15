import { describe, expect, it } from "vitest";

import {
  CatalogMediaResolutionError,
  mapCatalogDetail,
  mapCatalogPage,
  mapCatalogSummary,
} from "@moya/api";
import {
  catalogDetailSchema,
  catalogIdSchema,
  catalogPageSchema,
  catalogSummarySchema,
  mediaIdSchema,
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
  ownerDecision: { accepted: true, decidedBy: "owner" },
  objectKey: "private/catalog-mapper-001.tif",
  migrationMetadata: { migrationId: "internal" },
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
      internalRightsNotes: "private rights note",
      storagePath: "/private/storage/path",
    },
  ],
  media: [],
};

const representativeMedia = {
  id: mediaIdSchema.parse("media-mapper-representative"),
  position: 2,
  isRepresentative: true,
  kind: "image" as const,
  alt: "虚构代表图",
  width: 1_600,
  height: 1_200,
  objectKey: "private/catalog-mapper-representative.tif",
  bucket: "must-not-leak",
  provider: "must-not-leak",
};

const galleryMedia = {
  id: mediaIdSchema.parse("media-mapper-gallery"),
  position: 0,
  isRepresentative: false,
  kind: "image" as const,
  alt: "虚构图集图",
  width: 800,
  height: 1_200,
  objectKey: "private/catalog-mapper-gallery.tif",
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
      media: [],
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
      "ownerDecision",
      "objectKey",
      "migrationMetadata",
      "rawSource",
      "verificationState",
      "internalNotes",
      "internalRightsNotes",
      "storagePath",
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

  it("maps resolved Media without leaking storage facts or inferring representative order", () => {
    const projection = {
      ...internalDetail,
      representativeMedia,
      media: [galleryMedia, representativeMedia],
    };
    const resolved = new Map([
      [
        representativeMedia.id,
        "https://media.example.invalid/representative.jpg",
      ],
      [galleryMedia.id, "https://media.example.invalid/gallery.jpg"],
    ]);

    const detail = mapCatalogDetail(projection, resolved);

    expect(detail.representativeMedia?.id).toBe(representativeMedia.id);
    expect(detail.media.map(({ id }) => id)).toEqual([
      galleryMedia.id,
      representativeMedia.id,
    ]);
    const serialized = JSON.stringify(detail);
    for (const privateField of [
      "position",
      "isRepresentative",
      "objectKey",
      "bucket",
      "provider",
      "private/catalog",
    ]) {
      expect(serialized).not.toContain(privateField);
    }
  });

  it("fails closed for missing or invalid resolved Media URLs", () => {
    const projection = { ...internalListItem, representativeMedia };

    expect(() => mapCatalogSummary(projection, new Map())).toThrow(
      CatalogMediaResolutionError,
    );
    expect(() =>
      mapCatalogSummary(
        projection,
        new Map([[representativeMedia.id, "not-a-url"]]),
      ),
    ).toThrow(CatalogMediaResolutionError);
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

    expect(() =>
      mapCatalogSummary({
        id,
        kind: "cliff_inscription",
        title: "虚构退役分类条目",
        aliases: [],
      } as never),
    ).toThrow();
  });
});
