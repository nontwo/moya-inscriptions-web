import type { z } from "zod";

import type {
  apiErrorCodeSchema,
  apiErrorSchema,
  catalogCitationScopeSchema,
  catalogContributorRoleSchema,
  catalogContributorSchema,
  catalogDetailSchema,
  catalogIdSchema,
  catalogKindSchema,
  catalogListTransportQuerySchema,
  catalogPageSchema,
  catalogSummarySchema,
  healthResponseSchema,
  mediaIdSchema,
  publicMediaSchema,
  publicSourceCitationSchema,
} from "./schemas.js";

export type CatalogId = z.infer<typeof catalogIdSchema>;
export type CatalogKind = z.infer<typeof catalogKindSchema>;
export type CatalogContributorRole = z.infer<
  typeof catalogContributorRoleSchema
>;
export type CatalogContributor = z.infer<typeof catalogContributorSchema>;
export type CatalogCitationScope = z.infer<typeof catalogCitationScopeSchema>;
export type MediaId = z.infer<typeof mediaIdSchema>;
export type PublicMedia = z.infer<typeof publicMediaSchema>;
export type PublicSourceCitation = z.infer<typeof publicSourceCitationSchema>;
export type CatalogSummary = z.infer<typeof catalogSummarySchema>;
export type CatalogDetail = z.infer<typeof catalogDetailSchema>;
export type CatalogListTransportQuery = z.infer<
  typeof catalogListTransportQuerySchema
>;
export type CatalogPage = z.infer<typeof catalogPageSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
