import { z } from "zod";

import {
  canonicalCatalogImportEnvelopeSchema,
  catalogImportDryRunSchema,
  importApprovalSchema,
  importBatchSchema,
} from "./schemas.js";

const toJsonSchema = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { target: "draft-2020-12" });

export const canonicalCatalogImportEnvelopeJsonSchema = toJsonSchema(
  canonicalCatalogImportEnvelopeSchema,
);
export const catalogImportDryRunJsonSchema = toJsonSchema(
  catalogImportDryRunSchema,
);
export const importApprovalJsonSchema = toJsonSchema(importApprovalSchema);
export const importBatchJsonSchema = toJsonSchema(importBatchSchema);
