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
  catalogDetailSchema,
  catalogIdSchema,
  catalogKindSchema,
  catalogListTransportQuerySchema,
  catalogPageSchema,
  catalogSummarySchema,
  healthResponseSchema,
  publicSourceCitationSchema,
} from "./schemas.js";

const toJsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "draft-2020-12" });

/** @deprecated T04.0-R compatibility export. */
export const archiveItemIdJsonSchema = toJsonSchema(archiveItemIdSchema);
export const catalogIdJsonSchema = toJsonSchema(catalogIdSchema);
export const catalogKindJsonSchema = toJsonSchema(catalogKindSchema);
export const catalogSummaryJsonSchema = toJsonSchema(catalogSummarySchema);
export const catalogDetailJsonSchema = toJsonSchema(catalogDetailSchema);
export const catalogListTransportQueryJsonSchema = toJsonSchema(
  catalogListTransportQuerySchema,
);
export const catalogPageJsonSchema = toJsonSchema(catalogPageSchema);
export const publicSourceCitationJsonSchema = toJsonSchema(
  publicSourceCitationSchema,
);
/** @deprecated T04.0-R /v1/items compatibility export. */
export const archiveItemSummaryJsonSchema = toJsonSchema(
  archiveItemSummarySchema,
);
/** @deprecated T04.0-R /v1/items compatibility export. */
export const archiveItemDetailJsonSchema = toJsonSchema(
  archiveItemDetailSchema,
);
/** @deprecated T04.0-R /v1/items compatibility export. */
export const archiveItemListTransportQueryJsonSchema = toJsonSchema(
  archiveItemListTransportQuerySchema,
);
/** @deprecated T04.0-R Reader compatibility export. */
export const archiveItemListQueryJsonSchema = toJsonSchema(
  archiveItemListQuerySchema,
);
/** @deprecated T04.0-R /v1/items compatibility export. */
export const archiveItemPageJsonSchema = toJsonSchema(archiveItemPageSchema);
export const healthResponseJsonSchema = toJsonSchema(healthResponseSchema);
export const apiErrorCodeJsonSchema = toJsonSchema(apiErrorCodeSchema);
export const apiErrorJsonSchema = toJsonSchema(apiErrorSchema);
