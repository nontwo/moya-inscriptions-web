import { describe, expect, it } from "vitest";

import type {
  ArchiveItemDetail,
  ArchiveItemSummary,
  PublicSourceCitation,
} from "@moya/contracts";
import {
  archiveItemDetailJsonSchema,
  archiveItemSummaryJsonSchema,
  publicSourceCitationJsonSchema,
} from "@moya/contracts/json-schema";
import {
  archiveItemDetailSchema,
  archiveItemIdSchema,
  archiveItemListQueryParserSchema,
  archiveItemListQuerySchema,
  archiveItemListTransportQuerySchema,
  archiveItemPageSchema,
  archiveItemSummarySchema,
  publicSourceCitationSchema,
} from "@moya/contracts/schemas";

const archiveItemId = archiveItemIdSchema.parse("archive-example-001");

const minimalSummary: ArchiveItemSummary = {
  id: archiveItemId,
  title: "虚构碑刻甲",
  aliases: [],
};

const sourceCitation: PublicSourceCitation = {
  label: "虚构公开名录",
  citation: "第 1 页",
  url: "https://example.com/catalogue",
};

const detailedItem: ArchiveItemDetail = {
  ...minimalSummary,
  periodLabel: "唐",
  provinceLabel: "陕西省",
  protectionOrCollectionUnitLabel: "虚构保护单位",
  sources: [sourceCitation],
};

describe("inscription-first public archive contracts", () => {
  it("represents the first-batch public display facts without internal source state", () => {
    expect(archiveItemSummarySchema.parse(minimalSummary)).toEqual(
      minimalSummary,
    );
    expect(archiveItemDetailSchema.parse(detailedItem)).toEqual(detailedItem);
    expect(publicSourceCitationSchema.parse(sourceCitation)).toEqual(
      sourceCitation,
    );
  });

  it("keeps T04.0 Archive DTOs free of internal and not-yet-defined Media fields", () => {
    for (const field of [
      "lifecycleStatus",
      "rawSource",
      "sourcePath",
      "importBatch",
      "reviewStatus",
      "moderation",
      "reviewNotes",
      "internalNotes",
      "deletedAt",
      "evidence",
      "databaseId",
      "ormMetadata",
      "media",
      "src",
      "objectKey",
      "bucket",
      "storageProvider",
      "providerMetadata",
      "images",
      "relatedItemIds",
      "coordinates",
      "city",
      "county",
      "categoryIds",
    ]) {
      expect(
        archiveItemDetailSchema.safeParse({
          ...detailedItem,
          [field]: field === "images" ? [] : "forbidden",
        }).success,
      ).toBe(false);
    }
  });

  it("validates DTO text without silently trimming or transforming it", () => {
    expect(archiveItemSummarySchema.parse(minimalSummary)).toEqual(
      minimalSummary,
    );
    expect(
      archiveItemSummarySchema.safeParse({
        ...minimalSummary,
        title: " 虚构碑刻甲 ",
      }).success,
    ).toBe(false);
    expect(
      publicSourceCitationSchema.safeParse({
        label: " ",
      }).success,
    ).toBe(false);
  });

  it("keeps ArchiveItemId opaque and independent of source-record patterns", () => {
    expect(archiveItemIdSchema.parse("platform-item-any-format")).toBe(
      "platform-item-any-format",
    );
    expect(archiveItemIdSchema.safeParse("first batch 0001").success).toBe(
      false,
    );
  });

  it("separates HTTP query strings from normalized Reader inputs", () => {
    expect(
      archiveItemListTransportQuerySchema.parse({
        page: "2",
        pageSize: "5",
      }),
    ).toEqual({ page: "2", pageSize: "5" });
    expect(
      archiveItemListQueryParserSchema.parse({ page: "2", pageSize: "5" }),
    ).toEqual({ page: 2, pageSize: 5 });
    expect(archiveItemListQueryParserSchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(
      archiveItemListQuerySchema.safeParse({ page: "2", pageSize: "5" })
        .success,
    ).toBe(false);
    for (const invalid of [
      { page: "0" },
      { page: "01" },
      { page: "1.5" },
      { pageSize: "101" },
    ]) {
      expect(archiveItemListQueryParserSchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });

  it("enforces self-consistent page metadata and empty out-of-range pages", () => {
    const validPage = {
      items: [minimalSummary],
      total: 2,
      page: 1,
      pageSize: 1,
      totalPages: 2,
    };

    expect(archiveItemPageSchema.parse(validPage)).toEqual(validPage);
    expect(
      archiveItemPageSchema.safeParse({ ...validPage, totalPages: 1 }).success,
    ).toBe(false);
    expect(
      archiveItemPageSchema.safeParse({
        items: [minimalSummary],
        total: 1,
        page: 2,
        pageSize: 1,
        totalPages: 1,
      }).success,
    ).toBe(false);
    expect(
      archiveItemPageSchema.parse({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      }),
    ).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
  });

  it("exports strict JSON Schema projections", () => {
    for (const schema of [
      archiveItemSummaryJsonSchema,
      archiveItemDetailJsonSchema,
      publicSourceCitationJsonSchema,
    ]) {
      expect(schema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it("keeps the package root types-only at runtime", async () => {
    expect(Object.keys(await import("@moya/contracts"))).toEqual([]);
  });
});
