import { z } from "zod";

import {
  canonicalCatalogImportV2EnvelopeSchema,
  canonicalCatalogImportEnvelopeSchema,
  catalogImportV2DryRunSchema,
  catalogImportDryRunSchema,
  importV2ApprovalSchema,
  importV2BatchSchema,
  importApprovalSchema,
  importBatchSchema,
  versionedCanonicalCatalogImportEnvelopeSchema,
  versionedCatalogImportDryRunSchema,
  versionedImportApprovalSchema,
  versionedImportBatchSchema,
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
export const canonicalCatalogImportV2EnvelopeJsonSchema = toJsonSchema(
  canonicalCatalogImportV2EnvelopeSchema,
);
export const catalogImportV2DryRunJsonSchema = toJsonSchema(
  catalogImportV2DryRunSchema,
);
export const importV2ApprovalJsonSchema = toJsonSchema(importV2ApprovalSchema);
export const importV2BatchJsonSchema = toJsonSchema(importV2BatchSchema);
export const versionedCanonicalCatalogImportEnvelopeJsonSchema = toJsonSchema(
  versionedCanonicalCatalogImportEnvelopeSchema,
);
export const versionedCatalogImportDryRunJsonSchema = toJsonSchema(
  versionedCatalogImportDryRunSchema,
);
export const versionedImportApprovalJsonSchema = toJsonSchema(
  versionedImportApprovalSchema,
);
export const versionedImportBatchJsonSchema = toJsonSchema(
  versionedImportBatchSchema,
);
