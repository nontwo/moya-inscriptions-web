// Dependency-free JSON Schema objects for the T01 public contracts.

const schemaVersion = "https://json-schema.org/draft/2020-12/schema";
const sourceIdPattern = "^first-batch-[0-9]{4}$";
const sha256Pattern = "^[0-9a-f]{64}$";

const nullableStringSchema = { type: ["string", "null"] } as const;

export const sourceCatalogRowSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: [
    "sourceIndex",
    "regionRaw",
    "nameRaw",
    "protectionOrCollectionUnitRaw",
    "periodRaw",
    "sourcePage",
    "sourceId",
    "needsReview",
  ],
  properties: {
    sourceIndex: { type: "integer", minimum: 1, maximum: 1658 },
    regionRaw: { type: "string", minLength: 1 },
    nameRaw: { type: "string", minLength: 1 },
    protectionOrCollectionUnitRaw: { type: "string", minLength: 1 },
    periodRaw: { type: "string", minLength: 1 },
    sourcePage: { type: "integer", minimum: 1, maximum: 38 },
    sourceId: { type: "string", pattern: sourceIdPattern },
    needsReview: { type: "boolean" },
    reviewNotes: { type: "array", items: { type: "string" } },
  },
} as const;

export const regionCandidateSourceSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["method", "label", "evidenceUrls", "notes"],
  properties: {
    method: {
      enum: [
        "unit_name_inference",
        "official_catalog",
        "academic_db",
        "local_chronicle",
        "web_search",
        "supplemental_workbook",
      ],
    },
    label: { type: "string", minLength: 1 },
    evidenceUrls: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

export const regionCandidateSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["province", "city", "county", "verificationStatus", "sources"],
  properties: {
    province: { type: "string", minLength: 1 },
    city: nullableStringSchema,
    county: nullableStringSchema,
    verificationStatus: { enum: ["unverified", "verified"] },
    sources: {
      type: "array",
      minItems: 1,
      items: regionCandidateSourceSchema,
    },
  },
} as const;

export const regionEnrichmentSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: [
    "sourceId",
    "sourceIndex",
    "regionRaw",
    "candidates",
    "selectedCandidateIndex",
    "needsReview",
    "reviewNotes",
  ],
  properties: {
    sourceId: { type: "string", pattern: sourceIdPattern },
    sourceIndex: { type: "integer", minimum: 1, maximum: 1658 },
    regionRaw: { type: "string", minLength: 1 },
    candidates: {
      type: "array",
      minItems: 1,
      items: regionCandidateSchema,
    },
    selectedCandidateIndex: { type: ["integer", "null"], minimum: 0 },
    needsReview: { type: "boolean" },
    reviewNotes: { type: "array", items: { type: "string" } },
  },
} as const;

export const normalizedRegionSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["province"],
  properties: {
    province: { type: "string", minLength: 1 },
    city: nullableStringSchema,
    county: nullableStringSchema,
  },
} as const;

export const coordinatesSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["latitude", "longitude"],
  properties: {
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
    coordinateSystem: { type: "string" },
    precision: { enum: ["exact", "approximate", "area"] },
  },
} as const;

export const catalogSourceSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: [
    "datasetName",
    "sourceFileName",
    "sourceFileSha256",
    "sourcePage",
    "sourceId",
  ],
  properties: {
    datasetName: { const: "第一批古代名碑名刻文物名录" },
    sourceFileName: { type: "string", minLength: 1 },
    sourceFileSha256: { type: "string", pattern: sha256Pattern },
    sourcePage: { type: "integer", minimum: 1, maximum: 38 },
    sourceId: { type: "string", pattern: sourceIdPattern },
  },
} as const;

export const historicalPeriodSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["label"],
  properties: {
    label: { type: "string", minLength: 1 },
    normalizedName: { type: "string" },
    yearStart: { type: "number" },
    yearEnd: { type: "number" },
  },
} as const;

export const heritageRecordSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "canonicalName",
    "aliases",
    "region",
    "regionCandidates",
    "historicalPeriod",
    "protectionOrCollectionUnit",
    "source",
    "dataStatus",
    "categoryIds",
    "imageIds",
    "bibliography",
    "rawSource",
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    canonicalName: { type: "string", minLength: 1 },
    aliases: { type: "array", items: { type: "string" } },
    region: normalizedRegionSchema,
    regionCandidates: { type: "array", items: regionCandidateSchema },
    historicalPeriod: historicalPeriodSchema,
    protectionOrCollectionUnit: { type: "string", minLength: 1 },
    source: catalogSourceSchema,
    dataStatus: {
      enum: ["catalog-only", "enriched", "verified", "published"],
    },
    categoryIds: { type: "array", items: { type: "string" } },
    imageIds: { type: "array", items: { type: "string" } },
    coordinates: coordinatesSchema,
    description: { type: "string" },
    bibliography: { type: "array", items: { type: "string" } },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
    rawSource: sourceCatalogRowSchema,
  },
} as const;

export const regionSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["name", "level"],
  properties: {
    name: { type: "string", minLength: 1 },
    level: { enum: ["province", "city", "county"] },
    id: { type: "string" },
    parentId: nullableStringSchema,
    fullName: { type: "string" },
    administrativeCode: { type: "string" },
  },
} as const;

export const dataQualityFlagSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["type", "description"],
  properties: {
    type: {
      enum: [
        "needs_review",
        "uncertain_region",
        "uncertain_period",
        "uncertain_name",
        "text_unreadable",
      ],
    },
    description: { type: "string", minLength: 1 },
    field: { type: "string" },
  },
} as const;

export const imageAssetSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["id", "objectKey"],
  properties: {
    id: { type: "string", minLength: 1 },
    objectKey: { type: "string", minLength: 1 },
    siteId: { type: "string" },
    thumbnailKey: { type: "string" },
    displayKey: { type: "string" },
    originalKey: { type: "string" },
    caption: { type: "string" },
    description: { type: "string" },
    imageType: { type: "string" },
    sortOrder: { type: "integer", minimum: 0 },
    width: { type: "integer", minimum: 1 },
    height: { type: "integer", minimum: 1 },
    fileSize: { type: "integer", minimum: 1 },
    format: { type: "string" },
    sha256: { type: "string", pattern: sha256Pattern },
  },
} as const;

export const referenceSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: {
    title: { type: "string", minLength: 1 },
    id: { type: "string" },
    author: { type: "string" },
    year: { type: "number" },
    sourceType: { type: "string" },
    publisher: { type: "string" },
    url: { type: "string" },
    citationText: { type: "string" },
    pages: { type: "string" },
  },
} as const;

const siteSummaryProperties = {
  id: { type: "string", minLength: 1 },
  title: { type: "string", minLength: 1 },
  aliases: { type: "array", items: { type: "string" } },
  region: normalizedRegionSchema,
  historicalPeriod: historicalPeriodSchema,
  dataStatus: {
    enum: ["catalog-only", "enriched", "verified", "published"],
  },
  categoryIds: { type: "array", items: { type: "string" } },
  imageIds: { type: "array", items: { type: "string" } },
  siteCode: { type: "string" },
  slug: { type: "string" },
  summary: { type: "string" },
  coverImageKey: { type: "string" },
  coverThumbnailKey: { type: "string" },
  tags: { type: "array", items: { type: "string" } },
} as const;

const siteSummaryRequired = [
  "id",
  "title",
  "aliases",
  "region",
  "historicalPeriod",
  "dataStatus",
  "categoryIds",
  "imageIds",
] as const;

export const siteSummarySchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: siteSummaryRequired,
  properties: siteSummaryProperties,
} as const;

export const siteDetailSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: [...siteSummaryRequired, "images", "references", "relatedSites"],
  properties: {
    ...siteSummaryProperties,
    fullTitle: { type: "string" },
    coordinates: coordinatesSchema,
    address: { type: "string" },
    dimensions: { type: "string" },
    wordCount: { type: "integer", minimum: 0 },
    calligrapher: { type: "string" },
    engraver: { type: "string" },
    inscriber: { type: "string" },
    preservationStatus: { type: "string" },
    description: { type: "string" },
    researchNotes: { type: "string" },
    images: { type: "array", items: imageAssetSchema },
    references: { type: "array", items: referenceSchema },
    relatedSites: { type: "array", items: siteSummarySchema },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

export const siteSearchQuerySchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  properties: {
    keyword: { type: "string" },
    period: { type: "string" },
    categoryId: { type: "string" },
    province: { type: "string" },
    city: { type: "string" },
    county: { type: "string" },
    page: { type: "integer", minimum: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
    sortBy: { enum: ["title", "period", "createdAt", "relevance"] },
  },
} as const;

export const paginationQuerySchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["page", "pageSize"],
  properties: {
    page: { type: "integer", minimum: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
    sortBy: { type: "string" },
    sortOrder: { enum: ["asc", "desc"] },
  },
} as const;

export const paginatedResponseSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["total", "page", "pageSize", "totalPages", "data"],
  properties: {
    total: { type: "integer", minimum: 0 },
    page: { type: "integer", minimum: 1 },
    pageSize: { type: "integer", minimum: 1 },
    totalPages: { type: "integer", minimum: 0 },
    data: { type: "array", items: {} },
  },
} as const;

export const apiErrorSchema = {
  $schema: schemaVersion,
  type: "object",
  additionalProperties: false,
  required: ["success", "error"],
  properties: {
    success: { const: false },
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
      },
    },
  },
} as const;
