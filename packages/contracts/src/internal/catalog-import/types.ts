import type { z } from "zod";

import type {
  aliasImportRowSchema,
  aliasTypeSchema,
  applyBlockerCodeSchema,
  canonicalCatalogImportEnvelopeSchema,
  canonicalCatalogImportRowSchema,
  canonicalDescriptionImportFieldSchema,
  canonicalFactualImportFieldSchema,
  catalogImportDryRunSchema,
  catalogImportFieldStateSchema,
  catalogImportIdSchema,
  dryRunFindingSchema,
  duplicateCandidateDispositionSchema,
  duplicateCandidateSchema,
  importApprovalSchema,
  importBatchSchema,
  importContractVersionSchema,
  persistenceDispositionSchema,
  protectionLevelSchema,
  provenanceImportRowSchema,
  sha256Schema,
  sourceIdSchema,
} from "./schemas.js";

export type ImportContractVersion = z.infer<typeof importContractVersionSchema>;
export type CatalogImportId = z.infer<typeof catalogImportIdSchema>;
export type SourceId = z.infer<typeof sourceIdSchema>;
export type Sha256 = z.infer<typeof sha256Schema>;
export type CatalogImportFieldState = z.infer<
  typeof catalogImportFieldStateSchema
>;
export type CanonicalFactualImportField = z.infer<
  typeof canonicalFactualImportFieldSchema
>;
export type CanonicalDescriptionImportField = z.infer<
  typeof canonicalDescriptionImportFieldSchema
>;
export type CanonicalCatalogImportRow = z.infer<
  typeof canonicalCatalogImportRowSchema
>;
export type AliasType = z.infer<typeof aliasTypeSchema>;
export type AliasImportRow = z.infer<typeof aliasImportRowSchema>;
export type ProvenanceImportRow = z.infer<typeof provenanceImportRowSchema>;
export type CanonicalCatalogImportEnvelope = z.infer<
  typeof canonicalCatalogImportEnvelopeSchema
>;
export type PersistenceDisposition = z.infer<
  typeof persistenceDispositionSchema
>;
export type ProtectionLevel = z.infer<typeof protectionLevelSchema>;
export type ApplyBlockerCode = z.infer<typeof applyBlockerCodeSchema>;
export type DryRunFinding = z.infer<typeof dryRunFindingSchema>;
export type DuplicateCandidateDisposition = z.infer<
  typeof duplicateCandidateDispositionSchema
>;
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;
export type CatalogImportDryRun = z.infer<typeof catalogImportDryRunSchema>;
export type ImportApproval = z.infer<typeof importApprovalSchema>;
export type ImportBatch = z.infer<typeof importBatchSchema>;
