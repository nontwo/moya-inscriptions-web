import type { z } from "zod";

import type {
  apiErrorCodeSchema,
  apiErrorSchema,
  archiveItemDetailSchema,
  archiveItemListQuerySchema,
  archiveItemListTransportQuerySchema,
  archiveItemPageSchema,
  archiveItemSummarySchema,
  catalogDetailSchema,
  catalogIdSchema,
  catalogKindSchema,
  catalogListTransportQuerySchema,
  catalogPageSchema,
  catalogSummarySchema,
  healthResponseSchema,
  publicSourceCitationSchema,
} from "./schemas.js";

export type CatalogId = z.infer<typeof catalogIdSchema>;
/** @deprecated T04.0-R compatibility name. Use CatalogId for new work. */
export type ArchiveItemId = CatalogId;
export type CatalogKind = z.infer<typeof catalogKindSchema>;
export type PublicSourceCitation = z.infer<typeof publicSourceCitationSchema>;
export type CatalogSummary = z.infer<typeof catalogSummarySchema>;
export type CatalogDetail = z.infer<typeof catalogDetailSchema>;
export type CatalogListTransportQuery = z.infer<
  typeof catalogListTransportQuerySchema
>;
export type CatalogPage = z.infer<typeof catalogPageSchema>;
/** @deprecated T04.0-R /v1/items compatibility type. */
export type ArchiveItemSummary = z.infer<typeof archiveItemSummarySchema>;
/** @deprecated T04.0-R /v1/items compatibility type. */
export type ArchiveItemDetail = z.infer<typeof archiveItemDetailSchema>;
/** @deprecated T04.0-R /v1/items compatibility transport type. */
export type ArchiveItemListTransportQuery = z.input<
  typeof archiveItemListTransportQuerySchema
>;
/** @deprecated T04.0-R Reader compatibility application type. */
export type ArchiveItemListQuery = z.output<typeof archiveItemListQuerySchema>;
/** @deprecated T04.0-R /v1/items compatibility page type. */
export type ArchiveItemPage = z.infer<typeof archiveItemPageSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
