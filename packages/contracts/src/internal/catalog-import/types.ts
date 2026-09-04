import type { z } from "zod";

import type {
  aliasImportRowSchema,
  aliasTypeSchema,
  applyBlockerCodeSchema,
  canonicalCatalogImportV2EnvelopeSchema,
  canonicalCatalogImportV2RowSchema,
  canonicalCatalogImportEnvelopeSchema,
  canonicalCatalogImportRowSchema,
  canonicalDescriptionImportFieldSchema,
  canonicalFactualImportFieldSchema,
  canonicalHistoricalContextImportFieldSchema,
  canonicalScholarlyResearchImportFieldSchema,
  canonicalScriptStyleImportFieldSchema,
  canonicalTranscriptionImportFieldSchema,
  catalogContributorImportRowSchema,
  catalogImportCollectionActionSchema,
  catalogImportDryRunSchema,
  catalogImportV2DryRunFindingSchema,
  catalogImportV2DryRunSchema,
  catalogImportV2RowCountsSchema,
  catalogImportFieldStateSchema,
  catalogImportIdSchema,
  dryRunFindingSchema,
  duplicateCandidateDispositionSchema,
  duplicateCandidateSchema,
  importApprovalSchema,
  importBatchSchema,
  importContractVersionSchema,
  importV2ApprovalSchema,
  importV2BatchSchema,
  persistenceDispositionSchema,
  protectionLevelSchema,
  provenanceImportRowSchema,
  publicCitationImportRowSchema,
  sha256Schema,
  sourceIdSchema,
  supportedImportContractVersionSchema,
  versionedCanonicalCatalogImportEnvelopeSchema,
  versionedCatalogImportDryRunSchema,
  versionedImportApprovalSchema,
  versionedImportBatchSchema,
} from "./schemas.js";

export type ImportContractVersion = z.infer<typeof importContractVersionSchema>;
export type SupportedImportContractVersion = z.infer<
  typeof supportedImportContractVersionSchema
>;
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
export type CanonicalScriptStyleImportField = z.infer<
  typeof canonicalScriptStyleImportFieldSchema
>;
export type CanonicalTranscriptionImportField = z.infer<
  typeof canonicalTranscriptionImportFieldSchema
>;
export type CanonicalHistoricalContextImportField = z.infer<
  typeof canonicalHistoricalContextImportFieldSchema
>;
export type CanonicalScholarlyResearchImportField = z.infer<
  typeof canonicalScholarlyResearchImportFieldSchema
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
export type CatalogImportCollectionAction = z.infer<
  typeof catalogImportCollectionActionSchema
>;
export type CanonicalCatalogImportV2Row = z.infer<
  typeof canonicalCatalogImportV2RowSchema
>;
export type CatalogContributorImportRow = z.infer<
  typeof catalogContributorImportRowSchema
>;
export type PublicCitationImportRow = z.infer<
  typeof publicCitationImportRowSchema
>;
export type CanonicalCatalogImportV2Envelope = z.infer<
  typeof canonicalCatalogImportV2EnvelopeSchema
>;
export type VersionedCanonicalCatalogImportEnvelope = z.infer<
  typeof versionedCanonicalCatalogImportEnvelopeSchema
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
export type CatalogImportV2RowCounts = z.infer<
  typeof catalogImportV2RowCountsSchema
>;
export type CatalogImportV2DryRunFinding = z.infer<
  typeof catalogImportV2DryRunFindingSchema
>;
export type CatalogImportV2DryRun = z.infer<typeof catalogImportV2DryRunSchema>;
export type VersionedCatalogImportDryRun = z.infer<
  typeof versionedCatalogImportDryRunSchema
>;
export type ImportApproval = z.infer<typeof importApprovalSchema>;
export type ImportV2Approval = z.infer<typeof importV2ApprovalSchema>;
export type VersionedImportApproval = z.infer<
  typeof versionedImportApprovalSchema
>;
export type ImportBatch = z.infer<typeof importBatchSchema>;
export type ImportV2Batch = z.infer<typeof importV2BatchSchema>;
export type VersionedImportBatch = z.infer<typeof versionedImportBatchSchema>;
