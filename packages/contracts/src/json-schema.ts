import { z } from "zod";

import {
  apiErrorCodeSchema,
  apiErrorSchema,
  catalogCitationScopeSchema,
  catalogCommentIdSchema,
  catalogCommentPageSchema,
  catalogCommentReplyPageSchema,
  catalogCommentReplySchema,
  catalogCommentSchema,
  catalogCommentTransportQuerySchema,
  catalogContributorRoleSchema,
  catalogContributorSchema,
  catalogDetailSchema,
  catalogIdSchema,
  commentAuthorSchema,
  createCatalogCommentReplyRequestSchema,
  createCatalogCommentRequestSchema,
  catalogKindSchema,
  catalogListTransportQuerySchema,
  catalogPageSchema,
  catalogSummarySchema,
  catalogSearchMatchKindSchema,
  catalogSearchTransportQuerySchema,
  catalogSearchItemSchema,
  catalogSearchPageSchema,
  healthResponseSchema,
  mediaIdSchema,
  noQueryTransportSchema,
  publicMediaSchema,
  publicSourceCitationSchema,
  publicUserIdSchema,
  publicUserProfileSchema,
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
export const catalogSearchMatchKindJsonSchema = toJsonSchema(
  catalogSearchMatchKindSchema,
);
export const catalogSearchTransportQueryJsonSchema = toJsonSchema(
  catalogSearchTransportQuerySchema,
);
export const catalogSearchItemJsonSchema = toJsonSchema(
  catalogSearchItemSchema,
);
export const catalogSearchPageJsonSchema = toJsonSchema(
  catalogSearchPageSchema,
);
export const publicSourceCitationJsonSchema = toJsonSchema(
  publicSourceCitationSchema,
);
export const publicUserIdJsonSchema = toJsonSchema(publicUserIdSchema);
export const publicUserProfileJsonSchema = toJsonSchema(
  publicUserProfileSchema,
);
export const catalogCommentIdJsonSchema = toJsonSchema(catalogCommentIdSchema);
export const commentAuthorJsonSchema = toJsonSchema(commentAuthorSchema);
export const catalogCommentReplyJsonSchema = toJsonSchema(
  catalogCommentReplySchema,
);
export const catalogCommentJsonSchema = toJsonSchema(catalogCommentSchema);
export const catalogCommentPageJsonSchema = toJsonSchema(
  catalogCommentPageSchema,
);
export const catalogCommentReplyPageJsonSchema = toJsonSchema(
  catalogCommentReplyPageSchema,
);
export const catalogCommentTransportQueryJsonSchema = toJsonSchema(
  catalogCommentTransportQuerySchema,
);
export const createCatalogCommentRequestJsonSchema = toJsonSchema(
  createCatalogCommentRequestSchema,
);
export const createCatalogCommentReplyRequestJsonSchema = toJsonSchema(
  createCatalogCommentReplyRequestSchema,
);
export const healthResponseJsonSchema = toJsonSchema(healthResponseSchema);
export const apiErrorCodeJsonSchema = toJsonSchema(apiErrorCodeSchema);
export const apiErrorJsonSchema = toJsonSchema(apiErrorSchema);
