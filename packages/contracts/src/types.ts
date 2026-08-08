import type { z } from "zod";

import type {
  archiveItemDetailSchema,
  archiveItemIdSchema,
  archiveItemListQuerySchema,
  archiveItemLifecycleStatusSchema,
  archiveItemPageSchema,
  archiveItemRecordSchema,
  archiveItemSearchQuerySchema,
  archiveItemSummarySchema,
  apiErrorCodeSchema,
  apiErrorSchema,
  categoryFacetListSchema,
  categoryFacetSchema,
  coordinatesSchema,
  healthResponseSchema,
  historicalPeriodSchema,
  imageAssetSchema,
  publicLocationSchema,
  referenceSchema,
} from "./schemas.js";

export type ArchiveItemId = z.infer<typeof archiveItemIdSchema>;
export type ArchiveItemLifecycleStatus = z.infer<
  typeof archiveItemLifecycleStatusSchema
>;
export type HistoricalPeriod = z.infer<typeof historicalPeriodSchema>;
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type PublicLocation = z.infer<typeof publicLocationSchema>;
export type ImageAsset = z.infer<typeof imageAssetSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type ArchiveItemRecord = z.infer<typeof archiveItemRecordSchema>;
export type ArchiveItemSummary = z.infer<typeof archiveItemSummarySchema>;
export type ArchiveItemDetail = z.infer<typeof archiveItemDetailSchema>;
export type ArchiveItemListQuery = z.output<typeof archiveItemListQuerySchema>;
export type ArchiveItemListTransportQuery = z.input<
  typeof archiveItemListQuerySchema
>;
export type ArchiveItemSearchQuery = z.output<
  typeof archiveItemSearchQuerySchema
>;
export type ArchiveItemSearchTransportQuery = z.input<
  typeof archiveItemSearchQuerySchema
>;
export type ArchiveItemPage = z.infer<typeof archiveItemPageSchema>;
export type CategoryFacet = z.infer<typeof categoryFacetSchema>;
export type CategoryFacetList = z.infer<typeof categoryFacetListSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
