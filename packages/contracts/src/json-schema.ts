import { z } from "zod";

import {
  apiErrorCodeSchema,
  apiErrorSchema,
  archiveItemDetailSchema,
  archiveItemIdSchema,
  archiveItemListQuerySchema,
  archiveItemListTransportQuerySchema,
  archiveItemPageSchema,
  archiveItemSummarySchema,
  catalogIdSchema,
  catalogKindSchema,
  healthResponseSchema,
  publicSourceCitationSchema,
} from "./schemas.js";

const toJsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "draft-2020-12" });

export const archiveItemIdJsonSchema = toJsonSchema(archiveItemIdSchema);
export const catalogIdJsonSchema = toJsonSchema(catalogIdSchema);
export const catalogKindJsonSchema = toJsonSchema(catalogKindSchema);
export const publicSourceCitationJsonSchema = toJsonSchema(
  publicSourceCitationSchema,
);
export const archiveItemSummaryJsonSchema = toJsonSchema(
  archiveItemSummarySchema,
);
export const archiveItemDetailJsonSchema = toJsonSchema(
  archiveItemDetailSchema,
);
export const archiveItemListTransportQueryJsonSchema = toJsonSchema(
  archiveItemListTransportQuerySchema,
);
export const archiveItemListQueryJsonSchema = toJsonSchema(
  archiveItemListQuerySchema,
);
export const archiveItemPageJsonSchema = toJsonSchema(archiveItemPageSchema);
export const healthResponseJsonSchema = toJsonSchema(healthResponseSchema);
export const apiErrorCodeJsonSchema = toJsonSchema(apiErrorCodeSchema);
export const apiErrorJsonSchema = toJsonSchema(apiErrorSchema);
