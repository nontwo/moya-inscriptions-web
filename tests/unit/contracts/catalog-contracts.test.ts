import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  HeritageRecord,
  ImageAsset,
  RegionEnrichment,
  SourceCatalogRow,
} from "@moya/contracts";
import {
  heritageRecordSchema,
  imageAssetSchema,
  regionCandidateSchema,
  regionEnrichmentSchema,
  sourceCatalogRowSchema,
} from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

const dataUrl = (fileName: string) =>
  new URL(`../../../data/catalog/first-batch/${fileName}`, import.meta.url);

async function loadJson(fileName: string): Promise<unknown> {
  return JSON.parse(await readFile(dataUrl(fileName), "utf8"));
}

const loadSourceRows = async (): Promise<SourceCatalogRow[]> =>
  sourceCatalogRowSchema.array().parse(await loadJson("source-catalog.json"));

const loadEnrichments = async (): Promise<RegionEnrichment[]> =>
  regionEnrichmentSchema
    .array()
    .parse(await loadJson("region-enrichment.json"));

const loadSamples = async (): Promise<HeritageRecord[]> =>
  heritageRecordSchema.array().parse(await loadJson("normalized-sample.json"));

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
  it("protects the immutable raw-source hash", async () => {
    const source = await readFile(dataUrl("source-catalog.json"));
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "73a2c711700cdace7f74fc38d4ccd6866bc14a63ce6ac41fac9aa989c8912f7b",
    );
  });

  it("parses without changing values and keeps continuous stable IDs", async () => {
    const original = await loadJson("source-catalog.json");
    const rows = sourceCatalogRowSchema.array().parse(original);
    expect(rows).toEqual(original);
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
    const rows = await loadSourceRows();
    for (const row of rows) {
      expect(row.regionRaw.length).toBeGreaterThan(0);
      expect(row.nameRaw.length).toBeGreaterThan(0);
      expect(row.protectionOrCollectionUnitRaw.length).toBeGreaterThan(0);
      expect(row.periodRaw.length).toBeGreaterThan(0);
      expect(row).not.toHaveProperty("estimatedSourcePage");
    }
  });

  it("uses the exact PDF page ranges", async () => {
    const rows = await loadSourceRows();
    for (const [page, start, end] of pageRanges) {
      for (let sourceIndex = start; sourceIndex <= end; sourceIndex += 1) {
        expect(rows[sourceIndex - 1]?.sourcePage).toBe(page);
      }
    }
  });

  it("keeps source 1000 once and preserves the unreadable mark in 1307", async () => {
    const rows = await loadSourceRows();
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
    const rows = await loadSourceRows();
    const counts = new Map<string, number>();
    rows.forEach((row) =>
      counts.set(row.nameRaw, (counts.get(row.nameRaw) ?? 0) + 1),
    );
    expect([...counts.values()].some((count) => count > 1)).toBe(true);
    expect(rows).toHaveLength(1658);
  });
});

describe("T01 region candidate compatibility", () => {
  it("parses current enrichment data without changing any value", async () => {
    const original = await loadJson("region-enrichment.json");
    expect(regionEnrichmentSchema.array().parse(original)).toEqual(original);
  });

  it("preserves source provenance links", async () => {
    const rows = await loadSourceRows();
    const enrichments = await loadEnrichments();
    expect(enrichments).toHaveLength(rows.length);
    enrichments.forEach((enrichment, index) => {
      expect(enrichment.sourceIndex).toBe(rows[index]?.sourceIndex);
      expect(enrichment.sourceId).toBe(rows[index]?.sourceId);
      expect(enrichment.regionRaw).toBe(rows[index]?.regionRaw);
      if (enrichment.selectedCandidateIndex !== null) {
        expect(enrichment.selectedCandidateIndex).toBeLessThan(
          enrichment.candidates.length,
        );
      }
    });
  });

  it("does not invent a verified-evidence policy owned by D01", () => {
    const candidate = {
      province: "测试省",
      city: null,
      county: null,
      verificationStatus: "verified" as const,
      sources: [
        {
          method: "official_catalog" as const,
          label: "测试来源",
          evidenceUrls: [],
          notes: [],
        },
      ],
    };
    expect(regionCandidateSchema.parse(candidate)).toEqual(candidate);
  });
});

describe("T01 normalized sample and public boundary inputs", () => {
  it("parses samples without changing historical identity facts", async () => {
    const original = await loadJson("normalized-sample.json");
    const samples = heritageRecordSchema.array().parse(original);
    expect(samples).toEqual(original);
    for (const sample of samples) {
      expect(sample.source.sourceId).toBe(sample.rawSource.sourceId);
      expect(sample.source.sourcePage).toBe(sample.rawSource.sourcePage);
    }
  });

  it("keeps image assets object-key only", () => {
    const image = {
      id: "image-1",
      objectKey: "catalog/first-batch/image-1.jpg",
    };
    expect(imageAssetSchema.parse(image)).toEqual(image);
    expect(
      imageAssetSchema.safeParse({
        ...image,
        url: "https://production.example/image-1.jpg",
      }).success,
    ).toBe(false);
  });

  it("keeps ImageAsset.siteId optional and non-null", () => {
    const image = {
      id: "image-1",
      objectKey: "catalog/first-batch/image-1.jpg",
    };
    const unlinkedImage: ImageAsset = image;
    // @ts-expect-error null remains outside the existing ImageAsset contract.
    const nullLinkedImage: ImageAsset = { ...image, siteId: null };

    expect(imageAssetSchema.parse(unlinkedImage)).toEqual(image);
    expect(
      imageAssetSchema.parse({ ...image, siteId: "site-example" }),
    ).toEqual({ ...image, siteId: "site-example" });
    expect(imageAssetSchema.safeParse({ ...image, siteId: "" }).success).toBe(
      false,
    );
    expect(imageAssetSchema.safeParse({ ...image, siteId: null }).success).toBe(
      false,
    );
    void nullLinkedImage;
  });

  it("keeps the loaded normalized sample typed as the internal model", async () => {
    const samples = await loadSamples();
    expect(samples.every((sample) => sample.rawSource !== undefined)).toBe(
      true,
    );
  });
});
