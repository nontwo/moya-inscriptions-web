import { z } from "zod";

import { firstBatchSourceIdSchema, siteIdSchema } from "./identity-schemas.js";

const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

/** PDF 中一条源记录，五个 Raw 字段必须逐字保留。 */
export const sourceCatalogRowSchema = z.strictObject({
  sourceIndex: z.number().int().min(1).max(1658),
  regionRaw: z.string().min(1),
  nameRaw: z.string().min(1),
  protectionOrCollectionUnitRaw: z.string().min(1),
  periodRaw: z.string().min(1),
  sourcePage: z.number().int().min(1).max(38),
  sourceId: firstBatchSourceIdSchema,
  needsReview: z.boolean(),
  reviewNotes: z.array(z.string()).optional(),
});

export const regionCandidateSourceMethodSchema = z.enum([
  "unit_name_inference",
  "official_catalog",
  "academic_db",
  "local_chronicle",
  "web_search",
  "supplemental_workbook",
]);

export const regionCandidateVerificationStatusSchema = z.enum([
  "unverified",
  "verified",
]);

/** D01 owns future evidence semantics; T04.0 preserves the T01 wire shape only. */
export const regionCandidateSourceSchema = z.strictObject({
  method: regionCandidateSourceMethodSchema,
  label: z.string().min(1),
  evidenceUrls: z.array(z.string()),
  notes: z.array(z.string()),
});

/** D01 owns region redesign and verification policy. */
export const regionCandidateSchema = z.strictObject({
  province: z.string().min(1),
  city: z.string().nullable(),
  county: z.string().nullable(),
  verificationStatus: regionCandidateVerificationStatusSchema,
  sources: z.array(regionCandidateSourceSchema).min(1),
});

/** No candidate is selected or resolved by this contract migration. */
export const regionEnrichmentSchema = z
  .strictObject({
    sourceId: firstBatchSourceIdSchema,
    sourceIndex: z.number().int().min(1).max(1658),
    regionRaw: z.string().min(1),
    candidates: z.array(regionCandidateSchema).min(1),
    selectedCandidateIndex: z.number().int().min(0).nullable(),
    needsReview: z.boolean(),
    reviewNotes: z.array(z.string()),
  })
  .superRefine((value, context) => {
    if (
      value.selectedCandidateIndex !== null &&
      value.selectedCandidateIndex >= value.candidates.length
    ) {
      context.addIssue({
        code: "custom",
        message: "selectedCandidateIndex must reference an existing candidate",
        path: ["selectedCandidateIndex"],
      });
    }
  });

/** Current T01 normalized shape; D01 owns its future administrative model. */
export const normalizedRegionSchema = z.strictObject({
  province: z.string().min(1),
  city: z.string().nullable().optional(),
  county: z.string().nullable().optional(),
});

export const coordinatesSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  coordinateSystem: z.string().optional(),
  precision: z.enum(["exact", "approximate", "area"]).optional(),
});

export const catalogSourceSchema = z.strictObject({
  datasetName: z.literal("第一批古代名碑名刻文物名录"),
  sourceFileName: z.string().min(1),
  sourceFileSha256: sha256Schema,
  sourcePage: z.number().int().min(1).max(38),
  sourceId: firstBatchSourceIdSchema,
});

export const dataStatusSchema = z.enum([
  "catalog-only",
  "enriched",
  "verified",
  "published",
]);

export const dataQualityFlagSchema = z.strictObject({
  type: z.enum([
    "needs_review",
    "uncertain_region",
    "uncertain_period",
    "uncertain_name",
    "text_unreadable",
  ]),
  description: z.string().min(1),
  field: z.string().optional(),
});

export const historicalPeriodSchema = z.strictObject({
  label: z.string().min(1),
  normalizedName: z.string().optional(),
  yearStart: z.number().optional(),
  yearEnd: z.number().optional(),
});

/** Internal normalized/domain model; it is not a public API DTO. */
export const heritageRecordSchema = z.strictObject({
  id: z.string().min(1),
  canonicalName: z.string().min(1),
  aliases: z.array(z.string()),
  region: normalizedRegionSchema,
  regionCandidates: z.array(regionCandidateSchema),
  historicalPeriod: historicalPeriodSchema,
  protectionOrCollectionUnit: z.string().min(1),
  source: catalogSourceSchema,
  dataStatus: dataStatusSchema,
  categoryIds: z.array(z.string()),
  imageIds: z.array(z.string()),
  coordinates: coordinatesSchema.optional(),
  description: z.string().optional(),
  bibliography: z.array(z.string()),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  rawSource: sourceCatalogRowSchema,
});

/** Current T01 shape only; D01 owns the future administrative model. */
export const regionSchema = z.strictObject({
  name: z.string().min(1),
  level: z.enum(["province", "city", "county"]),
  id: z.string().optional(),
  parentId: z.string().nullable().optional(),
  fullName: z.string().optional(),
  administrativeCode: z.string().optional(),
});

/** 图片只保存对象键，访问 URL 由图片服务派生。 */
export const imageAssetSchema = z.strictObject({
  id: z.string().min(1),
  objectKey: z.string().min(1),
  // T04.0 only brands this existing optional identifier. Ownership,
  // cardinality and record relationships remain deferred to T05.
  siteId: siteIdSchema.optional(),
  thumbnailKey: z.string().optional(),
  displayKey: z.string().optional(),
  originalKey: z.string().optional(),
  caption: z.string().optional(),
  description: z.string().optional(),
  imageType: z.string().optional(),
  sortOrder: z.number().int().min(0).optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  fileSize: z.number().int().min(1).optional(),
  format: z.string().optional(),
  sha256: sha256Schema.optional(),
});

export const referenceSchema = z.strictObject({
  title: z.string().min(1),
  id: z.string().optional(),
  author: z.string().optional(),
  year: z.number().optional(),
  sourceType: z.string().optional(),
  publisher: z.string().optional(),
  url: z.string().optional(),
  citationText: z.string().optional(),
  pages: z.string().optional(),
});
