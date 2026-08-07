import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as contracts from "../../../packages/contracts/src/index.js";
import type {
  HeritageRecord,
  RegionEnrichment,
  SourceCatalogRow,
} from "../../../packages/contracts/src/index.js";

type JsonObject = Record<string, unknown>;

const dataUrl = (fileName: string) =>
  new URL(`../../../data/catalog/first-batch/${fileName}`, import.meta.url);

async function loadJson<T>(fileName: string): Promise<T> {
  return JSON.parse(await readFile(dataUrl(fileName), "utf8")) as T;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesType(value: unknown, expected: string): boolean {
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return isObject(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") return typeof value === "number";
  return typeof value === expected;
}

/** Minimal validator for the JSON Schema keywords exported by this package. */
function validateJsonSchema(
  value: unknown,
  schemaValue: unknown,
  path = "$",
): string[] {
  if (!isObject(schemaValue) || Object.keys(schemaValue).length === 0)
    return [];
  const schema = schemaValue;
  const errors: string[] = [];

  if ("const" in schema && value !== schema.const) {
    errors.push(`${path}: expected constant ${String(schema.const)}`);
    return errors;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: value is not in enum`);
    return errors;
  }

  const expectedTypes = Array.isArray(schema.type)
    ? schema.type
    : typeof schema.type === "string"
      ? [schema.type]
      : [];
  if (
    expectedTypes.length > 0 &&
    !expectedTypes.some(
      (expected) =>
        typeof expected === "string" && matchesType(value, expected),
    )
  ) {
    errors.push(`${path}: unexpected type`);
    return errors;
  }

  if (typeof value === "string") {
    if (
      typeof schema.minLength === "number" &&
      value.length < schema.minLength
    ) {
      errors.push(`${path}: shorter than minLength`);
    }
    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern).test(value)
    ) {
      errors.push(`${path}: does not match pattern`);
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path}: below minimum`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path}: above maximum`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push(`${path}: fewer than minItems`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        errors.push(
          ...validateJsonSchema(item, schema.items, `${path}[${index}]`),
        );
      });
    }
  }

  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (typeof key === "string" && !(key in value)) {
        errors.push(`${path}.${key}: required property is missing`);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key in properties) {
        errors.push(
          ...validateJsonSchema(child, properties[key], `${path}.${key}`),
        );
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key}: additional property is not allowed`);
      }
    }
  }

  return errors;
}

const pageRanges = [
  [1, 1, 41],
  [2, 42, 86],
  [3, 87, 131],
  [4, 132, 176],
  [5, 177, 221],
  [6, 222, 266],
  [7, 267, 311],
  [8, 312, 356],
  [9, 357, 401],
  [10, 402, 446],
  [11, 447, 491],
  [12, 492, 535],
  [13, 536, 578],
  [14, 579, 623],
  [15, 624, 668],
  [16, 669, 713],
  [17, 714, 758],
  [18, 759, 802],
  [19, 803, 847],
  [20, 848, 892],
  [21, 893, 936],
  [22, 937, 981],
  [23, 982, 1026],
  [24, 1027, 1071],
  [25, 1072, 1114],
  [26, 1115, 1158],
  [27, 1159, 1202],
  [28, 1203, 1247],
  [29, 1248, 1292],
  [30, 1293, 1337],
  [31, 1338, 1382],
  [32, 1383, 1420],
  [33, 1421, 1464],
  [34, 1465, 1509],
  [35, 1510, 1553],
  [36, 1554, 1598],
  [37, 1599, 1642],
  [38, 1643, 1658],
] as const;

describe("T01 PDF source catalog", () => {
  it("contains exactly the continuous source rows and stable IDs", async () => {
    const rows = await loadJson<SourceCatalogRow[]>("source-catalog.json");
    expect(rows).toHaveLength(1658);
    expect(new Set(rows.map((row) => row.sourceIndex)).size).toBe(1658);
    expect(new Set(rows.map((row) => row.sourceId)).size).toBe(1658);
    rows.forEach((row, index) => {
      expect(row.sourceIndex).toBe(index + 1);
      expect(row.sourceId).toBe(
        `first-batch-${String(index + 1).padStart(4, "0")}`,
      );
    });
  });

  it("preserves all five non-empty PDF fields", async () => {
    const rows = await loadJson<SourceCatalogRow[]>("source-catalog.json");
    for (const row of rows) {
      expect(row.regionRaw.length).toBeGreaterThan(0);
      expect(row.nameRaw.length).toBeGreaterThan(0);
      expect(row.protectionOrCollectionUnitRaw.length).toBeGreaterThan(0);
      expect(row.periodRaw.length).toBeGreaterThan(0);
      expect(row).not.toHaveProperty("estimatedSourcePage");
    }
  });

  it("uses the exact PDF page ranges", async () => {
    const rows = await loadJson<SourceCatalogRow[]>("source-catalog.json");
    for (const [page, start, end] of pageRanges) {
      for (let sourceIndex = start; sourceIndex <= end; sourceIndex += 1) {
        expect(rows[sourceIndex - 1]?.sourcePage).toBe(page);
      }
    }
  });

  it("validates every row against the exported JSON Schema", async () => {
    const rows = await loadJson<SourceCatalogRow[]>("source-catalog.json");
    const errors = rows.flatMap((row) =>
      validateJsonSchema(row, contracts.sourceCatalogRowSchema),
    );
    expect(errors).toEqual([]);
  });

  it("keeps source 1000 once and preserves the unreadable mark in 1307", async () => {
    const rows = await loadJson<SourceCatalogRow[]>("source-catalog.json");
    const row1000 = rows.filter((row) => row.sourceIndex === 1000);
    expect(row1000).toHaveLength(1);
    expect(row1000[0]?.nameRaw).toBe("宋景祐二年祖庙祭文");
    expect(row1000[0]?.needsReview).toBe(false);

    const row1307 = rows[1306];
    expect(row1307?.nameRaw).toBe("元延祐己未年伯华?题“仁山”石刻");
    expect(row1307?.needsReview).toBe(true);
    expect(rows.filter((row) => row.needsReview)).toHaveLength(1);
  });

  it("retains separate records when names are identical", async () => {
    const rows = await loadJson<SourceCatalogRow[]>("source-catalog.json");
    const counts = new Map<string, number>();
    rows.forEach((row) =>
      counts.set(row.nameRaw, (counts.get(row.nameRaw) ?? 0) + 1),
    );
    expect([...counts.values()].some((count) => count > 1)).toBe(true);
    expect(rows).toHaveLength(1658);
  });
});

describe("T01 unverified region candidates", () => {
  it("keeps one enrichment record for every source row", async () => {
    const rows = await loadJson<SourceCatalogRow[]>("source-catalog.json");
    const enrichments = await loadJson<RegionEnrichment[]>(
      "region-enrichment.json",
    );
    expect(enrichments).toHaveLength(1658);
    enrichments.forEach((enrichment, index) => {
      expect(enrichment.sourceIndex).toBe(rows[index]?.sourceIndex);
      expect(enrichment.sourceId).toBe(rows[index]?.sourceId);
      expect(enrichment.regionRaw).toBe(rows[index]?.regionRaw);
    });
  });

  it("validates every enrichment record against its JSON Schema", async () => {
    const enrichments = await loadJson<RegionEnrichment[]>(
      "region-enrichment.json",
    );
    const errors = enrichments.flatMap((row) =>
      validateJsonSchema(row, contracts.regionEnrichmentSchema),
    );
    expect(errors).toEqual([]);
  });

  it("keeps all candidates unselected and unverified without evidence URLs", async () => {
    const enrichments = await loadJson<RegionEnrichment[]>(
      "region-enrichment.json",
    );
    for (const enrichment of enrichments) {
      expect(enrichment.needsReview).toBe(true);
      expect(enrichment.selectedCandidateIndex).toBeNull();
      for (const candidate of enrichment.candidates) {
        expect(candidate.verificationStatus).toBe("unverified");
        expect(candidate.sources.length).toBeGreaterThan(0);
        candidate.sources.forEach((source) =>
          expect(source.evidenceUrls).toEqual([]),
        );
      }
    }
  });

  it("preserves exactly the seven workbook conflicts as two candidates", async () => {
    const enrichments = await loadJson<RegionEnrichment[]>(
      "region-enrichment.json",
    );
    const conflicts = enrichments.filter((row) => row.candidates.length > 1);
    expect(conflicts.map((row) => row.sourceIndex)).toEqual([
      941, 943, 974, 1112, 1505, 1622, 1628,
    ]);
    expect(conflicts.every((row) => row.candidates.length === 2)).toBe(true);
    expect(enrichments.flatMap((row) => row.candidates)).toHaveLength(1665);
  });

  it("does not allow city and county to be silently duplicated", async () => {
    const enrichments = await loadJson<RegionEnrichment[]>(
      "region-enrichment.json",
    );
    const violations = enrichments.flatMap((row) =>
      row.candidates.filter(
        (candidate) =>
          candidate.city !== null && candidate.city === candidate.county,
      ),
    );
    expect(violations).toEqual([]);
    expect(
      enrichments.some((row) =>
        row.candidates.some(
          (candidate) => candidate.city === null || candidate.county === null,
        ),
      ),
    ).toBe(true);
  });
});

describe("T01 normalized sample and public contracts", () => {
  it("maps only the five selected examples without promoting candidates", async () => {
    const samples = await loadJson<HeritageRecord[]>("normalized-sample.json");
    expect(samples.map((sample) => sample.rawSource.sourceIndex)).toEqual([
      1, 498, 783, 1307, 1658,
    ]);
    for (const sample of samples) {
      expect(
        validateJsonSchema(sample, contracts.heritageRecordSchema),
      ).toEqual([]);
      expect(sample.region).toEqual({ province: sample.rawSource.regionRaw });
      expect(sample.aliases).toEqual([]);
      expect(sample.categoryIds).toEqual([]);
      expect(sample.imageIds).toEqual([]);
      expect(sample).not.toHaveProperty("coordinates");
      expect(sample).not.toHaveProperty("description");
      expect(
        sample.regionCandidates.every(
          (candidate) => candidate.verificationStatus === "unverified",
        ),
      ).toBe(true);
    }
  });

  it("exports dependency-free JSON Schema objects from the public entry", () => {
    const requiredExports = [
      contracts.sourceCatalogRowSchema,
      contracts.heritageRecordSchema,
      contracts.siteSummarySchema,
      contracts.siteDetailSchema,
      contracts.imageAssetSchema,
      contracts.siteSearchQuerySchema,
      contracts.paginatedResponseSchema,
      contracts.apiErrorSchema,
      contracts.regionEnrichmentSchema,
    ];
    requiredExports.forEach((schema) => {
      expect(schema.$schema).toBe(
        "https://json-schema.org/draft/2020-12/schema",
      );
      expect(schema).not.toHaveProperty("parse");
      expect(schema).not.toHaveProperty("safeParse");
    });
  });

  it("accepts absent future fields and rejects image URLs", async () => {
    const samples = await loadJson<HeritageRecord[]>("normalized-sample.json");
    expect(
      validateJsonSchema(samples[0], contracts.heritageRecordSchema),
    ).toEqual([]);
    expect(
      validateJsonSchema(
        { id: "image-1", objectKey: "catalog/first-batch/image-1.jpg" },
        contracts.imageAssetSchema,
      ),
    ).toEqual([]);
    expect(
      validateJsonSchema(
        {
          id: "image-1",
          objectKey: "catalog/first-batch/image-1.jpg",
          url: "https://production.example/image-1.jpg",
        },
        contracts.imageAssetSchema,
      ),
    ).not.toEqual([]);
  });
});
