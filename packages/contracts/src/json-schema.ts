import { z } from "zod";

import {
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
