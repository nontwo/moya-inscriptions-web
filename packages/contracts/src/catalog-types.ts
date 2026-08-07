import type { z } from "zod";

import type {
  catalogSourceSchema,
  coordinatesSchema,
  dataQualityFlagSchema,
  dataStatusSchema,
  heritageRecordSchema,
  historicalPeriodSchema,
  imageAssetSchema,
  normalizedRegionSchema,
  referenceSchema,
  regionCandidateSchema,
  regionCandidateSourceMethodSchema,
  regionCandidateSourceSchema,
  regionCandidateVerificationStatusSchema,
  regionEnrichmentSchema,
  regionSchema,
  sourceCatalogRowSchema,
} from "./catalog-schemas.js";
import type {
  firstBatchSourceIdSchema,
  siteIdSchema,
  sourceIdSchema,
} from "./identity-schemas.js";
import type {
  categoryFacetSchema,
  publicRegionSchema,
  siteDetailSchema,
  siteSummarySchema,
} from "./public-schemas.js";
import type {
  paginationQuerySchema,
  siteListQuerySchema,
  siteListTransportQuerySchema,
  siteSearchQuerySchema,
  siteSearchTransportQuerySchema,
} from "./query-schemas.js";
import type {
  apiErrorCodeSchema,
  apiErrorSchema,
  createApiSuccessSchema,
  createPaginatedResponseSchema,
  invalidQueryDetailsSchema,
  invalidQueryIssueSchema,
} from "./response-schemas.js";

export type SourceId = z.infer<typeof sourceIdSchema>;
export type SiteId = z.infer<typeof siteIdSchema>;
export type FirstBatchSourceId = z.infer<typeof firstBatchSourceIdSchema>;

export type SourceCatalogRow = z.infer<typeof sourceCatalogRowSchema>;
export type RegionCandidateSourceMethod = z.infer<
  typeof regionCandidateSourceMethodSchema
>;
export type RegionCandidateVerificationStatus = z.infer<
  typeof regionCandidateVerificationStatusSchema
>;
export type RegionCandidateSource = z.infer<typeof regionCandidateSourceSchema>;
export type RegionCandidate = z.infer<typeof regionCandidateSchema>;
export type RegionEnrichment = z.infer<typeof regionEnrichmentSchema>;
export type NormalizedRegion = z.infer<typeof normalizedRegionSchema>;
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type CatalogSource = z.infer<typeof catalogSourceSchema>;
export type DataStatus = z.infer<typeof dataStatusSchema>;
export type DataQualityFlag = z.infer<typeof dataQualityFlagSchema>;
export type HistoricalPeriod = z.infer<typeof historicalPeriodSchema>;
export type HeritageRecord = z.infer<typeof heritageRecordSchema>;
export type Region = z.infer<typeof regionSchema>;
export type ImageAsset = z.infer<typeof imageAssetSchema>;
export type Reference = z.infer<typeof referenceSchema>;

export type SiteSummary = z.infer<typeof siteSummarySchema>;
export type SiteDetail = z.infer<typeof siteDetailSchema>;
export type PublicRegion = z.infer<typeof publicRegionSchema>;
export type CategoryFacet = z.infer<typeof categoryFacetSchema>;

export type PaginationQuery = z.output<typeof paginationQuerySchema>;
export type SiteListTransportQuery = z.input<
  typeof siteListTransportQuerySchema
>;
export type SiteSearchTransportQuery = z.input<
  typeof siteSearchTransportQuerySchema
>;
export type SiteListQuery = z.output<typeof siteListQuerySchema>;
export type SiteSearchQuery = z.output<typeof siteSearchQuerySchema>;

export type InvalidQueryIssue = z.infer<typeof invalidQueryIssueSchema>;
export type InvalidQueryDetails = z.infer<typeof invalidQueryDetailsSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiSuccess<T> = z.infer<
  ReturnType<typeof createApiSuccessSchema<z.ZodType<T>>>
>;
export type PaginatedResponse<T> = z.infer<
  ReturnType<typeof createPaginatedResponseSchema<z.ZodType<T>>>
>;
