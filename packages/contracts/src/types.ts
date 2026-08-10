import type { z } from "zod";

import type {
  apiErrorCodeSchema,
  apiErrorSchema,
  archiveItemDetailSchema,
  archiveItemListQuerySchema,
  archiveItemListTransportQuerySchema,
  archiveItemPageSchema,
  archiveItemSummarySchema,
  catalogIdSchema,
  catalogKindSchema,
  healthResponseSchema,
  publicSourceCitationSchema,
} from "./schemas.js";

export type CatalogId = z.infer<typeof catalogIdSchema>;
export type ArchiveItemId = CatalogId;
export type CatalogKind = z.infer<typeof catalogKindSchema>;
export type PublicSourceCitation = z.infer<typeof publicSourceCitationSchema>;
export type ArchiveItemSummary = z.infer<typeof archiveItemSummarySchema>;
export type ArchiveItemDetail = z.infer<typeof archiveItemDetailSchema>;
export type ArchiveItemListTransportQuery = z.input<
  typeof archiveItemListTransportQuerySchema
>;
export type ArchiveItemListQuery = z.output<typeof archiveItemListQuerySchema>;
export type ArchiveItemPage = z.infer<typeof archiveItemPageSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
