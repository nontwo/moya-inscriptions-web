import { z } from "zod";

import {
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

const toJsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "draft-2020-12" });

export const archiveItemIdJsonSchema = toJsonSchema(archiveItemIdSchema);
export const archiveItemLifecycleStatusJsonSchema = toJsonSchema(
  archiveItemLifecycleStatusSchema,
);
export const historicalPeriodJsonSchema = toJsonSchema(historicalPeriodSchema);
export const coordinatesJsonSchema = toJsonSchema(coordinatesSchema);
export const publicLocationJsonSchema = toJsonSchema(publicLocationSchema);
export const imageAssetJsonSchema = toJsonSchema(imageAssetSchema);
export const referenceJsonSchema = toJsonSchema(referenceSchema);
export const archiveItemRecordJsonSchema = toJsonSchema(
  archiveItemRecordSchema,
);
export const archiveItemSummaryJsonSchema = toJsonSchema(
  archiveItemSummarySchema,
);
export const archiveItemDetailJsonSchema = toJsonSchema(
  archiveItemDetailSchema,
);
export const archiveItemListQueryJsonSchema = toJsonSchema(
  archiveItemListQuerySchema,
);
export const archiveItemSearchQueryJsonSchema = toJsonSchema(
  archiveItemSearchQuerySchema,
);
export const archiveItemPageJsonSchema = toJsonSchema(archiveItemPageSchema);
export const categoryFacetJsonSchema = toJsonSchema(categoryFacetSchema);
export const categoryFacetListJsonSchema = toJsonSchema(
  categoryFacetListSchema,
);
export const healthResponseJsonSchema = toJsonSchema(healthResponseSchema);
export const apiErrorCodeJsonSchema = toJsonSchema(apiErrorCodeSchema);
export const apiErrorJsonSchema = toJsonSchema(apiErrorSchema);
