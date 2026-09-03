import { z } from "zod";

import {
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
  noQueryTransportSchema,
  publicMediaSchema,
  publicSourceCitationSchema,
} from "./schemas.js";

const toJsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "draft-2020-12" });

export const catalogIdJsonSchema = toJsonSchema(catalogIdSchema);
export const catalogKindJsonSchema = toJsonSchema(catalogKindSchema);
export const catalogContributorRoleJsonSchema = toJsonSchema(
  catalogContributorRoleSchema,
);
export const catalogContributorJsonSchema = toJsonSchema(
  catalogContributorSchema,
);
export const catalogCitationScopeJsonSchema = toJsonSchema(
  catalogCitationScopeSchema,
);
export const mediaIdJsonSchema = toJsonSchema(mediaIdSchema);
export const publicMediaJsonSchema = toJsonSchema(publicMediaSchema);
export const catalogSummaryJsonSchema = toJsonSchema(catalogSummarySchema);
export const catalogDetailJsonSchema = toJsonSchema(catalogDetailSchema);
export const catalogListTransportQueryJsonSchema = toJsonSchema(
  catalogListTransportQuerySchema,
);
export const noQueryTransportJsonSchema = toJsonSchema(noQueryTransportSchema);
export const catalogPageJsonSchema = toJsonSchema(catalogPageSchema);
export const publicSourceCitationJsonSchema = toJsonSchema(
  publicSourceCitationSchema,
);
export const healthResponseJsonSchema = toJsonSchema(healthResponseSchema);
export const apiErrorCodeJsonSchema = toJsonSchema(apiErrorCodeSchema);
export const apiErrorJsonSchema = toJsonSchema(apiErrorSchema);
