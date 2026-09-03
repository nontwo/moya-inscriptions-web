import { z } from "zod";

import {
  catalogContributorRoleSchema,
  catalogIdSchema,
  catalogKindSchema,
  publicSourceCitationSchema,
} from "../../schemas.js";

export const CATALOG_IMPORT_CONTRACT_VERSION = "catalog-import/v1" as const;
export const CATALOG_IMPORT_V2_CONTRACT_VERSION = "catalog-import/v2" as const;
export const CATALOG_IMPORT_SUPPORTED_CONTRACT_VERSIONS = [
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_V2_CONTRACT_VERSION,
] as const;

export const importContractVersionSchema = z.literal(
  CATALOG_IMPORT_CONTRACT_VERSION,
);
export const catalogImportV2ContractVersionSchema = z.literal(
  CATALOG_IMPORT_V2_CONTRACT_VERSION,
);
export const supportedImportContractVersionSchema = z.enum(
  CATALOG_IMPORT_SUPPORTED_CONTRACT_VERSIONS,
);

const exactTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim(), {
      message: "Leading or trailing whitespace is not allowed",
    });

const importIdentifierBaseSchema = z.string().min(1).max(128).regex(/^\S+$/);

export const catalogImportIdSchema =
  importIdentifierBaseSchema.brand<"CatalogImportId">();
export const sourceIdSchema = importIdentifierBaseSchema.brand<"SourceId">();
export const importBatchIdSchema =
  importIdentifierBaseSchema.brand<"ImportBatchId">();
export const dryRunFindingIdSchema =
  importIdentifierBaseSchema.brand<"DryRunFindingId">();
export const duplicateCandidateIdSchema =
  importIdentifierBaseSchema.brand<"DuplicateCandidateId">();

export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .brand<"Sha256">();

export const catalogImportFieldStateSchema = z.enum([
  "VALUE",
  "UNSUPPLIED",
  "UNKNOWN",
  "NOT_APPLICABLE",
  "CLEAR",
]);

const canonicalImportFieldSchema = (
  valueSchema: z.ZodString,
  absenceStates: readonly (
    "UNSUPPLIED" | "UNKNOWN" | "NOT_APPLICABLE" | "CLEAR"
  )[],
) =>
  z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("VALUE"), value: valueSchema }),
    ...absenceStates.map((state) =>
      z.strictObject({ state: z.literal(state) }),
    ),
  ]);

export const canonicalFactualImportFieldSchema = canonicalImportFieldSchema(
  exactTextSchema(500),
  ["UNSUPPLIED", "UNKNOWN", "NOT_APPLICABLE", "CLEAR"],
);

export const canonicalDescriptionImportFieldSchema = canonicalImportFieldSchema(
  exactTextSchema(20_000),
  ["UNSUPPLIED", "CLEAR"],
);

export const canonicalScriptStyleImportFieldSchema = canonicalImportFieldSchema(
  exactTextSchema(2_000),
  ["UNSUPPLIED", "UNKNOWN", "NOT_APPLICABLE", "CLEAR"],
);

export const canonicalTranscriptionImportFieldSchema =
  canonicalImportFieldSchema(exactTextSchema(100_000), ["UNSUPPLIED", "CLEAR"]);

export const canonicalHistoricalContextImportFieldSchema =
  canonicalImportFieldSchema(exactTextSchema(20_000), ["UNSUPPLIED", "CLEAR"]);

export const canonicalScholarlyResearchImportFieldSchema =
  canonicalImportFieldSchema(exactTextSchema(20_000), ["UNSUPPLIED", "CLEAR"]);

export const catalogImportCollectionActionSchema = z.enum([
  "PRESERVE",
  "REPLACE",
  "CLEAR",
]);

export const CATALOG_IMPORT_CITATION_SCOPE_ORDER = [
  "record",
  "description",
  "transcription",
  "historicalContext",
  "scholarlyResearch",
] as const;

export const canonicalizeCatalogImportCitationScopes = (input: unknown) => {
  if (input === undefined) return undefined;
  const scopes = publicSourceCitationSchema.shape.appliesTo
    .unwrap()
    .parse(input);
  const order = new Map(
    CATALOG_IMPORT_CITATION_SCOPE_ORDER.map((scope, index) => [scope, index]),
  );
  return [...scopes].sort(
    (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
  );
};

export const aliasTypeSchema = z.enum(["alternate", "historical"]);

export const canonicalCatalogImportRowSchema = z.strictObject({
  catalogImportId: catalogImportIdSchema,
  sourceId: sourceIdSchema,
  catalogId: catalogIdSchema.optional(),
  title: exactTextSchema(500),
  catalogKind: catalogKindSchema,
  dynasty: canonicalFactualImportFieldSchema,
  dateText: canonicalFactualImportFieldSchema,
  province: canonicalFactualImportFieldSchema,
  prefecture: canonicalFactualImportFieldSchema,
  county: canonicalFactualImportFieldSchema,
  currentLocation: canonicalFactualImportFieldSchema,
  currentCustodian: canonicalFactualImportFieldSchema,
  description: canonicalDescriptionImportFieldSchema,
  ownerNote: exactTextSchema(2_000).optional(),
});

export const aliasImportRowSchema = z.strictObject({
  catalogImportId: catalogImportIdSchema,
  alias: exactTextSchema(500),
  aliasType: aliasTypeSchema,
});

export const provenanceImportRowSchema = z.strictObject({
  catalogImportId: catalogImportIdSchema,
  sourceId: sourceIdSchema,
  sourceTitle: exactTextSchema(500).optional(),
  sourceTypeRaw: exactTextSchema(200).optional(),
  sourceUrl: z.url().max(2_048).optional(),
  sourceNote: exactTextSchema(2_000).optional(),
});

const addV2NulIssue = (
  context: z.RefinementCtx,
  path: (string | number)[],
  value: string | undefined,
) => {
  if (value?.includes("\u0000")) {
    context.addIssue({
      code: "custom",
      path,
      message: "NUL characters are not allowed",
    });
  }
};

const v2StatefulFieldNames = [
  "dynasty",
  "dateText",
  "province",
  "prefecture",
  "county",
  "currentLocation",
  "currentCustodian",
  "description",
  "scriptStyle",
  "transcription",
  "historicalContext",
  "scholarlyResearch",
] as const;

export const canonicalCatalogImportV2RowSchema = z
  .strictObject({
    ...canonicalCatalogImportRowSchema.shape,
    scriptStyle: canonicalScriptStyleImportFieldSchema,
    transcription: canonicalTranscriptionImportFieldSchema,
    historicalContext: canonicalHistoricalContextImportFieldSchema,
    scholarlyResearch: canonicalScholarlyResearchImportFieldSchema,
    contributorsAction: catalogImportCollectionActionSchema,
    publicCitationsAction: catalogImportCollectionActionSchema,
  })
  .superRefine((row, context) => {
    const importId = String(row.catalogImportId);
    const sourceId = String(row.sourceId);
    const catalogId =
      row.catalogId === undefined ? undefined : String(row.catalogId);
    for (const [field, value] of [
      ["catalogImportId", importId],
      ["sourceId", sourceId],
      ["catalogId", catalogId],
      ["title", row.title],
    ] as const) {
      addV2NulIssue(context, [field], value);
    }
    for (const field of v2StatefulFieldNames) {
      const value = row[field];
      if (value.state === "VALUE") {
        addV2NulIssue(context, [field, "value"], value.value);
      }
    }
    if (importId === sourceId) {
      context.addIssue({
        code: "custom",
        path: ["sourceId"],
        message: "catalogImportId and SourceId must be distinct",
      });
    }
    if (catalogId !== undefined && importId === catalogId) {
      context.addIssue({
        code: "custom",
        path: ["catalogId"],
        message: "catalogImportId and CatalogId must be distinct",
      });
    }
    if (catalogId !== undefined && sourceId === catalogId) {
      context.addIssue({
        code: "custom",
        path: ["catalogId"],
        message: "SourceId and CatalogId must be distinct",
      });
    }
    if (row.catalogId !== undefined) return;
    for (const field of v2StatefulFieldNames) {
      if (row[field].state === "CLEAR") {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "CLEAR is invalid for a create candidate",
        });
      }
    }
    for (const field of [
      "contributorsAction",
      "publicCitationsAction",
    ] as const) {
      if (row[field] === "CLEAR") {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "CLEAR is invalid for a create candidate",
        });
      }
    }
  });

const catalogImportPositionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(2_147_483_647);

export const catalogContributorImportRowSchema = z.strictObject({
  catalogImportId: catalogImportIdSchema,
  position: catalogImportPositionSchema,
  name: publicSourceCitationSchema.shape.label,
  role: catalogContributorRoleSchema,
});

export const publicCitationImportRowSchema = z.strictObject({
  catalogImportId: catalogImportIdSchema,
  position: catalogImportPositionSchema,
  label: publicSourceCitationSchema.shape.label,
  citation: publicSourceCitationSchema.shape.citation,
  url: publicSourceCitationSchema.shape.url,
  appliesTo: publicSourceCitationSchema.shape.appliesTo,
});

const addDuplicateIssue = (
  context: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) => {
  context.addIssue({ code: "custom", path, message });
};

export const canonicalCatalogImportEnvelopeSchema = z
  .strictObject({
    importContractVersion: importContractVersionSchema,
    catalogRows: z.array(canonicalCatalogImportRowSchema).min(1),
    aliasRows: z.array(aliasImportRowSchema),
    provenanceRows: z.array(provenanceImportRowSchema),
  })
  .superRefine((envelope, context) => {
    const catalogImportIds = new Map<string, number>();
    const sourceOwners = new Map<string, string>();
    const catalogIds = new Map<string, number>();

    for (const [index, row] of envelope.catalogRows.entries()) {
      const importId = String(row.catalogImportId);
      const sourceId = String(row.sourceId);
      const earlierImport = catalogImportIds.get(importId);
      if (earlierImport !== undefined) {
        addDuplicateIssue(
          context,
          ["catalogRows", index, "catalogImportId"],
          `catalogImportId duplicates catalogRows[${earlierImport}]`,
        );
      } else {
        catalogImportIds.set(importId, index);
      }

      const earlierSourceOwner = sourceOwners.get(sourceId);
      if (earlierSourceOwner !== undefined) {
        addDuplicateIssue(
          context,
          ["catalogRows", index, "sourceId"],
          `SourceId already resolves to ${earlierSourceOwner}`,
        );
      } else {
        sourceOwners.set(sourceId, importId);
      }

      if (row.catalogId !== undefined) {
        const catalogId = String(row.catalogId);
        const earlierCatalog = catalogIds.get(catalogId);
        if (earlierCatalog !== undefined) {
          addDuplicateIssue(
            context,
            ["catalogRows", index, "catalogId"],
            `catalogId duplicates catalogRows[${earlierCatalog}]`,
          );
        } else {
          catalogIds.set(catalogId, index);
        }
      }
    }

    const aliases = new Set<string>();
    for (const [index, row] of envelope.aliasRows.entries()) {
      const importId = String(row.catalogImportId);
      if (!catalogImportIds.has(importId)) {
        addDuplicateIssue(
          context,
          ["aliasRows", index, "catalogImportId"],
          "Alias row references an unknown catalogImportId",
        );
      }
      const aliasKey = `${importId}\u0000${row.alias}`;
      if (aliases.has(aliasKey)) {
        addDuplicateIssue(
          context,
          ["aliasRows", index, "alias"],
          "Alias is duplicated for the Catalog import row",
        );
      }
      aliases.add(aliasKey);
    }

    const provenancePairs = new Set<string>();
    for (const [index, row] of envelope.provenanceRows.entries()) {
      const importId = String(row.catalogImportId);
      const sourceId = String(row.sourceId);
      if (!catalogImportIds.has(importId)) {
        addDuplicateIssue(
          context,
          ["provenanceRows", index, "catalogImportId"],
          "Provenance row references an unknown catalogImportId",
        );
      }

      const pair = `${importId}\u0000${sourceId}`;
      if (provenancePairs.has(pair)) {
        addDuplicateIssue(
          context,
          ["provenanceRows", index, "sourceId"],
          "Provenance (catalogImportId, sourceId) pair is duplicated",
        );
      }
      provenancePairs.add(pair);

      const sourceOwner = sourceOwners.get(sourceId);
      if (sourceOwner !== undefined && sourceOwner !== importId) {
        addDuplicateIssue(
          context,
          ["provenanceRows", index, "sourceId"],
          `SourceId already resolves to ${sourceOwner}`,
        );
      } else if (sourceOwner === undefined) {
        sourceOwners.set(sourceId, importId);
      }
    }
  });

export const parseCanonicalCatalogImportEnvelope = (input: unknown) => {
  const record = z.record(z.string(), z.unknown()).parse(input);
  importContractVersionSchema.parse(record.importContractVersion);
  return canonicalCatalogImportEnvelopeSchema.parse(input);
};

export const canonicalCatalogImportV2EnvelopeSchema = z
  .strictObject({
    importContractVersion: catalogImportV2ContractVersionSchema,
    catalogRows: z.array(canonicalCatalogImportV2RowSchema).min(1),
    aliasRows: z.array(aliasImportRowSchema),
    provenanceRows: z.array(provenanceImportRowSchema),
    contributorRows: z.array(catalogContributorImportRowSchema),
    publicCitationRows: z.array(publicCitationImportRowSchema),
  })
  .superRefine((envelope, context) => {
    const catalogImportIds = new Map<string, number>();
    const sourceOwners = new Map<string, string>();
    const catalogIds = new Map<string, number>();
    const allCatalogImportIds = new Set(
      envelope.catalogRows.map((row) => String(row.catalogImportId)),
    );
    const allCatalogIds = new Set(
      envelope.catalogRows.flatMap((row) =>
        row.catalogId === undefined ? [] : [String(row.catalogId)],
      ),
    );

    for (const [index, row] of envelope.catalogRows.entries()) {
      const sourceId = String(row.sourceId);
      if (allCatalogImportIds.has(sourceId)) {
        addDuplicateIssue(
          context,
          ["catalogRows", index, "sourceId"],
          "SourceId must be distinct from every catalogImportId",
        );
      }
      if (allCatalogIds.has(sourceId)) {
        addDuplicateIssue(
          context,
          ["catalogRows", index, "sourceId"],
          "SourceId must be distinct from every CatalogId",
        );
      }
      if (
        row.catalogId !== undefined &&
        allCatalogImportIds.has(String(row.catalogId))
      ) {
        addDuplicateIssue(
          context,
          ["catalogRows", index, "catalogId"],
          "CatalogId must be distinct from every catalogImportId",
        );
      }
    }

    for (const [index, row] of envelope.catalogRows.entries()) {
      const importId = String(row.catalogImportId);
      const sourceId = String(row.sourceId);
      const earlierImport = catalogImportIds.get(importId);
      if (earlierImport !== undefined) {
        addDuplicateIssue(
          context,
          ["catalogRows", index, "catalogImportId"],
          `catalogImportId duplicates catalogRows[${earlierImport}]`,
        );
      } else {
        catalogImportIds.set(importId, index);
      }

      const earlierSourceOwner = sourceOwners.get(sourceId);
      if (earlierSourceOwner !== undefined) {
        addDuplicateIssue(
          context,
          ["catalogRows", index, "sourceId"],
          `SourceId already resolves to ${earlierSourceOwner}`,
        );
      } else {
        sourceOwners.set(sourceId, importId);
      }

      if (row.catalogId !== undefined) {
        const catalogId = String(row.catalogId);
        const earlierCatalog = catalogIds.get(catalogId);
        if (earlierCatalog !== undefined) {
          addDuplicateIssue(
            context,
            ["catalogRows", index, "catalogId"],
            `catalogId duplicates catalogRows[${earlierCatalog}]`,
          );
        } else {
          catalogIds.set(catalogId, index);
        }
      }
    }

    const aliases = new Set<string>();
    for (const [index, row] of envelope.aliasRows.entries()) {
      const importId = String(row.catalogImportId);
      addV2NulIssue(context, ["aliasRows", index, "catalogImportId"], importId);
      addV2NulIssue(context, ["aliasRows", index, "alias"], row.alias);
      if (!catalogImportIds.has(importId)) {
        addDuplicateIssue(
          context,
          ["aliasRows", index, "catalogImportId"],
          "Alias row references an unknown catalogImportId",
        );
      }
      const aliasKey = `${importId}\u0000${row.alias}`;
      if (aliases.has(aliasKey)) {
        addDuplicateIssue(
          context,
          ["aliasRows", index, "alias"],
          "Alias is duplicated for the Catalog import row",
        );
      }
      aliases.add(aliasKey);
    }

    const provenancePairs = new Set<string>();
    for (const [index, row] of envelope.provenanceRows.entries()) {
      const importId = String(row.catalogImportId);
      const sourceId = String(row.sourceId);
      for (const [field, value] of [
        ["catalogImportId", importId],
        ["sourceId", sourceId],
        ["sourceTitle", row.sourceTitle],
        ["sourceTypeRaw", row.sourceTypeRaw],
        ["sourceUrl", row.sourceUrl],
        ["sourceNote", row.sourceNote],
      ] as const) {
        addV2NulIssue(context, ["provenanceRows", index, field], value);
      }
      if (!catalogImportIds.has(importId)) {
        addDuplicateIssue(
          context,
          ["provenanceRows", index, "catalogImportId"],
          "Provenance row references an unknown catalogImportId",
        );
      }
      if (catalogImportIds.has(sourceId)) {
        addDuplicateIssue(
          context,
          ["provenanceRows", index, "sourceId"],
          "SourceId must be distinct from every catalogImportId",
        );
      }
      if (catalogIds.has(sourceId)) {
        addDuplicateIssue(
          context,
          ["provenanceRows", index, "sourceId"],
          "SourceId must be distinct from every CatalogId",
        );
      }
      const pair = `${importId}\u0000${sourceId}`;
      if (provenancePairs.has(pair)) {
        addDuplicateIssue(
          context,
          ["provenanceRows", index, "sourceId"],
          "Provenance (catalogImportId, sourceId) pair is duplicated",
        );
      }
      provenancePairs.add(pair);
      const sourceOwner = sourceOwners.get(sourceId);
      if (sourceOwner !== undefined && sourceOwner !== importId) {
        addDuplicateIssue(
          context,
          ["provenanceRows", index, "sourceId"],
          `SourceId already resolves to ${sourceOwner}`,
        );
      } else if (sourceOwner === undefined) {
        sourceOwners.set(sourceId, importId);
      }
    }

    const contributorCounts = new Map<string, number>();
    const contributorPositions = new Set<string>();
    const contributorIdentities = new Set<string>();
    for (const [index, row] of envelope.contributorRows.entries()) {
      const importId = String(row.catalogImportId);
      addV2NulIssue(
        context,
        ["contributorRows", index, "catalogImportId"],
        importId,
      );
      addV2NulIssue(context, ["contributorRows", index, "name"], row.name);
      if (!catalogImportIds.has(importId)) {
        addDuplicateIssue(
          context,
          ["contributorRows", index, "catalogImportId"],
          "Contributor row references an unknown catalogImportId",
        );
      }
      const count = (contributorCounts.get(importId) ?? 0) + 1;
      contributorCounts.set(importId, count);
      if (count > 50) {
        addDuplicateIssue(
          context,
          ["contributorRows", index, "catalogImportId"],
          "A Catalog import row may contain at most 50 contributors",
        );
      }
      const positionKey = `${importId}\u0000${row.position}`;
      if (contributorPositions.has(positionKey)) {
        addDuplicateIssue(
          context,
          ["contributorRows", index, "position"],
          "Contributor position is duplicated for the Catalog import row",
        );
      }
      contributorPositions.add(positionKey);
      const identityKey = `${importId}\u0000${row.name}\u0000${row.role}`;
      if (contributorIdentities.has(identityKey)) {
        addDuplicateIssue(
          context,
          ["contributorRows", index, "name"],
          "Contributor name and role are duplicated for the Catalog import row",
        );
      }
      contributorIdentities.add(identityKey);
    }

    const citationCounts = new Map<string, number>();
    const citationPositions = new Set<string>();
    for (const [index, row] of envelope.publicCitationRows.entries()) {
      const importId = String(row.catalogImportId);
      for (const [field, value] of [
        ["catalogImportId", importId],
        ["label", row.label],
        ["citation", row.citation],
        ["url", row.url],
      ] as const) {
        addV2NulIssue(context, ["publicCitationRows", index, field], value);
      }
      if (!catalogImportIds.has(importId)) {
        addDuplicateIssue(
          context,
          ["publicCitationRows", index, "catalogImportId"],
          "Public citation row references an unknown catalogImportId",
        );
      }
      citationCounts.set(importId, (citationCounts.get(importId) ?? 0) + 1);
      const positionKey = `${importId}\u0000${row.position}`;
      if (citationPositions.has(positionKey)) {
        addDuplicateIssue(
          context,
          ["publicCitationRows", index, "position"],
          "Public citation position is duplicated for the Catalog import row",
        );
      }
      citationPositions.add(positionKey);
    }

    const validateAction = (
      action: z.output<typeof catalogImportCollectionActionSchema>,
      count: number,
      path: readonly (string | number)[],
      collection: string,
    ) => {
      if (action === "REPLACE" && count === 0) {
        addDuplicateIssue(
          context,
          [...path],
          `${collection} REPLACE requires at least one child row`,
        );
      } else if (action !== "REPLACE" && count !== 0) {
        addDuplicateIssue(
          context,
          [...path],
          `${collection} ${action} requires zero child rows`,
        );
      }
    };
    for (const [index, row] of envelope.catalogRows.entries()) {
      const importId = String(row.catalogImportId);
      validateAction(
        row.contributorsAction,
        contributorCounts.get(importId) ?? 0,
        ["catalogRows", index, "contributorsAction"],
        "contributors",
      );
      validateAction(
        row.publicCitationsAction,
        citationCounts.get(importId) ?? 0,
        ["catalogRows", index, "publicCitationsAction"],
        "publicCitations",
      );
    }
  });

export const versionedCanonicalCatalogImportEnvelopeSchema =
  z.discriminatedUnion("importContractVersion", [
    canonicalCatalogImportEnvelopeSchema,
    canonicalCatalogImportV2EnvelopeSchema,
  ]);

export const parseCanonicalCatalogImportV2Envelope = (input: unknown) => {
  const record = z.record(z.string(), z.unknown()).parse(input);
  catalogImportV2ContractVersionSchema.parse(record.importContractVersion);
  return canonicalCatalogImportV2EnvelopeSchema.parse(input);
};

export const parseVersionedCanonicalCatalogImportEnvelope = (
  input: unknown,
) => {
  const record = z.record(z.string(), z.unknown()).parse(input);
  const version = supportedImportContractVersionSchema.parse(
    record.importContractVersion,
  );
  return version === CATALOG_IMPORT_CONTRACT_VERSION
    ? canonicalCatalogImportEnvelopeSchema.parse(input)
    : canonicalCatalogImportV2EnvelopeSchema.parse(input);
};

export const persistenceDispositionSchema = z.enum([
  "SUPPORTED_NOW",
  "DEFERRED_PERSISTENCE",
  "RAW_ONLY",
  "FUTURE",
]);

export const protectionLevelSchema = z.enum(["LEVEL_A", "LEVEL_B", "LEVEL_C"]);

export const dryRunResultCategorySchema = z.enum([
  "ADD",
  "UPDATE",
  "UNCHANGED",
  "IDENTITY_CONFLICT",
  "CRITICAL_CHANGE",
  "ORDINARY_CHANGE",
  "ERROR",
  "DUPLICATE_CANDIDATE",
]);

export const identityConflictReasonSchema = z.enum([
  "CATALOG_ID_MISMATCH",
  "CATALOG_ID_NOT_FOUND",
  "SOURCE_ID_REBOUND",
  "SOURCE_CATALOG_ASSOCIATION_CONFLICT",
]);

export const applyBlockerCodeSchema = z.enum([
  "IDENTITY_CONFLICT",
  "VALIDATION_ERROR",
  "DEFERRED_FIELD_NOT_PRESERVED",
  "DUPLICATE_CANDIDATE_UNRESOLVED",
  "APPROVAL_REQUIRED",
  "APPROVAL_HASH_MISMATCH",
]);

export const catalogImportFieldNameSchema = z.enum([
  "sourceId",
  "catalogId",
  "catalogKind",
  "title",
  "dynasty",
  "dateText",
  "province",
  "prefecture",
  "county",
  "currentLocation",
  "currentCustodian",
  "description",
  "ownerNote",
  "alias",
  "aliasType",
  "sourceTitle",
  "sourceTypeRaw",
  "sourceUrl",
  "sourceNote",
]);

export const catalogImportV2FieldNameSchema = z.enum([
  ...catalogImportFieldNameSchema.options,
  "scriptStyle",
  "transcription",
  "historicalContext",
  "scholarlyResearch",
  "contributors",
  "publicCitations",
]);

export const dryRunFindingSchema = z
  .strictObject({
    findingId: dryRunFindingIdSchema,
    catalogImportId: catalogImportIdSchema,
    sourceId: sourceIdSchema,
    catalogId: catalogIdSchema.optional(),
    category: dryRunResultCategorySchema,
    field: catalogImportFieldNameSchema.optional(),
    protectionLevel: protectionLevelSchema.optional(),
    persistenceDisposition: persistenceDispositionSchema.optional(),
    identityConflictReason: identityConflictReasonSchema.optional(),
    applyBlocker: applyBlockerCodeSchema.optional(),
    operation: z.enum(["SET", "CLEAR"]).optional(),
    approvable: z.boolean(),
    requiresFieldApproval: z.boolean(),
    message: exactTextSchema(2_000),
  })
  .superRefine((finding, context) => {
    const identityField =
      finding.field === "catalogId" || finding.field === "sourceId";
    if (identityField && finding.category !== "IDENTITY_CONFLICT") {
      context.addIssue({
        code: "custom",
        path: ["category"],
        message:
          "CatalogId and SourceId findings must be non-approvable identity conflicts",
      });
    }
    if (
      finding.category === "IDENTITY_CONFLICT" &&
      (finding.approvable ||
        finding.requiresFieldApproval ||
        finding.identityConflictReason === undefined ||
        finding.applyBlocker !== "IDENTITY_CONFLICT")
    ) {
      context.addIssue({
        code: "custom",
        path: ["approvable"],
        message:
          "Identity conflicts are non-approvable and require an identity conflict reason",
      });
    }
    if (
      finding.category !== "IDENTITY_CONFLICT" &&
      finding.identityConflictReason !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["identityConflictReason"],
        message:
          "Only identity conflicts may carry an identity conflict reason",
      });
    }
    if (finding.category === "CRITICAL_CHANGE" && !finding.approvable) {
      context.addIssue({
        code: "custom",
        path: ["approvable"],
        message:
          "Critical changes are reviewable changes, not identity conflicts",
      });
    }
    if (
      (finding.category === "CRITICAL_CHANGE" ||
        finding.operation === "CLEAR") &&
      !finding.requiresFieldApproval
    ) {
      context.addIssue({
        code: "custom",
        path: ["requiresFieldApproval"],
        message: "Critical changes and CLEAR operations require field approval",
      });
    }
    if (
      finding.persistenceDisposition !== undefined &&
      finding.persistenceDisposition !== "SUPPORTED_NOW" &&
      finding.applyBlocker !== "DEFERRED_FIELD_NOT_PRESERVED"
    ) {
      context.addIssue({
        code: "custom",
        path: ["applyBlocker"],
        message:
          "Deferred and raw changes require an explicit persistence blocker",
      });
    }
  });

export const catalogImportV2DryRunFindingSchema = z
  .strictObject({
    findingId: dryRunFindingIdSchema,
    catalogImportId: catalogImportIdSchema,
    sourceId: sourceIdSchema,
    catalogId: catalogIdSchema.optional(),
    category: dryRunResultCategorySchema,
    field: catalogImportV2FieldNameSchema.optional(),
    protectionLevel: protectionLevelSchema.optional(),
    persistenceDisposition: persistenceDispositionSchema.optional(),
    identityConflictReason: identityConflictReasonSchema.optional(),
    applyBlocker: applyBlockerCodeSchema.optional(),
    operation: z.enum(["SET", "CLEAR"]).optional(),
    approvable: z.boolean(),
    requiresFieldApproval: z.boolean(),
    message: exactTextSchema(2_000),
  })
  .superRefine((finding, context) => {
    const identityField =
      finding.field === "catalogId" || finding.field === "sourceId";
    if (identityField && finding.category !== "IDENTITY_CONFLICT") {
      context.addIssue({
        code: "custom",
        path: ["category"],
        message:
          "CatalogId and SourceId findings must be non-approvable identity conflicts",
      });
    }
    if (
      finding.category === "IDENTITY_CONFLICT" &&
      (finding.approvable ||
        finding.requiresFieldApproval ||
        finding.identityConflictReason === undefined ||
        finding.applyBlocker !== "IDENTITY_CONFLICT")
    ) {
      context.addIssue({
        code: "custom",
        path: ["approvable"],
        message:
          "Identity conflicts are non-approvable and require an identity conflict reason",
      });
    }
    if (
      finding.category !== "IDENTITY_CONFLICT" &&
      finding.identityConflictReason !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["identityConflictReason"],
        message:
          "Only identity conflicts may carry an identity conflict reason",
      });
    }
    if (finding.category === "CRITICAL_CHANGE" && !finding.approvable) {
      context.addIssue({
        code: "custom",
        path: ["approvable"],
        message:
          "Critical changes are reviewable changes, not identity conflicts",
      });
    }
    if (
      (finding.category === "CRITICAL_CHANGE" ||
        finding.operation === "CLEAR") &&
      !finding.requiresFieldApproval
    ) {
      context.addIssue({
        code: "custom",
        path: ["requiresFieldApproval"],
        message: "Critical changes and CLEAR operations require field approval",
      });
    }
    if (
      finding.persistenceDisposition !== undefined &&
      finding.persistenceDisposition !== "SUPPORTED_NOW" &&
      finding.applyBlocker !== "DEFERRED_FIELD_NOT_PRESERVED"
    ) {
      context.addIssue({
        code: "custom",
        path: ["applyBlocker"],
        message:
          "Deferred and raw changes require an explicit persistence blocker",
      });
    }
  });

export const duplicateCandidateDispositionSchema = z.enum([
  "SAME_ENTITY_CANDIDATE",
  "DIFFERENT_ENTITY_CANDIDATE",
  "UNRESOLVED",
]);

export const duplicateCandidateSchema = z.strictObject({
  candidateId: duplicateCandidateIdSchema,
  catalogImportIds: z.array(catalogImportIdSchema).min(2),
  signals: z.array(exactTextSchema(500)).min(1),
  disposition: duplicateCandidateDispositionSchema,
});

export const importRowCountsSchema = z.strictObject({
  catalog: z.number().int().min(0),
  aliases: z.number().int().min(0),
  provenance: z.number().int().min(0),
});

export const catalogImportV2RowCountsSchema = z.strictObject({
  catalog: z.number().int().min(0),
  aliases: z.number().int().min(0),
  provenance: z.number().int().min(0),
  contributors: z.number().int().min(0),
  publicCitations: z.number().int().min(0),
});

export const importResultCountsSchema = z.strictObject({
  add: z.number().int().min(0),
  update: z.number().int().min(0),
  unchanged: z.number().int().min(0),
  conflict: z.number().int().min(0),
  identityConflict: z.number().int().min(0),
  error: z.number().int().min(0),
  duplicateCandidate: z.number().int().min(0),
});

export const catalogImportDryRunSchema = z
  .strictObject({
    importContractVersion: importContractVersionSchema,
    canonicalInputSha256: sha256Schema,
    dryRunResultSha256: sha256Schema,
    state: z.enum(["PASSED", "FAILED"]),
    completedAt: z.iso.datetime({ offset: true }),
    rowCounts: importRowCountsSchema,
    resultCounts: importResultCountsSchema,
    findings: z.array(dryRunFindingSchema),
    duplicateCandidates: z.array(duplicateCandidateSchema),
    applyBlockers: z.array(applyBlockerCodeSchema),
    applyReady: z.boolean(),
  })
  .superRefine((result, context) => {
    const blockers = new Set(result.applyBlockers);
    const findingIds = new Set<string>();
    for (const [index, finding] of result.findings.entries()) {
      const findingId = String(finding.findingId);
      if (findingIds.has(findingId)) {
        context.addIssue({
          code: "custom",
          path: ["findings", index, "findingId"],
          message: "Dry-run finding IDs must be unique",
        });
      }
      findingIds.add(findingId);
      if (
        finding.applyBlocker !== undefined &&
        !blockers.has(finding.applyBlocker)
      ) {
        context.addIssue({
          code: "custom",
          path: ["findings", index, "applyBlocker"],
          message: "Every finding blocker must be present in applyBlockers",
        });
      }
    }
    for (const blocker of [
      "IDENTITY_CONFLICT",
      "DEFERRED_FIELD_NOT_PRESERVED",
    ] as const) {
      if (
        blockers.has(blocker) &&
        !result.findings.some((finding) => finding.applyBlocker === blocker)
      ) {
        context.addIssue({
          code: "custom",
          path: ["applyBlockers"],
          message: `${blocker} requires an explicit dry-run finding`,
        });
      }
    }
    if (
      result.resultCounts.identityConflict > result.resultCounts.conflict ||
      result.resultCounts.duplicateCandidate !==
        result.duplicateCandidates.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["resultCounts"],
        message:
          "Identity conflicts must be a subset of conflicts and duplicate counts must reconcile",
      });
    }
    if (
      result.resultCounts.identityConflict > 0 &&
      !blockers.has("IDENTITY_CONFLICT")
    ) {
      context.addIssue({
        code: "custom",
        path: ["applyBlockers"],
        message: "Identity conflict counts require an identity apply blocker",
      });
    }
    if (
      result.resultCounts.add +
        result.resultCounts.update +
        result.resultCounts.unchanged +
        result.resultCounts.conflict +
        result.resultCounts.error >
      result.rowCounts.catalog
    ) {
      context.addIssue({
        code: "custom",
        path: ["resultCounts"],
        message: "Catalog row outcomes cannot exceed the Catalog row count",
      });
    }
    const expectedReady =
      result.state === "PASSED" &&
      blockers.size === 0 &&
      result.resultCounts.error === 0 &&
      result.resultCounts.identityConflict === 0 &&
      result.duplicateCandidates.every(
        ({ disposition }) => disposition !== "UNRESOLVED",
      );
    if (result.applyReady !== expectedReady) {
      context.addIssue({
        code: "custom",
        path: ["applyReady"],
        message:
          "applyReady must reflect dry-run errors, identity conflicts, and blockers",
      });
    }
  });

export const catalogImportV2DryRunSchema = z
  .strictObject({
    importContractVersion: catalogImportV2ContractVersionSchema,
    canonicalInputSha256: sha256Schema,
    dryRunResultSha256: sha256Schema,
    state: z.enum(["PASSED", "FAILED"]),
    completedAt: z.iso.datetime({ offset: true }),
    rowCounts: catalogImportV2RowCountsSchema,
    resultCounts: importResultCountsSchema,
    findings: z.array(catalogImportV2DryRunFindingSchema),
    duplicateCandidates: z.array(duplicateCandidateSchema),
    applyBlockers: z.array(applyBlockerCodeSchema),
    applyReady: z.boolean(),
  })
  .superRefine((result, context) => {
    const blockers = new Set(result.applyBlockers);
    const findingIds = new Set<string>();
    for (const [index, finding] of result.findings.entries()) {
      const id = String(finding.findingId);
      if (findingIds.has(id)) {
        context.addIssue({
          code: "custom",
          path: ["findings", index, "findingId"],
          message: "Dry-run finding IDs must be unique",
        });
      }
      findingIds.add(id);
      if (
        finding.applyBlocker !== undefined &&
        !blockers.has(finding.applyBlocker)
      ) {
        context.addIssue({
          code: "custom",
          path: ["findings", index, "applyBlocker"],
          message: "Every finding blocker must be present in applyBlockers",
        });
      }
    }
    for (const blocker of [
      "IDENTITY_CONFLICT",
      "DEFERRED_FIELD_NOT_PRESERVED",
    ] as const) {
      if (
        blockers.has(blocker) &&
        !result.findings.some((finding) => finding.applyBlocker === blocker)
      ) {
        context.addIssue({
          code: "custom",
          path: ["applyBlockers"],
          message: `${blocker} requires an explicit dry-run finding`,
        });
      }
    }
    if (
      result.resultCounts.identityConflict > result.resultCounts.conflict ||
      result.resultCounts.duplicateCandidate !==
        result.duplicateCandidates.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["resultCounts"],
        message:
          "Identity conflicts must be a subset of conflicts and duplicate counts must reconcile",
      });
    }
    if (
      result.resultCounts.identityConflict > 0 &&
      !blockers.has("IDENTITY_CONFLICT")
    ) {
      context.addIssue({
        code: "custom",
        path: ["applyBlockers"],
        message: "Identity conflict counts require an identity apply blocker",
      });
    }
    if (
      result.resultCounts.add +
        result.resultCounts.update +
        result.resultCounts.unchanged +
        result.resultCounts.conflict +
        result.resultCounts.error !==
      result.rowCounts.catalog
    ) {
      context.addIssue({
        code: "custom",
        path: ["resultCounts"],
        message: "Catalog row outcomes must equal the Catalog row count",
      });
    }
    const expectedReady =
      result.state === "PASSED" &&
      blockers.size === 0 &&
      result.resultCounts.error === 0 &&
      result.resultCounts.identityConflict === 0 &&
      result.duplicateCandidates.every(
        ({ disposition }) => disposition !== "UNRESOLVED",
      );
    if (result.applyReady !== expectedReady) {
      context.addIssue({
        code: "custom",
        path: ["applyReady"],
        message:
          "applyReady must reflect dry-run errors, identity conflicts, and blockers",
      });
    }
  });

export const versionedCatalogImportDryRunSchema = z.discriminatedUnion(
  "importContractVersion",
  [catalogImportDryRunSchema, catalogImportV2DryRunSchema],
);

export const importApprovalSchema = z
  .strictObject({
    importContractVersion: importContractVersionSchema,
    canonicalInputSha256: sha256Schema,
    dryRunResultSha256: sha256Schema,
    state: z.enum(["NOT_REQUESTED", "PENDING", "APPROVED", "REJECTED"]),
    approvedFindingIds: z.array(dryRunFindingIdSchema),
    decidedBy: exactTextSchema(200).optional(),
    decidedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((approval, context) => {
    if (
      new Set(approval.approvedFindingIds).size !==
      approval.approvedFindingIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["approvedFindingIds"],
        message: "approvedFindingIds must be unique",
      });
    }
    const decided =
      approval.state === "APPROVED" || approval.state === "REJECTED";
    const hasDecider = approval.decidedBy !== undefined;
    const hasDecisionTime = approval.decidedAt !== undefined;
    if (
      (decided && (!hasDecider || !hasDecisionTime)) ||
      (!decided && (hasDecider || hasDecisionTime))
    ) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "Final approval states require both decidedBy and decidedAt",
      });
    }
  });

export const importV2ApprovalSchema = z
  .strictObject({
    importContractVersion: catalogImportV2ContractVersionSchema,
    canonicalInputSha256: sha256Schema,
    dryRunResultSha256: sha256Schema,
    state: z.enum(["NOT_REQUESTED", "PENDING", "APPROVED", "REJECTED"]),
    approvedFindingIds: z.array(dryRunFindingIdSchema),
    decidedBy: exactTextSchema(200).optional(),
    decidedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((approval, context) => {
    if (
      new Set(approval.approvedFindingIds).size !==
      approval.approvedFindingIds.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["approvedFindingIds"],
        message: "approvedFindingIds must be unique",
      });
    }
    const decided =
      approval.state === "APPROVED" || approval.state === "REJECTED";
    const hasDecider = approval.decidedBy !== undefined;
    const hasDecisionTime = approval.decidedAt !== undefined;
    if (
      (decided && (!hasDecider || !hasDecisionTime)) ||
      (!decided && (hasDecider || hasDecisionTime))
    ) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "Final approval states require both decidedBy and decidedAt",
      });
    }
  });

export const versionedImportApprovalSchema = z.discriminatedUnion(
  "importContractVersion",
  [importApprovalSchema, importV2ApprovalSchema],
);

export const importBatchStateSchema = z.enum([
  "RECEIVED",
  "VALIDATED",
  "DRY_RUN_COMPLETE",
  "AWAITING_APPROVAL",
  "APPROVED",
  "APPLY_BLOCKED",
  "APPLIED",
  "REJECTED",
]);

export const importBatchSchema = z
  .strictObject({
    batchId: importBatchIdSchema,
    importContractVersion: importContractVersionSchema,
    state: importBatchStateSchema,
    inputFormat: z.enum(["XLSX", "CSV"]),
    sourceArtifactSha256: sha256Schema.optional(),
    canonicalInputSha256: sha256Schema,
    createdAt: z.iso.datetime({ offset: true }),
    rowCounts: importRowCountsSchema,
    dryRun: catalogImportDryRunSchema.optional(),
    approval: importApprovalSchema.optional(),
    appliedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((batch, context) => {
    if (
      [
        "DRY_RUN_COMPLETE",
        "AWAITING_APPROVAL",
        "APPROVED",
        "APPLY_BLOCKED",
        "APPLIED",
      ].includes(batch.state) &&
      batch.dryRun === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["dryRun"],
        message: `${batch.state} batches require a dry-run result`,
      });
    }
    if (
      batch.state === "AWAITING_APPROVAL" &&
      batch.approval?.state !== "PENDING"
    ) {
      context.addIssue({
        code: "custom",
        path: ["approval", "state"],
        message: "AWAITING_APPROVAL batches require pending approval",
      });
    }
    if (
      batch.state === "APPROVED" &&
      (batch.dryRun?.applyReady !== true ||
        batch.approval?.state !== "APPROVED")
    ) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message:
          "APPROVED batches require an apply-ready dry-run and approved decision",
      });
    }
    if (batch.state === "APPLY_BLOCKED" && batch.dryRun?.applyReady !== false) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "APPLY_BLOCKED batches require a blocked dry-run",
      });
    }
    if (
      batch.dryRun !== undefined &&
      (batch.dryRun.canonicalInputSha256 !== batch.canonicalInputSha256 ||
        JSON.stringify(batch.dryRun.rowCounts) !==
          JSON.stringify(batch.rowCounts))
    ) {
      context.addIssue({
        code: "custom",
        path: ["dryRun", "canonicalInputSha256"],
        message:
          "Dry-run canonical input hash and row counts must match the batch",
      });
    }
    if (
      batch.approval !== undefined &&
      (batch.approval.canonicalInputSha256 !== batch.canonicalInputSha256 ||
        batch.approval.dryRunResultSha256 !== batch.dryRun?.dryRunResultSha256)
    ) {
      context.addIssue({
        code: "custom",
        path: ["approval"],
        message:
          "Approval must bind the batch canonical input and dry-run result hashes",
      });
    }
    if (
      batch.appliedAt !== undefined &&
      (batch.state !== "APPLIED" ||
        batch.dryRun?.applyReady !== true ||
        batch.approval?.state !== "APPROVED")
    ) {
      context.addIssue({
        code: "custom",
        path: ["appliedAt"],
        message: "Apply requires an apply-ready dry-run and matching approval",
      });
    }
    if (batch.state === "APPLIED" && batch.appliedAt === undefined) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "APPLIED batches require appliedAt",
      });
    }
    if (batch.approval !== undefined && batch.dryRun !== undefined) {
      const findings = new Map(
        batch.dryRun.findings.map((finding) => [
          String(finding.findingId),
          finding,
        ]),
      );
      for (const [
        index,
        findingId,
      ] of batch.approval.approvedFindingIds.entries()) {
        const finding = findings.get(String(findingId));
        if (finding === undefined || !finding.approvable) {
          context.addIssue({
            code: "custom",
            path: ["approval", "approvedFindingIds", index],
            message: "Approval may reference only approvable dry-run findings",
          });
        }
      }
      if (batch.state === "APPROVED" || batch.appliedAt !== undefined) {
        const approved = new Set(batch.approval.approvedFindingIds.map(String));
        for (const finding of batch.dryRun.findings) {
          if (
            finding.requiresFieldApproval &&
            !approved.has(String(finding.findingId))
          ) {
            context.addIssue({
              code: "custom",
              path: ["appliedAt"],
              message:
                "Every field-level approval must bind an approvable finding",
            });
          }
        }
      }
    }
  });

export const importV2BatchSchema = z
  .strictObject({
    batchId: importBatchIdSchema,
    importContractVersion: catalogImportV2ContractVersionSchema,
    state: importBatchStateSchema,
    inputFormat: z.enum(["XLSX", "CSV"]),
    sourceArtifactSha256: sha256Schema.optional(),
    canonicalInputSha256: sha256Schema,
    createdAt: z.iso.datetime({ offset: true }),
    rowCounts: catalogImportV2RowCountsSchema,
    dryRun: catalogImportV2DryRunSchema.optional(),
    approval: importV2ApprovalSchema.optional(),
    appliedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((batch, context) => {
    if (
      [
        "DRY_RUN_COMPLETE",
        "AWAITING_APPROVAL",
        "APPROVED",
        "APPLY_BLOCKED",
        "APPLIED",
      ].includes(batch.state) &&
      batch.dryRun === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["dryRun"],
        message: `${batch.state} batches require a dry-run result`,
      });
    }
    if (
      batch.state === "AWAITING_APPROVAL" &&
      batch.approval?.state !== "PENDING"
    ) {
      context.addIssue({
        code: "custom",
        path: ["approval", "state"],
        message: "AWAITING_APPROVAL batches require pending approval",
      });
    }
    if (
      batch.state === "APPROVED" &&
      (batch.dryRun?.applyReady !== true ||
        batch.approval?.state !== "APPROVED")
    ) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message:
          "APPROVED batches require an apply-ready dry-run and approved decision",
      });
    }
    if (batch.state === "APPLY_BLOCKED" && batch.dryRun?.applyReady !== false) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "APPLY_BLOCKED batches require a blocked dry-run",
      });
    }
    if (
      batch.dryRun !== undefined &&
      (batch.dryRun.canonicalInputSha256 !== batch.canonicalInputSha256 ||
        JSON.stringify(batch.dryRun.rowCounts) !==
          JSON.stringify(batch.rowCounts))
    ) {
      context.addIssue({
        code: "custom",
        path: ["dryRun", "canonicalInputSha256"],
        message:
          "Dry-run canonical input hash and row counts must match the batch",
      });
    }
    if (
      batch.approval !== undefined &&
      (batch.approval.canonicalInputSha256 !== batch.canonicalInputSha256 ||
        batch.approval.dryRunResultSha256 !== batch.dryRun?.dryRunResultSha256)
    ) {
      context.addIssue({
        code: "custom",
        path: ["approval"],
        message:
          "Approval must bind the batch canonical input and dry-run result hashes",
      });
    }
    if (
      batch.appliedAt !== undefined &&
      (batch.state !== "APPLIED" ||
        batch.dryRun?.applyReady !== true ||
        batch.approval?.state !== "APPROVED")
    ) {
      context.addIssue({
        code: "custom",
        path: ["appliedAt"],
        message: "Apply requires an apply-ready dry-run and matching approval",
      });
    }
    if (batch.state === "APPLIED" && batch.appliedAt === undefined) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "APPLIED batches require appliedAt",
      });
    }
    if (batch.approval !== undefined && batch.dryRun !== undefined) {
      const findings = new Map(
        batch.dryRun.findings.map((finding) => [
          String(finding.findingId),
          finding,
        ]),
      );
      for (const [
        index,
        findingId,
      ] of batch.approval.approvedFindingIds.entries()) {
        const finding = findings.get(String(findingId));
        if (finding === undefined || !finding.approvable) {
          context.addIssue({
            code: "custom",
            path: ["approval", "approvedFindingIds", index],
            message: "Approval may reference only approvable dry-run findings",
          });
        }
      }
      if (batch.state === "APPROVED" || batch.appliedAt !== undefined) {
        const approved = new Set(batch.approval.approvedFindingIds.map(String));
        for (const finding of batch.dryRun.findings) {
          if (
            finding.requiresFieldApproval &&
            !approved.has(String(finding.findingId))
          ) {
            context.addIssue({
              code: "custom",
              path: ["appliedAt"],
              message:
                "Every field-level approval must bind an approvable finding",
            });
          }
        }
      }
    }
  });

export const versionedImportBatchSchema = z.discriminatedUnion(
  "importContractVersion",
  [importBatchSchema, importV2BatchSchema],
);

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson };

const compareUtf16CodeUnits = (left: string, right: string): number => {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
};

const compareBusinessKeyTuples = (
  left: readonly string[],
  right: readonly string[],
): number => {
  for (let index = 0; index < left.length; index += 1) {
    const comparison = compareUtf16CodeUnits(
      left[index] ?? "",
      right[index] ?? "",
    );
    if (comparison !== 0) return comparison;
  }
  return left.length - right.length;
};

const isWellFormedUtf16 = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
};

const assertWellFormedCanonicalStrings = (value: unknown): void => {
  if (typeof value === "string") {
    if (!isWellFormedUtf16(value)) {
      throw new TypeError(
        "RFC 8785 canonical input cannot contain an unpaired UTF-16 surrogate",
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertWellFormedCanonicalStrings(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      assertWellFormedCanonicalStrings(item);
    }
  }
};

/**
 * v1 row position is presentation-only. This creates the hash representation
 * without mutating the validated envelope. Tuple comparison uses ECMAScript's
 * locale-independent UTF-16 code-unit ordering with no Unicode normalization,
 * case folding, trimming, or other value transformation.
 */
export const canonicalizeCatalogImportEnvelopeForHash = (input: unknown) => {
  const envelope = canonicalCatalogImportEnvelopeSchema.parse(input);
  assertWellFormedCanonicalStrings(envelope);
  return {
    importContractVersion: envelope.importContractVersion,
    catalogRows: [...envelope.catalogRows].sort((left, right) =>
      compareBusinessKeyTuples(
        [String(left.catalogImportId)],
        [String(right.catalogImportId)],
      ),
    ),
    aliasRows: [...envelope.aliasRows].sort((left, right) =>
      compareBusinessKeyTuples(
        [String(left.catalogImportId), left.alias],
        [String(right.catalogImportId), right.alias],
      ),
    ),
    provenanceRows: [...envelope.provenanceRows].sort((left, right) =>
      compareBusinessKeyTuples(
        [String(left.catalogImportId), String(left.sourceId)],
        [String(right.catalogImportId), String(right.sourceId)],
      ),
    ),
  };
};

const compareCatalogImportPosition = (
  left: { readonly catalogImportId: unknown; readonly position: number },
  right: { readonly catalogImportId: unknown; readonly position: number },
): number =>
  compareUtf16CodeUnits(
    String(left.catalogImportId),
    String(right.catalogImportId),
  ) || left.position - right.position;

export const canonicalizeCatalogImportV2EnvelopeForHash = (input: unknown) => {
  const envelope = canonicalCatalogImportV2EnvelopeSchema.parse(input);
  assertWellFormedCanonicalStrings(envelope);
  return {
    importContractVersion: envelope.importContractVersion,
    catalogRows: [...envelope.catalogRows].sort((left, right) =>
      compareBusinessKeyTuples(
        [String(left.catalogImportId)],
        [String(right.catalogImportId)],
      ),
    ),
    aliasRows: [...envelope.aliasRows].sort((left, right) =>
      compareBusinessKeyTuples(
        [String(left.catalogImportId), left.alias],
        [String(right.catalogImportId), right.alias],
      ),
    ),
    provenanceRows: [...envelope.provenanceRows].sort((left, right) =>
      compareBusinessKeyTuples(
        [String(left.catalogImportId), String(left.sourceId)],
        [String(right.catalogImportId), String(right.sourceId)],
      ),
    ),
    contributorRows: [...envelope.contributorRows].sort(
      compareCatalogImportPosition,
    ),
    publicCitationRows: [...envelope.publicCitationRows]
      .map((row) => {
        const appliesTo = canonicalizeCatalogImportCitationScopes(
          row.appliesTo,
        );
        return appliesTo === undefined ? { ...row } : { ...row, appliesTo };
      })
      .sort(compareCatalogImportPosition),
  };
};

const serializeCanonicalJson = (value: CanonicalJson): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonicalJson).join(",")}]`;
  }
  const object = value as { readonly [key: string]: CanonicalJson };
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${serializeCanonicalJson(object[key] as CanonicalJson)}`,
    )
    .join(",")}}`;
};

/** RFC 8785-compatible for the string/array/object-only v1 canonical envelope. */
export const serializeCanonicalCatalogImportEnvelope = (
  input: unknown,
): string =>
  serializeCanonicalJson(
    JSON.parse(
      JSON.stringify(canonicalizeCatalogImportEnvelopeForHash(input)),
    ) as CanonicalJson,
  );

export const serializeCanonicalCatalogImportV2Envelope = (
  input: unknown,
): string =>
  serializeCanonicalJson(
    JSON.parse(
      JSON.stringify(canonicalizeCatalogImportV2EnvelopeForHash(input)),
    ) as CanonicalJson,
  );

export const serializeVersionedCanonicalCatalogImportEnvelope = (
  input: unknown,
): string => {
  const envelope = parseVersionedCanonicalCatalogImportEnvelope(input);
  return envelope.importContractVersion === CATALOG_IMPORT_CONTRACT_VERSION
    ? serializeCanonicalCatalogImportEnvelope(envelope)
    : serializeCanonicalCatalogImportV2Envelope(envelope);
};
