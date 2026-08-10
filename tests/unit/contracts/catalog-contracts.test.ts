import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  ArchiveItemId,
  CatalogDetail,
  CatalogId,
  CatalogKind,
  CatalogListTransportQuery,
  CatalogPage,
  CatalogSummary,
} from "@moya/contracts";
import {
  archiveItemIdJsonSchema,
  catalogDetailJsonSchema,
  catalogIdJsonSchema,
  catalogKindJsonSchema,
  catalogListTransportQueryJsonSchema,
  catalogPageJsonSchema,
  catalogSummaryJsonSchema,
} from "@moya/contracts/json-schema";
import {
  archiveItemIdSchema,
  catalogDetailSchema,
  catalogIdSchema,
  catalogKindSchema,
  catalogListTransportQuerySchema,
  catalogPageSchema,
  catalogSummarySchema,
} from "@moya/contracts/schemas";

describe("canonical Catalog identity", () => {
  it("keeps ArchiveItemId as the same TypeScript identity", () => {
    expectTypeOf<ArchiveItemId>().toEqualTypeOf<CatalogId>();
    expectTypeOf<CatalogId>().toEqualTypeOf<ArchiveItemId>();
  });

  it("keeps Catalog and Archive validation semantics equivalent", () => {
    const valid = [
      "catalog-001",
      "platform-item-any-format",
      "碑刻-甲",
      "x".repeat(128),
    ];
    const invalid = ["", " ", "catalog item", "catalog\nitem", "x".repeat(129)];

    for (const candidate of [...valid, ...invalid]) {
      const catalogResult = catalogIdSchema.safeParse(candidate);
      const archiveResult = archiveItemIdSchema.safeParse(candidate);

      expect(archiveResult.success).toBe(catalogResult.success);
      if (catalogResult.success && archiveResult.success) {
        expect(archiveResult.data).toBe(catalogResult.data);
      }
    }

    for (const candidate of valid) {
      expect(catalogIdSchema.safeParse(candidate).success).toBe(true);
    }
    for (const candidate of invalid) {
      expect(catalogIdSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("generates both JSON Schema exports without requiring metadata identity", () => {
    expect(catalogIdJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^\\S+$",
    });
    expect(archiveItemIdJsonSchema).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^\\S+$",
    });
  });
});

describe("CatalogKind", () => {
  it("accepts exactly the three frozen values", () => {
    const kinds: CatalogKind[] = [
      "inscription",
      "cliff_inscription",
      "calligraphy",
    ];

    for (const kind of kinds) {
      expect(catalogKindSchema.parse(kind)).toBe(kind);
    }
    for (const kind of ["seal", "painting", "sculpture", "video"]) {
      expect(catalogKindSchema.safeParse(kind).success).toBe(false);
    }

    expect(catalogKindSchema.options).toEqual(kinds);
    expect(catalogKindJsonSchema).toMatchObject({
      enum: kinds,
      type: "string",
    });
  });
});

const catalogId = catalogIdSchema.parse("catalog-example-001");

const catalogSummary: CatalogSummary = {
  id: catalogId,
  kind: "cliff_inscription",
  title: "虚构摩崖甲",
  aliases: ["虚构别名"],
  summary: "公开摘要",
  periodLabel: "唐",
};

const catalogDetail: CatalogDetail = {
  ...catalogSummary,
  description: "公开详情",
  sourceCitations: [
    {
      label: "虚构公开名录",
      citation: "第 1 页",
      url: "https://example.com/catalogue",
    },
  ],
};

describe("Catalog public contracts", () => {
  it("accepts the frozen summary and detail fields", () => {
    expect(catalogSummarySchema.parse(catalogSummary)).toEqual(catalogSummary);
    expect(catalogDetailSchema.parse(catalogDetail)).toEqual(catalogDetail);
  });

  it("rejects internal-only fields under the strict public policy", () => {
    for (const field of [
      "sourceId",
      "rawSource",
      "rawRegion",
      "evidence",
      "verificationState",
      "humanDecision",
      "workflowNotes",
      "adminNotes",
      "objectKey",
      "storageProvider",
    ]) {
      expect(
        catalogDetailSchema.safeParse({
          ...catalogDetail,
          [field]: "internal-only",
        }).success,
      ).toBe(false);
    }

    expect(
      catalogDetailSchema.safeParse({
        ...catalogDetail,
        sourceCitations: [
          {
            ...catalogDetail.sourceCitations[0],
            sourceId: "source-internal-001",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps transport query values as validated strings", () => {
    const query: CatalogListTransportQuery = {
      page: "2",
      pageSize: "25",
    };

    expect(catalogListTransportQuerySchema.parse(query)).toEqual(query);
    expect(catalogListTransportQuerySchema.parse({})).toEqual({});
    for (const invalid of [
      { page: "0" },
      { page: "01" },
      { page: "1.5" },
      { page: "9007199254740992" },
      { pageSize: "101" },
      { pageSize: 20 },
      { keyword: "碑" },
    ]) {
      expect(catalogListTransportQuerySchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });

  it("uses the existing self-consistent pagination model", () => {
    const page: CatalogPage = {
      items: [catalogSummary],
      total: 2,
      page: 1,
      pageSize: 1,
      totalPages: 2,
    };

    expect(catalogPageSchema.parse(page)).toEqual(page);
    expect(
      catalogPageSchema.safeParse({ ...page, totalPages: 1 }).success,
    ).toBe(false);
    expect(catalogPageSchema.safeParse({ ...page, page: 3 }).success).toBe(
      false,
    );
    expect(
      catalogPageSchema.parse({
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

  it("exports strict Draft 2020-12 JSON Schemas", () => {
    for (const schema of [
      catalogSummaryJsonSchema,
      catalogDetailJsonSchema,
      catalogListTransportQueryJsonSchema,
      catalogPageJsonSchema,
    ]) {
      expect(schema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
      });
    }
  });
});
