import { readFile } from "node:fs/promises";

import * as contractsRoot from "@moya/contracts";
import * as contractJsonSchemas from "@moya/contracts/json-schema";
import * as contractSchemas from "@moya/contracts/schemas";
import * as contractsTypes from "@moya/contracts/types";
import type {
  FirstBatchSourceId,
  SiteId,
  SiteListQuery,
  SiteSearchQuery,
  SourceId,
} from "@moya/contracts";
import {
  apiErrorSchema,
  createApiSuccessSchema,
  createPaginatedResponseSchema,
  firstBatchSourceIdSchema,
  parseSiteListQuery,
  parseSiteSearchQuery,
  siteDetailSchema,
  siteIdSchema,
  siteSearchQuerySchema,
  siteSummarySchema,
  sourceIdSchema,
} from "@moya/contracts/schemas";
import {
  sourceCatalogRowJsonSchema,
  siteSummaryJsonSchema,
} from "@moya/contracts/json-schema";
import { describe, expect, it } from "vitest";

const assertIdentityTypeRelations = (
  sourceId: SourceId,
  siteId: SiteId,
  firstBatchSourceId: FirstBatchSourceId,
) => {
  const sourceFromFirstBatch: SourceId = firstBatchSourceId;
  // @ts-expect-error A generic SourceId is not necessarily a first-batch ID.
  const firstBatchFromSource: FirstBatchSourceId = sourceId;
  // @ts-expect-error Provenance identity cannot be used as platform identity.
  const siteFromSource: SiteId = sourceId;
  // @ts-expect-error Platform identity cannot be used as provenance identity.
  const sourceFromSite: SourceId = siteId;

  void sourceFromFirstBatch;
  void firstBatchFromSource;
  void siteFromSource;
  void sourceFromSite;
};

void assertIdentityTypeRelations;

const legacyRuntimeSchemaNames = [
  "apiErrorSchema",
  "catalogSourceSchema",
  "coordinatesSchema",
  "dataQualityFlagSchema",
  "heritageRecordSchema",
  "historicalPeriodSchema",
  "imageAssetSchema",
  "normalizedRegionSchema",
  "paginatedResponseSchema",
  "paginationQuerySchema",
  "referenceSchema",
  "regionCandidateSchema",
  "regionCandidateSourceSchema",
  "regionEnrichmentSchema",
  "regionSchema",
  "siteDetailSchema",
  "siteSearchQuerySchema",
  "siteSummarySchema",
  "sourceCatalogRowSchema",
] as const;

const baseSummary = {
  id: "site-example",
  title: "测试碑刻",
  aliases: [],
  region: { province: "测试省" },
  historicalPeriod: { label: "测试年代" },
  dataStatus: "catalog-only" as const,
  categoryIds: [],
  imageIds: [],
};

describe("identity contracts", () => {
  it("separates SiteId and SourceId while keeping opaque wire strings", () => {
    const siteId = siteIdSchema.parse("site-example");
    const sourceId = sourceIdSchema.parse("future-source:record-1");
    const sourceIsSite: SourceId extends SiteId ? true : false = false;
    const siteIsSource: SiteId extends SourceId ? true : false = false;
    const firstBatchIsSource: FirstBatchSourceId extends SourceId
      ? true
      : false = true;

    expect(siteId).toBe("site-example");
    expect(sourceId).toBe("future-source:record-1");
    expect(sourceIsSite).toBe(false);
    expect(siteIsSource).toBe(false);
    expect(firstBatchIsSource).toBe(true);
  });

  it("limits the first-batch pattern to its dedicated source schema", () => {
    expect(firstBatchSourceIdSchema.parse("first-batch-0001")).toBe(
      "first-batch-0001",
    );
    expect(
      firstBatchSourceIdSchema.safeParse("future-source:record-1").success,
    ).toBe(false);
    expect(sourceIdSchema.parse("future-source:record-1")).toBe(
      "future-source:record-1",
    );
    expect(sourceIdSchema.parse("first-batch-0001")).toBe("first-batch-0001");
    expect(siteIdSchema.safeParse("").success).toBe(false);
    expect(sourceIdSchema.safeParse("").success).toBe(false);
    expect(firstBatchSourceIdSchema.safeParse("").success).toBe(false);
    expect(firstBatchSourceIdSchema.safeParse("first-batch-001").success).toBe(
      false,
    );
  });
});

describe("public DTO boundary", () => {
  it("parses strict public summaries with SiteId", () => {
    const summary = siteSummarySchema.parse(baseSummary);
    expect(summary).toEqual(baseSummary);
    expect(summary.id).toBe(siteIdSchema.parse(baseSummary.id));
  });

  it("keeps the current public region boundary province-only", () => {
    expect(
      siteSummarySchema.safeParse({
        ...baseSummary,
        region: { province: "测试省", city: "测试市" },
      }).success,
    ).toBe(false);
    expect(
      siteSummarySchema.safeParse({
        ...baseSummary,
        region: { province: "测试省", county: "测试县" },
      }).success,
    ).toBe(false);
  });

  it.each([
    "rawSource",
    "regionCandidates",
    "candidate",
    "evidence",
    "internalEvidence",
    "auditMetadata",
    "selectedCandidateIndex",
    "reviewNotes",
    "needsReview",
  ])("rejects internal field %s", (field) => {
    expect(
      siteSummarySchema.safeParse({ ...baseSummary, [field]: {} }).success,
    ).toBe(false);
  });

  it("does not expose persistence timestamps from SiteDetail", () => {
    const detail = {
      ...baseSummary,
      images: [],
      references: [],
      relatedSites: [],
    };
    expect(siteDetailSchema.parse(detail)).toEqual(detail);
    expect(
      siteDetailSchema.safeParse({ ...detail, createdAt: "2026-08-08" })
        .success,
    ).toBe(false);
    expect(
      siteDetailSchema.safeParse({ ...detail, updatedAt: "2026-08-08" })
        .success,
    ).toBe(false);
  });

  it("does not accept an internal HeritageRecord as SiteDetail", async () => {
    const sample = JSON.parse(
      await readFile(
        new URL(
          "../../../data/catalog/first-batch/normalized-sample.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown[];
    expect(siteDetailSchema.safeParse(sample[0]).success).toBe(false);
  });
});

describe("transport and normalized query contracts", () => {
  it("normalizes list query defaults and numeric strings", () => {
    const defaults: SiteListQuery = parseSiteListQuery({});
    const explicit = parseSiteListQuery({
      province: "浙江省",
      page: "3",
      pageSize: "40",
      sortBy: "title",
      sortOrder: "asc",
    });
    expect(defaults).toEqual({ page: 1, pageSize: 20 });
    expect(explicit).toEqual({
      province: "浙江省",
      page: 3,
      pageSize: 40,
      sortBy: "title",
      sortOrder: "asc",
    });
  });

  it("rejects lower-level filters, createdAt sort, and invalid pagination", () => {
    expect(() => parseSiteListQuery({ city: "杭州市" })).toThrow();
    expect(() => parseSiteListQuery({ county: "西湖区" })).toThrow();
    expect(() => parseSiteListQuery({ sortBy: "createdAt" })).toThrow();
    expect(() => parseSiteListQuery({ page: "0" })).toThrow();
    expect(() => parseSiteListQuery({ page: "-1" })).toThrow();
    expect(() => parseSiteListQuery({ page: "1.5" })).toThrow();
    expect(() => parseSiteListQuery({ page: "NaN" })).toThrow();
    expect(() => parseSiteListQuery({ pageSize: "0" })).toThrow();
    expect(() => parseSiteListQuery({ pageSize: "-1" })).toThrow();
    expect(() => parseSiteListQuery({ pageSize: "1.5" })).toThrow();
    expect(() => parseSiteListQuery({ pageSize: "many" })).toThrow();
    expect(() => parseSiteListQuery({ pageSize: "101" })).toThrow();
  });

  it("requires search keyword and permits relevance sorting", () => {
    expect(() => parseSiteSearchQuery({})).toThrow();
    const query: SiteSearchQuery = parseSiteSearchQuery({
      keyword: "摩崖",
      sortBy: "relevance",
    });
    expect(query).toEqual({
      keyword: "摩崖",
      page: 1,
      pageSize: 20,
      sortBy: "relevance",
    });
    expect(
      siteSearchQuerySchema.safeParse({ ...query, city: "杭州市" }).success,
    ).toBe(false);
  });
});

describe("pagination and response contracts", () => {
  it("uses items and enforces totalPages semantics", () => {
    const pageSchema = createPaginatedResponseSchema(siteSummarySchema);
    expect(
      pageSchema.parse({
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        items: [],
      }),
    ).toEqual({
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      items: [],
    });
    expect(
      pageSchema.safeParse({
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        data: [],
      }).success,
    ).toBe(false);
    expect(
      pageSchema.safeParse({
        total: 10,
        page: 1,
        pageSize: 3,
        totalPages: 3,
        items: [],
      }).success,
    ).toBe(false);
    expect(
      pageSchema.parse({
        total: 10,
        page: 99,
        pageSize: 3,
        totalPages: 4,
        items: [],
      }),
    ).toEqual({
      total: 10,
      page: 99,
      pageSize: 3,
      totalPages: 4,
      items: [],
    });
  });

  it("keeps success envelopes schema-derived", () => {
    const successSchema = createApiSuccessSchema(siteSummarySchema);
    expect(successSchema.parse({ success: true, data: baseSummary })).toEqual({
      success: true,
      data: baseSummary,
    });
  });

  it("allows only stable public error codes and safe details", () => {
    const invalidQuery = {
      success: false as const,
      error: {
        code: "INVALID_QUERY" as const,
        message: "查询参数无效",
        requestId: "request-1",
        details: { issues: [{ field: "page", message: "必须为正整数" }] },
      },
    };
    expect(apiErrorSchema.parse(invalidQuery)).toEqual(invalidQuery);
    expect(
      apiErrorSchema.safeParse({
        success: false,
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "数据库不可用",
          requestId: "request-2",
        },
      }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "服务不可用",
          requestId: "request-3",
          details: { issues: [] },
        },
      }).success,
    ).toBe(false);
    expect(
      apiErrorSchema.safeParse({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "内部错误",
          requestId: "request-4",
          details: { stack: "driver stack" },
        },
      }).success,
    ).toBe(false);
  });
});

describe("package and JSON Schema boundaries", () => {
  it("keeps the root runtime surface empty", () => {
    expect(Object.keys(contractsRoot)).toEqual([]);
    expect(Object.keys(contractsTypes)).toEqual([]);
  });

  it("derives Draft 2020-12 JSON Schema from runtime contracts", () => {
    expect(sourceCatalogRowJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
    });
    expect(siteSummaryJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
    });
  });

  it("gives every legacy runtime schema an explicit subpath destination", async () => {
    const compatibilityMap = await readFile(
      new URL(
        "../../../packages/contracts/EXPORT_COMPATIBILITY.md",
        import.meta.url,
      ),
      "utf8",
    );

    for (const schemaName of legacyRuntimeSchemaNames) {
      expect(contractSchemas).toHaveProperty(schemaName);
      expect(contractsRoot).not.toHaveProperty(schemaName);
      expect(compatibilityMap).toContain(`\`${schemaName}\``);

      const jsonSchemaName = schemaName.replace(/Schema$/, "JsonSchema");
      expect(contractJsonSchemas).toHaveProperty(jsonSchemaName);
    }
    expect(compatibilityMap).toContain(
      "运行时值从手写 JSON Schema object 替换为 Zod",
    );
  });

  it("keeps root and types type-only while isolating runtime entrypoints", async () => {
    const packageManifest = JSON.parse(
      await readFile(
        new URL("../../../packages/contracts/package.json", import.meta.url),
        "utf8",
      ),
    ) as {
      sideEffects: boolean;
      exports: Record<string, { types: string; import: string }>;
    };
    const rootBundle = await readFile(
      new URL("../../../packages/contracts/dist/index.js", import.meta.url),
      "utf8",
    );
    const rootDeclaration = await readFile(
      new URL("../../../packages/contracts/dist/index.d.ts", import.meta.url),
      "utf8",
    );

    expect(packageManifest.sideEffects).toBe(false);
    expect(packageManifest.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./types": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./schemas": {
        types: "./dist/schemas.d.ts",
        import: "./dist/schemas.js",
      },
      "./json-schema": {
        types: "./dist/json-schema.d.ts",
        import: "./dist/json-schema.js",
      },
    });
    const rootRuntimeStatements = rootBundle
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//"));
    expect(rootRuntimeStatements).toEqual(["export {};"]);
    expect(rootBundle).not.toMatch(/^import\s/m);
    expect(rootBundle).not.toContain("zod");
    expect(rootDeclaration).not.toMatch(
      /from ["'].+\/(?:schemas|json-schema)(?:\.js)?["']/,
    );
    expect(rootDeclaration).not.toMatch(/^export\s+\{(?!\s*type\b)/m);
  });
});
