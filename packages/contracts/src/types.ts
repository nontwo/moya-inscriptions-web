import type { z } from "zod";

import type {
  archiveItemDetailSchema,
  archiveItemIdSchema,
  archiveItemLifecycleStatusSchema,
  archiveItemRecordSchema,
  archiveItemSummarySchema,
  coordinatesSchema,
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
