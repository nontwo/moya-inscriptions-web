import { z } from "zod";

import {
  catalogSourceSchema,
  coordinatesSchema,
  dataQualityFlagSchema,
  heritageRecordSchema,
  historicalPeriodSchema,
  imageAssetSchema,
  normalizedRegionSchema,
  referenceSchema,
  regionCandidateSchema,
  regionCandidateSourceSchema,
  regionEnrichmentSchema,
  regionSchema,
  sourceCatalogRowSchema,
} from "./catalog-schemas.js";
import {
  firstBatchSourceIdSchema,
  siteIdSchema,
  sourceIdSchema,
} from "./identity-schemas.js";
import {
  categoryFacetListSuccessSchema,
  categoryFacetSchema,
  healthResponseSchema,
  publicRegionSchema,
  regionFacetListSuccessSchema,
  regionFacetSchema,
  siteDetailSuccessSchema,
  siteDetailSchema,
  sitePageSchema,
  sitePageSuccessSchema,
  siteSummarySchema,
} from "./public-schemas.js";
import {
  paginationQuerySchema,
  siteListQuerySchema,
  siteListTransportQuerySchema,
  siteSearchQuerySchema,
  siteSearchTransportQuerySchema,
} from "./query-schemas.js";
import {
  apiErrorSchema,
  invalidQueryDetailsSchema,
  paginatedResponseSchema,
} from "./response-schemas.js";

const toJsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "draft-2020-12" });

export const sourceIdJsonSchema = toJsonSchema(sourceIdSchema);
export const siteIdJsonSchema = toJsonSchema(siteIdSchema);
export const firstBatchSourceIdJsonSchema = toJsonSchema(
  firstBatchSourceIdSchema,
);
export const sourceCatalogRowJsonSchema = toJsonSchema(sourceCatalogRowSchema);
export const regionCandidateSourceJsonSchema = toJsonSchema(
  regionCandidateSourceSchema,
);
export const regionCandidateJsonSchema = toJsonSchema(regionCandidateSchema);
export const regionEnrichmentJsonSchema = toJsonSchema(regionEnrichmentSchema);
export const normalizedRegionJsonSchema = toJsonSchema(normalizedRegionSchema);
export const coordinatesJsonSchema = toJsonSchema(coordinatesSchema);
export const catalogSourceJsonSchema = toJsonSchema(catalogSourceSchema);
export const historicalPeriodJsonSchema = toJsonSchema(historicalPeriodSchema);
export const heritageRecordJsonSchema = toJsonSchema(heritageRecordSchema);
export const regionJsonSchema = toJsonSchema(regionSchema);
export const dataQualityFlagJsonSchema = toJsonSchema(dataQualityFlagSchema);
export const imageAssetJsonSchema = toJsonSchema(imageAssetSchema);
export const referenceJsonSchema = toJsonSchema(referenceSchema);
export const siteSummaryJsonSchema = toJsonSchema(siteSummarySchema);
export const siteDetailJsonSchema = toJsonSchema(siteDetailSchema);
export const publicRegionJsonSchema = toJsonSchema(publicRegionSchema);
export const categoryFacetJsonSchema = toJsonSchema(categoryFacetSchema);
export const regionFacetJsonSchema = toJsonSchema(regionFacetSchema);
export const healthResponseJsonSchema = toJsonSchema(healthResponseSchema);
export const sitePageJsonSchema = toJsonSchema(sitePageSchema);
export const sitePageSuccessJsonSchema = toJsonSchema(sitePageSuccessSchema);
export const siteDetailSuccessJsonSchema = toJsonSchema(
  siteDetailSuccessSchema,
);
export const regionFacetListSuccessJsonSchema = toJsonSchema(
  regionFacetListSuccessSchema,
);
export const categoryFacetListSuccessJsonSchema = toJsonSchema(
  categoryFacetListSuccessSchema,
);
export const paginationQueryJsonSchema = toJsonSchema(paginationQuerySchema);
export const siteListTransportQueryJsonSchema = toJsonSchema(
  siteListTransportQuerySchema,
);
export const siteSearchTransportQueryJsonSchema = toJsonSchema(
  siteSearchTransportQuerySchema,
);
export const siteListQueryJsonSchema = toJsonSchema(siteListQuerySchema);
export const siteSearchQueryJsonSchema = toJsonSchema(siteSearchQuerySchema);
export const paginatedResponseJsonSchema = toJsonSchema(
  paginatedResponseSchema,
);
export const apiErrorJsonSchema = toJsonSchema(apiErrorSchema);
export const invalidQueryDetailsJsonSchema = toJsonSchema(
  invalidQueryDetailsSchema,
);
