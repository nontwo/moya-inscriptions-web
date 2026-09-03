import { createHash } from "node:crypto";

import {
  CATALOG_IMPORT_CITATION_SCOPE_ORDER,
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_V2_CONTRACT_VERSION,
  canonicalCatalogImportEnvelopeSchema,
  canonicalCatalogImportV2EnvelopeSchema,
  catalogImportIdSchema,
  catalogImportDryRunSchema,
  catalogImportV2DryRunSchema,
  dryRunFindingIdSchema,
  duplicateCandidateSchema,
  serializeCanonicalCatalogImportEnvelope,
  serializeCanonicalCatalogImportV2Envelope,
  sha256Schema,
  versionedCatalogImportDryRunSchema,
  versionedImportApprovalSchema,
} from "@moya/contracts/internal/catalog-import";
import type {
  CanonicalCatalogImportEnvelope,
  CanonicalCatalogImportV2Envelope,
  CatalogImportDryRun,
  CatalogImportV2DryRun,
  VersionedCatalogImportDryRun,
  VersionedImportApproval,
} from "@moya/contracts/internal/catalog-import";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type {
  ParsedCatalogImportBundle,
  ParsedCatalogImportV1Bundle,
  ParsedCatalogImportV2Bundle,
} from "./parsing/canonical-bundle.js";

export {
  CATALOG_IMPORT_DIAGNOSTIC_CODES,
  CatalogImportDiagnosticError,
  sortCatalogImportDiagnostics,
} from "./diagnostics.js";
export {
  CATALOG_IMPORT_CSV_LIMITS,
  parseCatalogImportCsvBundle,
} from "./parsing/csv.js";
export { CATALOG_IMPORT_XLSX_LIMITS } from "./parsing/ooxml-preflight.js";
export {
  parseCatalogImportXlsxFile,
  parseCatalogImportXlsxWorkbook,
  preflightCatalogImportXlsxWorkbook,
} from "./parsing/xlsx.js";

export type {
  CatalogImportDiagnostic,
  CatalogImportDiagnosticCategory,
  CatalogImportDiagnosticCode,
} from "./diagnostics.js";
export type {
  ParsedCatalogImportBundle,
  ParsedCatalogImportV1Bundle,
  ParsedCatalogImportV2Bundle,
} from "./parsing/canonical-bundle.js";
export type { CatalogImportXlsxPreflightResult } from "./parsing/xlsx.js";

const textSha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
};

export const hashApproval = (approval: VersionedImportApproval): string =>
  textSha256(stableJson(versionedImportApprovalSchema.parse(approval)));

interface QueryPort {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

interface SourceMappingRow extends QueryResultRow {
  readonly source_id: string;
  readonly catalog_id: string;
  readonly source_title: string | null;
  readonly source_type_raw: string | null;
  readonly source_url: string | null;
  readonly source_note: string | null;
}

interface CatalogIdentityRow extends QueryResultRow {
  readonly catalog_id: string;
  readonly kind: "inscription" | "calligraphy";
  readonly title: string;
  readonly dynasty: string | null;
  readonly dynasty_state: string;
  readonly date_text: string | null;
  readonly date_text_state: string;
  readonly province: string | null;
  readonly province_state: string;
  readonly prefecture: string | null;
  readonly prefecture_state: string;
  readonly county: string | null;
  readonly county_state: string;
  readonly current_location: string | null;
  readonly current_location_state: string;
  readonly current_custodian: string | null;
  readonly current_custodian_state: string;
  readonly description: string | null;
  readonly description_state: string;
}

interface CatalogV2IdentityRow extends CatalogIdentityRow {
  readonly script_style: string | null;
  readonly script_style_state: string;
  readonly transcription: string | null;
  readonly transcription_state: string;
  readonly historical_context: string | null;
  readonly historical_context_state: string;
  readonly scholarly_research: string | null;
  readonly scholarly_research_state: string;
}

interface CatalogAliasRow extends QueryResultRow {
  readonly catalog_id: string;
  readonly alias: string;
  readonly alias_type: "alternate" | "historical";
}

interface CatalogContributorRow extends QueryResultRow {
  readonly catalog_id: string;
  readonly position: number;
  readonly name: string;
  readonly role: "textAuthor" | "calligrapher";
}

interface CatalogPublicCitationRow extends QueryResultRow {
  readonly catalog_id: string;
  readonly position: number;
  readonly label: string;
  readonly citation: string | null;
  readonly url: string | null;
}

interface CatalogCitationScopeRow extends QueryResultRow {
  readonly catalog_id: string;
  readonly citation_position: number;
  readonly scope:
    | "record"
    | "description"
    | "transcription"
    | "historicalContext"
    | "scholarlyResearch";
}

export const hashCatalogImportDryRun = (
  input: Omit<
    VersionedCatalogImportDryRun,
    "dryRunResultSha256" | "completedAt"
  >,
) => textSha256(stableJson(input));

const canonicalizeParsedBundle = (
  parsed: ParsedCatalogImportBundle,
): ParsedCatalogImportBundle => {
  const version = parsed.envelope.importContractVersion;
  const envelope =
    version === CATALOG_IMPORT_CONTRACT_VERSION
      ? canonicalCatalogImportEnvelopeSchema.parse(parsed.envelope)
      : canonicalCatalogImportV2EnvelopeSchema.parse(parsed.envelope);
  const canonicalJson =
    version === CATALOG_IMPORT_CONTRACT_VERSION
      ? serializeCanonicalCatalogImportEnvelope(envelope)
      : serializeCanonicalCatalogImportV2Envelope(envelope);
  const canonicalInputSha256 = textSha256(canonicalJson);
  const rowCounts =
    version === CATALOG_IMPORT_CONTRACT_VERSION
      ? {
          catalog: envelope.catalogRows.length,
          aliases: envelope.aliasRows.length,
          provenance: envelope.provenanceRows.length,
        }
      : (() => {
          const v2Envelope = envelope as CanonicalCatalogImportV2Envelope;
          return {
            catalog: v2Envelope.catalogRows.length,
            aliases: v2Envelope.aliasRows.length,
            provenance: v2Envelope.provenanceRows.length,
            contributors: v2Envelope.contributorRows.length,
            publicCitations: v2Envelope.publicCitationRows.length,
          };
        })();
  if (
    parsed.canonicalJson !== canonicalJson ||
    parsed.canonicalInputSha256 !== canonicalInputSha256 ||
    stableJson(parsed.rowCounts) !== stableJson(rowCounts)
  ) {
    throw new Error(
      "Parsed import bundle metadata does not match its envelope",
    );
  }
  const canonicalEnvelope =
    version === CATALOG_IMPORT_CONTRACT_VERSION
      ? envelope
      : canonicalCatalogImportV2EnvelopeSchema.parse(JSON.parse(canonicalJson));
  return {
    envelope: canonicalEnvelope,
    canonicalJson,
    canonicalInputSha256,
    rowCounts,
  } as ParsedCatalogImportBundle;
};

const fieldNames = [
  "dynasty",
  "dateText",
  "province",
  "prefecture",
  "county",
  "currentLocation",
  "currentCustodian",
  "description",
] as const;
type OptionalFieldName = (typeof fieldNames)[number];
type CanonicalRow = CanonicalCatalogImportEnvelope["catalogRows"][number];
type CanonicalField = CanonicalRow[OptionalFieldName];

const v2FieldNames = [
  ...fieldNames,
  "scriptStyle",
  "transcription",
  "historicalContext",
  "scholarlyResearch",
] as const;
type V2OptionalFieldName = (typeof v2FieldNames)[number];
type CanonicalV2Row = CanonicalCatalogImportV2Envelope["catalogRows"][number];
type CanonicalV2Field = CanonicalV2Row[V2OptionalFieldName];

const databaseField = {
  dynasty: "dynasty",
  dateText: "date_text",
  province: "province",
  prefecture: "prefecture",
  county: "county",
  currentLocation: "current_location",
  currentCustodian: "current_custodian",
  description: "description",
} as const;

const v2DatabaseField = {
  ...databaseField,
  scriptStyle: "script_style",
  transcription: "transcription",
  historicalContext: "historical_context",
  scholarlyResearch: "scholarly_research",
} as const;

const existingField = (
  row: CatalogIdentityRow,
  field: OptionalFieldName,
): { state: string; value: string | null } => {
  const column = databaseField[field];
  const record = row as unknown as Record<string, string | null>;
  return {
    state: String(record[`${column}_state`]),
    value: record[column] ?? null,
  };
};

const existingV2Field = (
  row: CatalogV2IdentityRow,
  field: V2OptionalFieldName,
): { state: string; value: string | null } => {
  const column = v2DatabaseField[field];
  const record = row as unknown as Record<string, string | null>;
  return {
    state: String(record[`${column}_state`]),
    value: record[column] ?? null,
  };
};

const fieldValue = (field: {
  readonly state: string;
  readonly value?: string;
}) => (field.state === "VALUE" ? field.value : null);

const v2FieldProtection = (
  field: V2OptionalFieldName,
): "LEVEL_B" | "LEVEL_C" =>
  field === "description" ||
  field === "historicalContext" ||
  field === "scholarlyResearch"
    ? "LEVEL_C"
    : "LEVEL_B";

const findingId = (sourceId: string, field: string, operation: string) =>
  dryRunFindingIdSchema.parse(
    `finding-${textSha256(`${sourceId}\0${field}\0${operation}`).slice(0, 32)}`,
  );

const ownerNotePersistenceFinding = (
  row: CanonicalRow,
): CatalogImportDryRun["findings"][number] | undefined =>
  row.ownerNote === undefined
    ? undefined
    : {
        findingId: findingId(String(row.sourceId), "ownerNote", "SET"),
        catalogImportId: row.catalogImportId,
        sourceId: row.sourceId,
        ...(row.catalogId === undefined ? {} : { catalogId: row.catalogId }),
        category: "ERROR",
        field: "ownerNote",
        protectionLevel: "LEVEL_C",
        persistenceDisposition: "RAW_ONLY",
        applyBlocker: "DEFERRED_FIELD_NOT_PRESERVED",
        operation: "SET",
        approvable: false,
        requiresFieldApproval: false,
        message: "ownerNote cannot be silently discarded by apply",
      };

const sameField = (
  incoming: CanonicalField,
  existing: { readonly state: string; readonly value: string | null },
) =>
  incoming.state === existing.state &&
  (incoming.state !== "VALUE" || incoming.value === existing.value);

const aliasKey = (alias: string, aliasType: string) => `${alias}\0${aliasType}`;

const assertDefinedAliasUpdate = (
  importId: string,
  catalogId: string,
  incomingAliases: CanonicalCatalogImportEnvelope["aliasRows"],
  existingAliases: readonly CatalogAliasRow[],
) => {
  const incoming = incomingAliases
    .filter(({ catalogImportId }) => String(catalogImportId) === importId)
    .map(({ alias, aliasType }) => aliasKey(alias, aliasType))
    .sort();
  const existing = existingAliases
    .filter((row) => row.catalog_id === catalogId)
    .map((row) => aliasKey(row.alias, row.alias_type))
    .sort();
  if (stableJson(incoming) !== stableJson(existing)) {
    throw new Error(
      `P5 REMEDIATION — CONTRACT SEMANTICS OWNER REVIEW REQUIRED: catalog-import/v1 does not define alias merge/replace semantics for ${importId}`,
    );
  }
};

const canonicalProvenance = (
  row: CanonicalCatalogImportEnvelope["provenanceRows"][number],
) => ({
  sourceTitle: row.sourceTitle ?? null,
  sourceTypeRaw: row.sourceTypeRaw ?? null,
  sourceUrl: row.sourceUrl ?? null,
  sourceNote: row.sourceNote ?? null,
});

const createCatalogImportV1DryRun = async (
  queryPort: QueryPort,
  parsed: ParsedCatalogImportV1Bundle,
  completedAt: string,
): Promise<CatalogImportDryRun> => {
  const canonical = canonicalizeParsedBundle(
    parsed,
  ) as ParsedCatalogImportV1Bundle;
  const sourceIds = canonical.envelope.provenanceRows.map(({ sourceId }) =>
    String(sourceId),
  );
  const catalogIds = canonical.envelope.catalogRows.flatMap(({ catalogId }) =>
    catalogId === undefined ? [] : [String(catalogId)],
  );
  const titles = canonical.envelope.catalogRows.map(({ title }) => title);
  const sources = await queryPort.query<SourceMappingRow>(
    `SELECT source_id, catalog_id, source_title, source_type_raw, source_url, source_note
       FROM catalog_import_sources WHERE source_id = ANY($1::text[])`,
    [sourceIds],
  );
  const catalogs = await queryPort.query<CatalogIdentityRow>(
    `SELECT catalog_id, kind, title, dynasty, dynasty_state, date_text,
        date_text_state, province, province_state, prefecture, prefecture_state,
        county, county_state, current_location, current_location_state,
        current_custodian, current_custodian_state, description, description_state
       FROM catalog_entries WHERE catalog_id = ANY($1::text[])`,
    [catalogIds],
  );
  const titleMatches = await queryPort.query<CatalogIdentityRow>(
    "SELECT catalog_id, title FROM catalog_entries WHERE title = ANY($1::text[])",
    [titles],
  );
  const aliases = await queryPort.query<CatalogAliasRow>(
    "SELECT catalog_id, alias, alias_type FROM catalog_aliases WHERE catalog_id = ANY($1::text[]) ORDER BY catalog_id, position",
    [catalogIds],
  );
  const sourceMap = new Map(sources.rows.map((row) => [row.source_id, row]));
  const catalogMap = new Map(catalogs.rows.map((row) => [row.catalog_id, row]));
  const titleMap = new Map(
    titleMatches.rows.map((row) => [row.title, row.catalog_id]),
  );
  const findings: CatalogImportDryRun["findings"] = [];
  const duplicateCandidates: CatalogImportDryRun["duplicateCandidates"] = [];
  let add = 0;
  let update = 0;
  let unchanged = 0;
  let conflict = 0;
  let error = 0;

  for (const row of canonical.envelope.catalogRows) {
    const sourceId = String(row.sourceId);
    const importId = String(row.catalogImportId);
    const targetId =
      row.catalogId === undefined ? undefined : String(row.catalogId);
    const provenance = canonical.envelope.provenanceRows.filter(
      ({ catalogImportId }) => String(catalogImportId) === importId,
    );
    const primary = provenance.find(
      ({ sourceId: candidate }) => String(candidate) === sourceId,
    );
    if (primary === undefined) {
      conflict += 1;
      findings.push({
        findingId: findingId(sourceId, "sourceId", "missing-provenance"),
        catalogImportId: row.catalogImportId,
        sourceId: row.sourceId,
        category: "IDENTITY_CONFLICT",
        field: "sourceId",
        identityConflictReason: "SOURCE_CATALOG_ASSOCIATION_CONFLICT",
        applyBlocker: "IDENTITY_CONFLICT",
        approvable: false,
        requiresFieldApproval: false,
        message: "Primary SourceId provenance is missing",
      });
      continue;
    }
    const rebound = provenance.find((item) => {
      const existing = sourceMap.get(String(item.sourceId));
      return existing !== undefined && targetId !== existing.catalog_id;
    });
    if (rebound !== undefined) {
      conflict += 1;
      findings.push({
        findingId: findingId(String(rebound.sourceId), "sourceId", "rebound"),
        catalogImportId: row.catalogImportId,
        sourceId: rebound.sourceId,
        ...(row.catalogId === undefined ? {} : { catalogId: row.catalogId }),
        category: "IDENTITY_CONFLICT",
        field: "sourceId",
        identityConflictReason: "SOURCE_ID_REBOUND",
        applyBlocker: "IDENTITY_CONFLICT",
        approvable: false,
        requiresFieldApproval: false,
        message: "SourceId is already bound to another CatalogId",
      });
      continue;
    }

    const target =
      targetId === undefined ? undefined : catalogMap.get(targetId);
    if (targetId !== undefined && target === undefined) {
      conflict += 1;
      findings.push({
        findingId: findingId(sourceId, "catalogId", "not-found"),
        catalogImportId: row.catalogImportId,
        sourceId: row.sourceId,
        catalogId: row.catalogId,
        category: "IDENTITY_CONFLICT",
        field: "catalogId",
        identityConflictReason: "CATALOG_ID_NOT_FOUND",
        applyBlocker: "IDENTITY_CONFLICT",
        approvable: false,
        requiresFieldApproval: false,
        message: "The supplied CatalogId update target does not exist",
      });
      continue;
    }

    const ownerNoteFinding = ownerNotePersistenceFinding(row);
    if (ownerNoteFinding !== undefined) {
      error += 1;
      findings.push(ownerNoteFinding);
      continue;
    }

    if (target !== undefined) {
      assertDefinedAliasUpdate(
        importId,
        target.catalog_id,
        canonical.envelope.aliasRows,
        aliases.rows,
      );
      const before = findings.length;
      if (row.title !== target.title) {
        findings.push({
          findingId: findingId(sourceId, "title", "SET"),
          catalogImportId: row.catalogImportId,
          sourceId: row.sourceId,
          catalogId: row.catalogId,
          category: "CRITICAL_CHANGE",
          field: "title",
          protectionLevel: "LEVEL_B",
          persistenceDisposition: "SUPPORTED_NOW",
          operation: "SET",
          approvable: true,
          requiresFieldApproval: true,
          message: "The update changes the Catalog title",
        });
      }
      if (row.catalogKind !== target.kind) {
        findings.push({
          findingId: findingId(sourceId, "catalogKind", "SET"),
          catalogImportId: row.catalogImportId,
          sourceId: row.sourceId,
          catalogId: row.catalogId,
          category: "CRITICAL_CHANGE",
          field: "catalogKind",
          protectionLevel: "LEVEL_A",
          persistenceDisposition: "SUPPORTED_NOW",
          operation: "SET",
          approvable: true,
          requiresFieldApproval: true,
          message: "The update changes the Catalog kind",
        });
      }
      for (const field of fieldNames) {
        const incoming = row[field];
        const existing = existingField(target, field);
        if (
          incoming.state === "UNSUPPLIED" &&
          existing.state !== "UNSUPPLIED"
        ) {
          throw new Error(
            `P5 REMEDIATION — CONTRACT SEMANTICS OWNER REVIEW REQUIRED: catalog-import/v1 does not define whether UNSUPPLIED replaces an existing ${field} value for ${sourceId}`,
          );
        }
        if (sameField(incoming, existing)) continue;
        const isClear = incoming.state === "CLEAR";
        const level = field === "description" ? "LEVEL_C" : "LEVEL_B";
        findings.push({
          findingId: findingId(sourceId, field, isClear ? "CLEAR" : "SET"),
          catalogImportId: row.catalogImportId,
          sourceId: row.sourceId,
          catalogId: row.catalogId,
          category:
            level === "LEVEL_C" && !isClear
              ? "ORDINARY_CHANGE"
              : "CRITICAL_CHANGE",
          field,
          protectionLevel: level,
          persistenceDisposition: "SUPPORTED_NOW",
          operation: isClear ? "CLEAR" : "SET",
          approvable: true,
          requiresFieldApproval: isClear || level !== "LEVEL_C",
          message: isClear
            ? `The update destructively clears ${field}`
            : `The update changes ${field}`,
        });
      }
      for (const item of provenance) {
        const existing = sourceMap.get(String(item.sourceId));
        if (existing === undefined) continue;
        const incoming = canonicalProvenance(item);
        const pairs = [
          ["sourceTitle", incoming.sourceTitle, existing.source_title],
          ["sourceTypeRaw", incoming.sourceTypeRaw, existing.source_type_raw],
          ["sourceUrl", incoming.sourceUrl, existing.source_url],
          ["sourceNote", incoming.sourceNote, existing.source_note],
        ] as const;
        for (const [field, next, current] of pairs) {
          if (next === current) continue;
          findings.push({
            findingId: findingId(String(item.sourceId), field, "SET"),
            catalogImportId: row.catalogImportId,
            sourceId: item.sourceId,
            catalogId: row.catalogId,
            category: "CRITICAL_CHANGE",
            field,
            protectionLevel: "LEVEL_B",
            persistenceDisposition: "SUPPORTED_NOW",
            operation: "SET",
            approvable: true,
            requiresFieldApproval: true,
            message: `The update changes provenance ${field}`,
          });
        }
      }
      if (findings.length === before) unchanged += 1;
      else update += 1;
      continue;
    }

    const existingPrimary = sourceMap.get(sourceId);
    if (existingPrimary !== undefined) {
      unchanged += 1;
      continue;
    }
    const titleCatalogId = titleMap.get(row.title);
    if (titleCatalogId !== undefined) {
      conflict += 1;
      const candidateId = `duplicate-${textSha256(`${sourceId}\0${titleCatalogId}`).slice(0, 32)}`;
      duplicateCandidates.push(
        duplicateCandidateSchema.parse({
          candidateId,
          catalogImportIds: [row.catalogImportId, `existing-${titleCatalogId}`],
          signals: ["exact title match"],
          disposition: "UNRESOLVED",
        }),
      );
      findings.push({
        findingId: findingId(sourceId, "title", "duplicate"),
        catalogImportId: row.catalogImportId,
        sourceId: row.sourceId,
        category: "DUPLICATE_CANDIDATE",
        applyBlocker: "DUPLICATE_CANDIDATE_UNRESOLVED",
        approvable: false,
        requiresFieldApproval: false,
        message: "An existing Catalog entry has the same title",
      });
      continue;
    }
    for (const field of fieldNames) {
      if (row[field].state !== "CLEAR") continue;
      findings.push({
        findingId: findingId(sourceId, field, "CLEAR"),
        catalogImportId: row.catalogImportId,
        sourceId: row.sourceId,
        category: "CRITICAL_CHANGE",
        field,
        protectionLevel: field === "description" ? "LEVEL_C" : "LEVEL_B",
        persistenceDisposition: "SUPPORTED_NOW",
        operation: "CLEAR",
        approvable: true,
        requiresFieldApproval: true,
        message: `The create input explicitly requests destructive CLEAR semantics for ${field}`,
      });
    }
    add += 1;
  }

  const applyBlockers = [
    ...(findings.some(
      ({ applyBlocker }) => applyBlocker === "IDENTITY_CONFLICT",
    )
      ? (["IDENTITY_CONFLICT"] as const)
      : []),
    ...(duplicateCandidates.length > 0
      ? (["DUPLICATE_CANDIDATE_UNRESOLVED"] as const)
      : []),
    ...(findings.some(
      ({ applyBlocker }) => applyBlocker === "DEFERRED_FIELD_NOT_PRESERVED",
    )
      ? (["DEFERRED_FIELD_NOT_PRESERVED"] as const)
      : []),
  ];
  const withoutHashes = {
    importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
    canonicalInputSha256: sha256Schema.parse(canonical.canonicalInputSha256),
    state:
      applyBlockers.length === 0 ? ("PASSED" as const) : ("FAILED" as const),
    rowCounts: canonical.rowCounts,
    resultCounts: {
      add,
      update,
      unchanged,
      conflict,
      identityConflict: findings.filter(
        ({ category }) => category === "IDENTITY_CONFLICT",
      ).length,
      error,
      duplicateCandidate: duplicateCandidates.length,
    },
    findings,
    duplicateCandidates,
    applyBlockers,
    applyReady: applyBlockers.length === 0,
  };
  return catalogImportDryRunSchema.parse({
    ...withoutHashes,
    dryRunResultSha256: hashCatalogImportDryRun(withoutHashes),
    completedAt,
  });
};

const contributorsForImport = (
  envelope: CanonicalCatalogImportV2Envelope,
  importId: string,
) =>
  envelope.contributorRows
    .filter(({ catalogImportId }) => String(catalogImportId) === importId)
    .map(({ position, name, role }) => ({ position, name, role }))
    .sort((left, right) => left.position - right.position);

const existingContributorsForCatalog = (
  rows: readonly CatalogContributorRow[],
  catalogId: string,
) =>
  rows
    .filter((row) => row.catalog_id === catalogId)
    .map(({ position, name, role }) => ({ position, name, role }))
    .sort((left, right) => left.position - right.position);

const semanticCitationScopes = (
  scopes:
    | readonly (
        | "record"
        | "description"
        | "transcription"
        | "historicalContext"
        | "scholarlyResearch"
      )[]
    | undefined,
) => {
  if (scopes === undefined || (scopes.length === 1 && scopes[0] === "record")) {
    return ["record"] as const;
  }
  const order = new Map(
    CATALOG_IMPORT_CITATION_SCOPE_ORDER.map((scope, index) => [scope, index]),
  );
  return [...scopes].sort(
    (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
  );
};

const citationsForImport = (
  envelope: CanonicalCatalogImportV2Envelope,
  importId: string,
) =>
  envelope.publicCitationRows
    .filter(({ catalogImportId }) => String(catalogImportId) === importId)
    .map(({ position, label, citation, url, appliesTo }) => ({
      position,
      label,
      citation: citation ?? null,
      url: url ?? null,
      appliesTo: semanticCitationScopes(appliesTo),
    }))
    .sort((left, right) => left.position - right.position);

const existingCitationsForCatalog = (
  citations: readonly CatalogPublicCitationRow[],
  scopes: readonly CatalogCitationScopeRow[],
  catalogId: string,
) => {
  const scopesByPosition = new Map<
    number,
    CatalogCitationScopeRow["scope"][]
  >();
  for (const scope of scopes) {
    if (scope.catalog_id !== catalogId) continue;
    scopesByPosition.set(scope.citation_position, [
      ...(scopesByPosition.get(scope.citation_position) ?? []),
      scope.scope,
    ]);
  }
  return citations
    .filter((row) => row.catalog_id === catalogId)
    .map(({ position, label, citation, url }) => ({
      position,
      label,
      citation,
      url,
      appliesTo: semanticCitationScopes(scopesByPosition.get(position)),
    }))
    .sort((left, right) => left.position - right.position);
};

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const v2MutationFindingId = (
  sourceId: string,
  field: string,
  operation: "SET" | "CLEAR",
  existingSemanticState: unknown,
) =>
  dryRunFindingIdSchema.parse(
    `finding-${textSha256(
      `${sourceId}\0${field}\0${operation}\0${textSha256(
        stableJson(existingSemanticState),
      )}`,
    ).slice(0, 32)}`,
  );

const v2ExistingCatalogMemberReference = (
  catalogId: string,
  occupiedReferences: Set<string>,
) => {
  const candidates = [
    `existing-${catalogId}`,
    `existing-${textSha256(catalogId)}`,
  ];
  for (let collisionIndex = 0; ; collisionIndex += 1) {
    const candidate =
      candidates[collisionIndex] ??
      `existing-${textSha256(`${catalogId}\0${collisionIndex}`)}`;
    const parsed = catalogImportIdSchema.safeParse(candidate);
    if (!parsed.success || occupiedReferences.has(parsed.data)) continue;
    occupiedReferences.add(parsed.data);
    return parsed.data;
  }
};

const analyzeV2TitleDuplicates = (
  rows: CanonicalCatalogImportV2Envelope["catalogRows"],
  titleMatches: readonly CatalogIdentityRow[],
  allIncomingCatalogImportIds: readonly string[],
) => {
  const rowsByTitle = new Map<string, CanonicalV2Row[]>();
  for (const row of rows) {
    rowsByTitle.set(row.title, [...(rowsByTitle.get(row.title) ?? []), row]);
  }

  const existingCatalogIdsByTitle = new Map<string, string[]>();
  for (const match of titleMatches) {
    existingCatalogIdsByTitle.set(match.title, [
      ...(existingCatalogIdsByTitle.get(match.title) ?? []),
      match.catalog_id,
    ]);
  }

  const duplicateCatalogImportIds = new Set<string>();
  const occupiedCandidateMemberReferences = new Set(
    allIncomingCatalogImportIds,
  );
  const duplicateCandidates: CatalogImportV2DryRun["duplicateCandidates"] = [];
  for (const [title, titleRows] of [...rowsByTitle.entries()].sort(
    ([left], [right]) => compareText(left, right),
  )) {
    const incomingCatalogImportIds = titleRows
      .map(({ catalogImportId }) => String(catalogImportId))
      .sort(compareText);
    const representedTargetCatalogIds = new Set(
      titleRows.flatMap(({ catalogId }) =>
        catalogId === undefined ? [] : [String(catalogId)],
      ),
    );
    // A target represented in this title group is that update's own record.
    // Targets of peer updates moving elsewhere remain current-state matches.
    const existingCatalogIds = [
      ...new Set(existingCatalogIdsByTitle.get(title) ?? []),
    ]
      .filter((catalogId) => !representedTargetCatalogIds.has(catalogId))
      .sort(compareText);
    if (incomingCatalogImportIds.length + existingCatalogIds.length < 2) {
      continue;
    }

    for (const catalogImportId of incomingCatalogImportIds) {
      duplicateCatalogImportIds.add(catalogImportId);
    }
    const catalogImportIds = [
      ...incomingCatalogImportIds,
      ...existingCatalogIds.map((catalogId) =>
        v2ExistingCatalogMemberReference(
          catalogId,
          occupiedCandidateMemberReferences,
        ),
      ),
    ];
    duplicateCandidates.push(
      duplicateCandidateSchema.parse({
        candidateId: `duplicate-${textSha256(
          stableJson({
            title,
            incomingCatalogImportIds,
            existingCatalogIds,
          }),
        ).slice(0, 32)}`,
        catalogImportIds,
        signals: ["exact title match"],
        disposition: "UNRESOLVED",
      }),
    );
  }

  return { duplicateCandidates, duplicateCatalogImportIds };
};

const createCatalogImportV2DryRun = async (
  queryPort: QueryPort,
  parsed: ParsedCatalogImportV2Bundle,
  completedAt: string,
): Promise<CatalogImportV2DryRun> => {
  const canonical = canonicalizeParsedBundle(
    parsed,
  ) as ParsedCatalogImportV2Bundle;
  const sourceIds = canonical.envelope.provenanceRows.map(({ sourceId }) =>
    String(sourceId),
  );
  const catalogIds = canonical.envelope.catalogRows.flatMap(({ catalogId }) =>
    catalogId === undefined ? [] : [String(catalogId)],
  );
  const titles = canonical.envelope.catalogRows.map(({ title }) => title);
  const contributorIntentCatalogIds = canonical.envelope.catalogRows.flatMap(
    ({ catalogId, contributorsAction }) =>
      catalogId !== undefined && contributorsAction !== "PRESERVE"
        ? [String(catalogId)]
        : [],
  );
  const citationIntentCatalogIds = canonical.envelope.catalogRows.flatMap(
    ({ catalogId, publicCitationsAction }) =>
      catalogId !== undefined && publicCitationsAction !== "PRESERVE"
        ? [String(catalogId)]
        : [],
  );
  const sources = await queryPort.query<SourceMappingRow>(
    `SELECT source_id, catalog_id, source_title, source_type_raw, source_url, source_note
       FROM catalog_import_sources WHERE source_id = ANY($1::text[])`,
    [sourceIds],
  );
  const catalogs = await queryPort.query<CatalogV2IdentityRow>(
    `SELECT catalog_id, kind, title, dynasty, dynasty_state, date_text,
        date_text_state, province, province_state, prefecture, prefecture_state,
        county, county_state, current_location, current_location_state,
        current_custodian, current_custodian_state, description, description_state,
        script_style, script_style_state, transcription, transcription_state,
        historical_context, historical_context_state,
        scholarly_research, scholarly_research_state
       FROM catalog_entries WHERE catalog_id = ANY($1::text[])`,
    [catalogIds],
  );
  const titleMatches = await queryPort.query<CatalogIdentityRow>(
    "SELECT catalog_id, title FROM catalog_entries WHERE title = ANY($1::text[])",
    [titles],
  );
  const aliases = await queryPort.query<CatalogAliasRow>(
    "SELECT catalog_id, alias, alias_type FROM catalog_aliases WHERE catalog_id = ANY($1::text[]) ORDER BY catalog_id, position",
    [catalogIds],
  );
  const contributors =
    contributorIntentCatalogIds.length === 0
      ? { rows: [] as CatalogContributorRow[], rowCount: 0 }
      : await queryPort.query<CatalogContributorRow>(
          `SELECT catalog_id, position, name, role
             FROM catalog_contributors
            WHERE catalog_id = ANY($1::text[])
            ORDER BY catalog_id, position`,
          [contributorIntentCatalogIds],
        );
  const publicCitations =
    citationIntentCatalogIds.length === 0
      ? { rows: [] as CatalogPublicCitationRow[], rowCount: 0 }
      : await queryPort.query<CatalogPublicCitationRow>(
          `SELECT catalog_id, position, label, citation, url
             FROM catalog_source_citations
            WHERE catalog_id = ANY($1::text[])
            ORDER BY catalog_id, position`,
          [citationIntentCatalogIds],
        );
  const citationScopes =
    citationIntentCatalogIds.length === 0
      ? { rows: [] as CatalogCitationScopeRow[], rowCount: 0 }
      : await queryPort.query<CatalogCitationScopeRow>(
          `SELECT catalog_id, citation_position, scope
             FROM catalog_source_citation_scopes
            WHERE catalog_id = ANY($1::text[])
            ORDER BY catalog_id, citation_position, scope`,
          [citationIntentCatalogIds],
        );

  const sourceMap = new Map(sources.rows.map((row) => [row.source_id, row]));
  const catalogMap = new Map(catalogs.rows.map((row) => [row.catalog_id, row]));
  const duplicateEligibleRows = canonical.envelope.catalogRows.filter((row) => {
    const sourceId = String(row.sourceId);
    const targetId =
      row.catalogId === undefined ? undefined : String(row.catalogId);
    const provenance = canonical.envelope.provenanceRows.filter(
      ({ catalogImportId }) =>
        String(catalogImportId) === String(row.catalogImportId),
    );
    if (
      !provenance.some(
        ({ sourceId: candidate }) => String(candidate) === sourceId,
      )
    ) {
      return false;
    }
    if (
      provenance.some((item) => {
        const existing = sourceMap.get(String(item.sourceId));
        return existing !== undefined && targetId !== existing.catalog_id;
      })
    ) {
      return false;
    }
    if (targetId !== undefined && !catalogMap.has(targetId)) return false;
    return ownerNotePersistenceFinding(row) === undefined;
  });
  const { duplicateCandidates, duplicateCatalogImportIds } =
    analyzeV2TitleDuplicates(
      duplicateEligibleRows,
      titleMatches.rows,
      canonical.envelope.catalogRows.map(({ catalogImportId }) =>
        String(catalogImportId),
      ),
    );
  const findings: CatalogImportV2DryRun["findings"] = [];
  let add = 0;
  let update = 0;
  let unchanged = 0;
  let conflict = 0;
  let error = 0;

  for (const row of canonical.envelope.catalogRows) {
    const sourceId = String(row.sourceId);
    const importId = String(row.catalogImportId);
    const hasTitleDuplicate = duplicateCatalogImportIds.has(importId);
    const targetId =
      row.catalogId === undefined ? undefined : String(row.catalogId);
    const provenance = canonical.envelope.provenanceRows.filter(
      ({ catalogImportId }) => String(catalogImportId) === importId,
    );
    const primary = provenance.find(
      ({ sourceId: candidate }) => String(candidate) === sourceId,
    );
    if (primary === undefined) {
      conflict += 1;
      findings.push({
        findingId: findingId(sourceId, "sourceId", "missing-provenance"),
        catalogImportId: row.catalogImportId,
        sourceId: row.sourceId,
        category: "IDENTITY_CONFLICT",
        field: "sourceId",
        identityConflictReason: "SOURCE_CATALOG_ASSOCIATION_CONFLICT",
        applyBlocker: "IDENTITY_CONFLICT",
        approvable: false,
        requiresFieldApproval: false,
        message: "Primary SourceId provenance is missing",
      });
      continue;
    }
    const rebound = provenance.find((item) => {
      const existing = sourceMap.get(String(item.sourceId));
      return existing !== undefined && targetId !== existing.catalog_id;
    });
    if (rebound !== undefined) {
      conflict += 1;
      findings.push({
        findingId: findingId(String(rebound.sourceId), "sourceId", "rebound"),
        catalogImportId: row.catalogImportId,
        sourceId: rebound.sourceId,
        ...(row.catalogId === undefined ? {} : { catalogId: row.catalogId }),
        category: "IDENTITY_CONFLICT",
        field: "sourceId",
        identityConflictReason: "SOURCE_ID_REBOUND",
        applyBlocker: "IDENTITY_CONFLICT",
        approvable: false,
        requiresFieldApproval: false,
        message: "SourceId is already bound to another CatalogId",
      });
      continue;
    }

    const target =
      targetId === undefined ? undefined : catalogMap.get(targetId);
    if (targetId !== undefined && target === undefined) {
      conflict += 1;
      findings.push({
        findingId: findingId(sourceId, "catalogId", "not-found"),
        catalogImportId: row.catalogImportId,
        sourceId: row.sourceId,
        catalogId: row.catalogId,
        category: "IDENTITY_CONFLICT",
        field: "catalogId",
        identityConflictReason: "CATALOG_ID_NOT_FOUND",
        applyBlocker: "IDENTITY_CONFLICT",
        approvable: false,
        requiresFieldApproval: false,
        message: "The supplied CatalogId update target does not exist",
      });
      continue;
    }

    const ownerNoteFinding = ownerNotePersistenceFinding(row);
    if (ownerNoteFinding !== undefined) {
      error += 1;
      findings.push(ownerNoteFinding);
      continue;
    }

    if (hasTitleDuplicate) {
      findings.push({
        findingId: findingId(sourceId, "title", "duplicate"),
        catalogImportId: row.catalogImportId,
        sourceId: row.sourceId,
        ...(row.catalogId === undefined ? {} : { catalogId: row.catalogId }),
        category: "DUPLICATE_CANDIDATE",
        field: "title",
        applyBlocker: "DUPLICATE_CANDIDATE_UNRESOLVED",
        approvable: false,
        requiresFieldApproval: false,
        message: "An existing or incoming Catalog entry has the same title",
      });
    }

    if (target !== undefined) {
      assertDefinedAliasUpdate(
        importId,
        target.catalog_id,
        canonical.envelope.aliasRows,
        aliases.rows,
      );
      const before = findings.length;
      if (row.title !== target.title) {
        findings.push({
          findingId: v2MutationFindingId(
            sourceId,
            "title",
            "SET",
            target.title,
          ),
          catalogImportId: row.catalogImportId,
          sourceId: row.sourceId,
          catalogId: row.catalogId,
          category: "CRITICAL_CHANGE",
          field: "title",
          protectionLevel: "LEVEL_B",
          persistenceDisposition: "SUPPORTED_NOW",
          operation: "SET",
          approvable: true,
          requiresFieldApproval: true,
          message: "The update changes the Catalog title",
        });
      }
      if (row.catalogKind !== target.kind) {
        findings.push({
          findingId: v2MutationFindingId(
            sourceId,
            "catalogKind",
            "SET",
            target.kind,
          ),
          catalogImportId: row.catalogImportId,
          sourceId: row.sourceId,
          catalogId: row.catalogId,
          category: "CRITICAL_CHANGE",
          field: "catalogKind",
          protectionLevel: "LEVEL_A",
          persistenceDisposition: "SUPPORTED_NOW",
          operation: "SET",
          approvable: true,
          requiresFieldApproval: true,
          message: "The update changes the Catalog kind",
        });
      }
      for (const field of v2FieldNames) {
        const incoming = row[field] as CanonicalV2Field;
        if (incoming.state === "UNSUPPLIED") continue;
        const existing = existingV2Field(target, field);
        if (sameField(incoming, existing)) continue;
        const isClear = incoming.state === "CLEAR";
        const level = v2FieldProtection(field);
        findings.push({
          findingId: v2MutationFindingId(
            sourceId,
            field,
            isClear ? "CLEAR" : "SET",
            existing,
          ),
          catalogImportId: row.catalogImportId,
          sourceId: row.sourceId,
          catalogId: row.catalogId,
          category:
            level === "LEVEL_C" && !isClear
              ? "ORDINARY_CHANGE"
              : "CRITICAL_CHANGE",
          field,
          protectionLevel: level,
          persistenceDisposition: "SUPPORTED_NOW",
          operation: isClear ? "CLEAR" : "SET",
          approvable: true,
          requiresFieldApproval: isClear || level !== "LEVEL_C",
          message: isClear
            ? `The update destructively clears ${field}`
            : `The update changes ${field}`,
        });
      }
      for (const item of provenance) {
        const existing = sourceMap.get(String(item.sourceId));
        if (existing === undefined) {
          findings.push({
            findingId: v2MutationFindingId(
              String(item.sourceId),
              "provenance",
              "SET",
              { exists: false },
            ),
            catalogImportId: row.catalogImportId,
            sourceId: item.sourceId,
            catalogId: row.catalogId,
            category: "CRITICAL_CHANGE",
            protectionLevel: "LEVEL_B",
            persistenceDisposition: "SUPPORTED_NOW",
            operation: "SET",
            approvable: true,
            requiresFieldApproval: true,
            message: "The update creates a provenance source mapping",
          });
          continue;
        }
        const incoming = canonicalProvenance(item);
        const pairs = [
          ["sourceTitle", incoming.sourceTitle, existing.source_title],
          ["sourceTypeRaw", incoming.sourceTypeRaw, existing.source_type_raw],
          ["sourceUrl", incoming.sourceUrl, existing.source_url],
          ["sourceNote", incoming.sourceNote, existing.source_note],
        ] as const;
        for (const [field, next, current] of pairs) {
          if (next === current) continue;
          findings.push({
            findingId: v2MutationFindingId(
              String(item.sourceId),
              field,
              "SET",
              current,
            ),
            catalogImportId: row.catalogImportId,
            sourceId: item.sourceId,
            catalogId: row.catalogId,
            category: "CRITICAL_CHANGE",
            field,
            protectionLevel: "LEVEL_B",
            persistenceDisposition: "SUPPORTED_NOW",
            operation: "SET",
            approvable: true,
            requiresFieldApproval: true,
            message: `The update changes provenance ${field}`,
          });
        }
      }

      if (row.contributorsAction !== "PRESERVE") {
        const incoming = contributorsForImport(canonical.envelope, importId);
        const existing = existingContributorsForCatalog(
          contributors.rows,
          target.catalog_id,
        );
        const changed =
          row.contributorsAction === "CLEAR"
            ? existing.length > 0
            : stableJson(incoming) !== stableJson(existing);
        if (changed) {
          findings.push({
            findingId: v2MutationFindingId(
              sourceId,
              "contributors",
              row.contributorsAction === "CLEAR" ? "CLEAR" : "SET",
              existing,
            ),
            catalogImportId: row.catalogImportId,
            sourceId: row.sourceId,
            catalogId: row.catalogId,
            category: "CRITICAL_CHANGE",
            field: "contributors",
            protectionLevel: "LEVEL_B",
            persistenceDisposition: "SUPPORTED_NOW",
            operation: row.contributorsAction === "CLEAR" ? "CLEAR" : "SET",
            approvable: true,
            requiresFieldApproval: true,
            message: `The update changes the contributor collection (${existing.length} existing, ${incoming.length} incoming)`,
          });
        }
      }
      if (row.publicCitationsAction !== "PRESERVE") {
        const incoming = citationsForImport(canonical.envelope, importId);
        const existing = existingCitationsForCatalog(
          publicCitations.rows,
          citationScopes.rows,
          target.catalog_id,
        );
        const changed =
          row.publicCitationsAction === "CLEAR"
            ? existing.length > 0
            : stableJson(incoming) !== stableJson(existing);
        if (changed) {
          findings.push({
            findingId: v2MutationFindingId(
              sourceId,
              "publicCitations",
              row.publicCitationsAction === "CLEAR" ? "CLEAR" : "SET",
              existing,
            ),
            catalogImportId: row.catalogImportId,
            sourceId: row.sourceId,
            catalogId: row.catalogId,
            category: "CRITICAL_CHANGE",
            field: "publicCitations",
            protectionLevel: "LEVEL_B",
            persistenceDisposition: "SUPPORTED_NOW",
            operation: row.publicCitationsAction === "CLEAR" ? "CLEAR" : "SET",
            approvable: true,
            requiresFieldApproval: true,
            message: `The update changes the public citation collection (${existing.length} existing, ${incoming.length} incoming)`,
          });
        }
      }

      if (hasTitleDuplicate) conflict += 1;
      else if (findings.length === before) unchanged += 1;
      else update += 1;
      continue;
    }

    if (hasTitleDuplicate) {
      conflict += 1;
      continue;
    }
    const existingPrimary = sourceMap.get(sourceId);
    if (existingPrimary !== undefined) {
      unchanged += 1;
      continue;
    }
    add += 1;
  }

  const applyBlockers = [
    ...(findings.some(
      ({ applyBlocker }) => applyBlocker === "IDENTITY_CONFLICT",
    )
      ? (["IDENTITY_CONFLICT"] as const)
      : []),
    ...(duplicateCandidates.length > 0
      ? (["DUPLICATE_CANDIDATE_UNRESOLVED"] as const)
      : []),
    ...(findings.some(
      ({ applyBlocker }) => applyBlocker === "DEFERRED_FIELD_NOT_PRESERVED",
    )
      ? (["DEFERRED_FIELD_NOT_PRESERVED"] as const)
      : []),
  ];
  const withoutHashes = {
    importContractVersion: CATALOG_IMPORT_V2_CONTRACT_VERSION,
    canonicalInputSha256: sha256Schema.parse(canonical.canonicalInputSha256),
    state:
      applyBlockers.length === 0 ? ("PASSED" as const) : ("FAILED" as const),
    rowCounts: canonical.rowCounts,
    resultCounts: {
      add,
      update,
      unchanged,
      conflict,
      identityConflict: findings.filter(
        ({ category }) => category === "IDENTITY_CONFLICT",
      ).length,
      error,
      duplicateCandidate: duplicateCandidates.length,
    },
    findings,
    duplicateCandidates,
    applyBlockers,
    applyReady: applyBlockers.length === 0,
  };
  return catalogImportV2DryRunSchema.parse({
    ...withoutHashes,
    dryRunResultSha256: hashCatalogImportDryRun(withoutHashes),
    completedAt,
  });
};

export function createCatalogImportDryRun(
  queryPort: QueryPort,
  parsed: ParsedCatalogImportV1Bundle,
  completedAt: string,
): Promise<CatalogImportDryRun>;
export function createCatalogImportDryRun(
  queryPort: QueryPort,
  parsed: ParsedCatalogImportV2Bundle,
  completedAt: string,
): Promise<CatalogImportV2DryRun>;
export function createCatalogImportDryRun(
  queryPort: QueryPort,
  parsed: ParsedCatalogImportBundle,
  completedAt: string,
): Promise<VersionedCatalogImportDryRun>;
export async function createCatalogImportDryRun(
  queryPort: QueryPort,
  parsed: ParsedCatalogImportBundle,
  completedAt: string,
): Promise<VersionedCatalogImportDryRun> {
  return parsed.envelope.importContractVersion ===
    CATALOG_IMPORT_CONTRACT_VERSION
    ? createCatalogImportV1DryRun(
        queryPort,
        parsed as ParsedCatalogImportV1Bundle,
        completedAt,
      )
    : createCatalogImportV2DryRun(
        queryPort,
        parsed as ParsedCatalogImportV2Bundle,
        completedAt,
      );
}

export interface CatalogIdAllocator {
  allocateCatalogId(input: {
    readonly catalogImportId: string;
  }): Promise<string> | string;
}

export type CatalogImportAuthorization =
  | {
      readonly runtime: "VALIDATION";
      readonly purpose: "VALIDATION_ONLY";
      readonly nonProduction: true;
      readonly disposableDatabase: true;
      readonly publicationApproval: false;
      readonly reusableForProduction: false;
      readonly ownerInstructionReference: string;
      readonly approval: VersionedImportApproval;
    }
  | {
      readonly runtime: "PRODUCTION";
      readonly purpose: "PRODUCTION_IMPORT";
      readonly publicationApproval: false;
      readonly approval: VersionedImportApproval;
    };

export interface CatalogImportApplicationResult {
  readonly status: "APPLIED" | "ALREADY_APPLIED";
  readonly operationId: string;
  readonly canonicalInputSha256: string;
  readonly dryRunResultSha256: string;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly catalogIdMap: readonly {
    readonly catalogImportId: string;
    readonly sourceId: string;
    readonly catalogId: string;
  }[];
  readonly appliedAt: string;
}

const loadExistingResult = async (
  client: PoolClient,
  operationId: string,
  importContractVersion: string,
  canonicalInputSha256: string,
  dryRunResultSha256: string,
  approvalSha256: string,
): Promise<CatalogImportApplicationResult | undefined> => {
  const result = await client.query<
    QueryResultRow & {
      import_contract_version: string;
      canonical_input_sha256: string;
      dry_run_result_sha256: string;
      approval_sha256: string;
      status: string;
      result_json: CatalogImportApplicationResult | null;
    }
  >(
    `SELECT import_contract_version, canonical_input_sha256, dry_run_result_sha256, approval_sha256, status, result_json
     FROM catalog_import_operations WHERE operation_id = $1`,
    [operationId],
  );
  const existing = result.rows[0];
  if (existing === undefined) return undefined;
  if (
    existing.import_contract_version !== importContractVersion ||
    existing.canonical_input_sha256 !== canonicalInputSha256 ||
    existing.dry_run_result_sha256 !== dryRunResultSha256 ||
    existing.approval_sha256 !== approvalSha256
  )
    throw new Error(
      "Import operation identity was reused with different hashes",
    );
  if (existing.status !== "APPLIED" || existing.result_json === null) {
    throw new Error("Conflicting incomplete import operation exists");
  }
  return { ...existing.result_json, status: "ALREADY_APPLIED" };
};

const assertAuthorization = (
  authorization: CatalogImportAuthorization,
  dryRun: VersionedCatalogImportDryRun,
  canonicalInputSha256: string,
) => {
  const approval = versionedImportApprovalSchema.parse(authorization.approval);
  if (
    approval.importContractVersion !== dryRun.importContractVersion ||
    approval.state !== "APPROVED" ||
    approval.canonicalInputSha256 !== canonicalInputSha256 ||
    approval.dryRunResultSha256 !== dryRun.dryRunResultSha256
  )
    throw new Error("Import approval does not bind the recomputed dry-run");
  if (
    authorization.runtime === "VALIDATION" &&
    (authorization.purpose !== "VALIDATION_ONLY" ||
      !authorization.nonProduction ||
      !authorization.disposableDatabase ||
      authorization.publicationApproval ||
      authorization.reusableForProduction ||
      dryRun.findings.length !== 0)
  )
    throw new Error(
      "Validation-only apply requires an exactly clean disposable non-production authorization",
    );
  if (
    authorization.runtime === "PRODUCTION" &&
    authorization.purpose !== "PRODUCTION_IMPORT"
  ) {
    throw new Error(
      "Validation-only authorization is not accepted by production runtime",
    );
  }
  const findings = new Map(
    dryRun.findings.map((finding) => [String(finding.findingId), finding]),
  );
  const approved = new Set(approval.approvedFindingIds.map(String));
  for (const id of approved) {
    if (findings.get(id)?.approvable !== true)
      throw new Error(
        "Approval references an unknown or non-approvable finding",
      );
  }
  for (const finding of dryRun.findings) {
    if (
      finding.requiresFieldApproval &&
      !approved.has(String(finding.findingId))
    ) {
      throw new Error("A required field-level finding was not approved");
    }
  }
  return approval;
};

const insertProvenance = async (
  client: PoolClient,
  catalogId: string,
  item: CanonicalCatalogImportEnvelope["provenanceRows"][number],
) => {
  const values = canonicalProvenance(item);
  await client.query(
    `INSERT INTO catalog_import_sources(
       source_id, catalog_id, source_title, source_type_raw, source_url, source_note
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_id) DO UPDATE SET
       source_title = EXCLUDED.source_title, source_type_raw = EXCLUDED.source_type_raw,
       source_url = EXCLUDED.source_url, source_note = EXCLUDED.source_note
     WHERE catalog_import_sources.catalog_id = EXCLUDED.catalog_id`,
    [
      item.sourceId,
      catalogId,
      values.sourceTitle,
      values.sourceTypeRaw,
      values.sourceUrl,
      values.sourceNote,
    ],
  );
};

export const applyCatalogImport = async (
  pool: Pool,
  input: {
    readonly operationId: string;
    readonly parsed: ParsedCatalogImportBundle;
    readonly dryRun: VersionedCatalogImportDryRun;
    readonly authorization: CatalogImportAuthorization;
    readonly catalogIdAllocator?: CatalogIdAllocator | undefined;
    readonly appliedAt: string;
    readonly failureAfterCatalogRows?: number;
  },
): Promise<CatalogImportApplicationResult> => {
  const suppliedDryRun = versionedCatalogImportDryRunSchema.parse(input.dryRun);
  const canonical = canonicalizeParsedBundle(input.parsed);
  const importContractVersion = canonical.envelope.importContractVersion;
  const suppliedApproval = versionedImportApprovalSchema.parse(
    input.authorization.approval,
  );
  if (
    suppliedDryRun.importContractVersion !== importContractVersion ||
    suppliedApproval.importContractVersion !== importContractVersion
  ) {
    throw new Error(
      "Parsed input, dry-run, approval, and apply versions must match",
    );
  }
  const {
    dryRunResultSha256: suppliedDryRunHash,
    completedAt: _suppliedCompletedAt,
    ...suppliedDryRunBody
  } = suppliedDryRun;
  void _suppliedCompletedAt;
  if (hashCatalogImportDryRun(suppliedDryRunBody) !== suppliedDryRunHash) {
    throw new Error("Supplied dry-run result hash is invalid");
  }
  if (
    suppliedApproval.canonicalInputSha256 !== canonical.canonicalInputSha256 ||
    suppliedApproval.dryRunResultSha256 !== suppliedDryRunHash
  ) {
    throw new Error(
      "Import approval does not bind the supplied canonical input and dry-run",
    );
  }
  const approvalSha256 = hashApproval(suppliedApproval);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const replay = await loadExistingResult(
      client,
      input.operationId,
      importContractVersion,
      canonical.canonicalInputSha256,
      String(suppliedDryRunHash),
      approvalSha256,
    );
    if (replay !== undefined) {
      await client.query("COMMIT");
      return replay;
    }
    const recomputedDryRun = await createCatalogImportDryRun(
      client as unknown as QueryPort,
      canonical,
      suppliedDryRun.completedAt,
    );
    if (
      recomputedDryRun.dryRunResultSha256 !==
        suppliedDryRun.dryRunResultSha256 ||
      stableJson({ ...recomputedDryRun, completedAt: undefined }) !==
        stableJson({ ...suppliedDryRun, completedAt: undefined })
    )
      throw new Error(
        "Supplied dry-run does not match the transactionally recomputed plan",
      );
    if (
      !recomputedDryRun.applyReady ||
      recomputedDryRun.state !== "PASSED" ||
      recomputedDryRun.applyBlockers.length > 0
    ) {
      throw new Error("Import dry-run is not apply-ready");
    }
    const approval = assertAuthorization(
      input.authorization,
      recomputedDryRun,
      canonical.canonicalInputSha256,
    );
    const creates = canonical.envelope.catalogRows.filter(
      ({ catalogId }) => catalogId === undefined,
    );
    if (creates.length > 0 && input.catalogIdAllocator === undefined) {
      throw new Error(
        "CREATE requires an explicitly supplied platform CatalogIdAllocator",
      );
    }
    const recomputedApprovalSha256 = hashApproval(approval);
    if (recomputedApprovalSha256 !== approvalSha256) {
      throw new Error("Authorization approval changed during validation");
    }
    await client.query(
      `INSERT INTO catalog_import_operations(
         operation_id, import_contract_version, canonical_input_sha256,
         dry_run_result_sha256, approval_sha256, validation_context,
         status, result_json, created_at, applied_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'APPLYING', NULL, $7, NULL)`,
      [
        input.operationId,
        importContractVersion,
        canonical.canonicalInputSha256,
        recomputedDryRun.dryRunResultSha256,
        approvalSha256,
        JSON.stringify({ ...input.authorization, approval: undefined }),
        input.appliedAt,
      ],
    );

    const aliasesByImport = new Map<
      string,
      CanonicalCatalogImportEnvelope["aliasRows"]
    >();
    for (const alias of canonical.envelope.aliasRows) {
      const key = String(alias.catalogImportId);
      aliasesByImport.set(key, [...(aliasesByImport.get(key) ?? []), alias]);
    }
    const provenanceByImport = new Map<
      string,
      CanonicalCatalogImportEnvelope["provenanceRows"]
    >();
    for (const provenance of canonical.envelope.provenanceRows) {
      const key = String(provenance.catalogImportId);
      provenanceByImport.set(key, [
        ...(provenanceByImport.get(key) ?? []),
        provenance,
      ]);
    }
    const catalogIdMap: CatalogImportApplicationResult["catalogIdMap"][number][] =
      [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const isV2 = importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION;
    const v2Envelope = isV2
      ? (canonical.envelope as CanonicalCatalogImportV2Envelope)
      : undefined;
    for (const [
      index,
      versionedRow,
    ] of canonical.envelope.catalogRows.entries()) {
      const row = versionedRow as CanonicalRow;
      const v2Row = isV2 ? (versionedRow as CanonicalV2Row) : undefined;
      const importId = String(row.catalogImportId);
      const isCreate = row.catalogId === undefined;
      const catalogId = isCreate
        ? await input.catalogIdAllocator!.allocateCatalogId({
            catalogImportId: importId,
          })
        : String(row.catalogId);
      if (isCreate) {
        if (v2Row === undefined) {
          await client.query(
            `INSERT INTO catalog_entries(
             catalog_id, kind, title, summary, description, period_label,
             dynasty, dynasty_state, date_text, date_text_state,
             province, province_state, prefecture, prefecture_state,
             county, county_state, current_location, current_location_state,
             current_custodian, current_custodian_state, description_state
           ) VALUES ($1,$2,$3,NULL,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
            [
              catalogId,
              row.catalogKind,
              row.title,
              fieldValue(row.description),
              fieldValue(row.dynasty),
              row.dynasty.state,
              fieldValue(row.dateText),
              row.dateText.state,
              fieldValue(row.province),
              row.province.state,
              fieldValue(row.prefecture),
              row.prefecture.state,
              fieldValue(row.county),
              row.county.state,
              fieldValue(row.currentLocation),
              row.currentLocation.state,
              fieldValue(row.currentCustodian),
              row.currentCustodian.state,
              row.description.state,
            ],
          );
        } else {
          await client.query(
            `INSERT INTO catalog_entries(
               catalog_id, kind, title, summary, description, period_label,
               dynasty, dynasty_state, date_text, date_text_state,
               province, province_state, prefecture, prefecture_state,
               county, county_state, current_location, current_location_state,
               current_custodian, current_custodian_state, description_state,
               script_style, script_style_state, transcription, transcription_state,
               historical_context, historical_context_state,
               scholarly_research, scholarly_research_state
             ) VALUES (
               $1,$2,$3,NULL,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
             )`,
            [
              catalogId,
              v2Row.catalogKind,
              v2Row.title,
              fieldValue(v2Row.description),
              fieldValue(v2Row.dynasty),
              v2Row.dynasty.state,
              fieldValue(v2Row.dateText),
              v2Row.dateText.state,
              fieldValue(v2Row.province),
              v2Row.province.state,
              fieldValue(v2Row.prefecture),
              v2Row.prefecture.state,
              fieldValue(v2Row.county),
              v2Row.county.state,
              fieldValue(v2Row.currentLocation),
              v2Row.currentLocation.state,
              fieldValue(v2Row.currentCustodian),
              v2Row.currentCustodian.state,
              v2Row.description.state,
              fieldValue(v2Row.scriptStyle),
              v2Row.scriptStyle.state,
              fieldValue(v2Row.transcription),
              v2Row.transcription.state,
              fieldValue(v2Row.historicalContext),
              v2Row.historicalContext.state,
              fieldValue(v2Row.scholarlyResearch),
              v2Row.scholarlyResearch.state,
            ],
          );
        }
        for (const [position, alias] of (
          aliasesByImport.get(importId) ?? []
        ).entries()) {
          await client.query(
            "INSERT INTO catalog_aliases(catalog_id, position, alias, alias_type) VALUES ($1,$2,$3,$4)",
            [catalogId, position, alias.alias, alias.aliasType],
          );
        }
        if (v2Row !== undefined && v2Envelope !== undefined) {
          if (v2Row.contributorsAction === "REPLACE") {
            for (const contributor of contributorsForImport(
              v2Envelope,
              importId,
            )) {
              await client.query(
                `INSERT INTO catalog_contributors(catalog_id, position, name, role)
                 VALUES ($1,$2,$3,$4)`,
                [
                  catalogId,
                  contributor.position,
                  contributor.name,
                  contributor.role,
                ],
              );
            }
          }
          if (v2Row.publicCitationsAction === "REPLACE") {
            const citations = v2Envelope.publicCitationRows
              .filter(
                ({ catalogImportId }) => String(catalogImportId) === importId,
              )
              .sort((left, right) => left.position - right.position);
            for (const citation of citations) {
              await client.query(
                `INSERT INTO catalog_source_citations(
                   catalog_id, position, label, citation, url
                 ) VALUES ($1,$2,$3,$4,$5)`,
                [
                  catalogId,
                  citation.position,
                  citation.label,
                  citation.citation ?? null,
                  citation.url ?? null,
                ],
              );
              for (const scope of citation.appliesTo ?? []) {
                await client.query(
                  `INSERT INTO catalog_source_citation_scopes(
                     catalog_id, citation_position, scope
                   ) VALUES ($1,$2,$3)`,
                  [catalogId, citation.position, scope],
                );
              }
            }
          }
        }
        created += 1;
      } else {
        const rowFindings = recomputedDryRun.findings.filter(
          ({ catalogImportId }) => String(catalogImportId) === importId,
        );
        const outcome = rowFindings.length > 0 ? "UPDATED" : "UNCHANGED";
        if (outcome === "UPDATED") {
          if (v2Row === undefined) {
            await client.query(
              `UPDATE catalog_entries SET kind=$2,title=$3,description=$4,
             dynasty=$5,dynasty_state=$6,date_text=$7,date_text_state=$8,
             province=$9,province_state=$10,prefecture=$11,prefecture_state=$12,
             county=$13,county_state=$14,current_location=$15,current_location_state=$16,
             current_custodian=$17,current_custodian_state=$18,description_state=$19
             WHERE catalog_id=$1`,
              [
                catalogId,
                row.catalogKind,
                row.title,
                fieldValue(row.description),
                fieldValue(row.dynasty),
                row.dynasty.state,
                fieldValue(row.dateText),
                row.dateText.state,
                fieldValue(row.province),
                row.province.state,
                fieldValue(row.prefecture),
                row.prefecture.state,
                fieldValue(row.county),
                row.county.state,
                fieldValue(row.currentLocation),
                row.currentLocation.state,
                fieldValue(row.currentCustodian),
                row.currentCustodian.state,
                row.description.state,
              ],
            );
          } else {
            const catalogMutationFields = new Set<string>([
              "title",
              "catalogKind",
              ...v2FieldNames,
            ]);
            if (
              rowFindings.some(
                ({ field }) =>
                  field !== undefined && catalogMutationFields.has(field),
              )
            ) {
              const changedFields = new Set(
                rowFindings.flatMap(({ field }) =>
                  field === undefined ? [] : [field],
                ),
              );
              const values: unknown[] = [catalogId];
              const assignments: string[] = [];
              if (changedFields.has("catalogKind")) {
                assignments.push(`kind=$${values.push(v2Row.catalogKind)}`);
              }
              if (changedFields.has("title")) {
                assignments.push(`title=$${values.push(v2Row.title)}`);
              }
              for (const field of v2FieldNames) {
                if (!changedFields.has(field)) continue;
                const column = v2DatabaseField[field];
                const incoming = v2Row[field] as CanonicalV2Field;
                const valueIndex = values.push(fieldValue(incoming));
                const stateIndex = values.push(incoming.state);
                assignments.push(
                  `${column}=$${valueIndex}`,
                  `${column}_state=$${stateIndex}`,
                );
              }
              await client.query(
                `UPDATE catalog_entries SET ${assignments.join(",")} WHERE catalog_id=$1`,
                values,
              );
            }
            if (v2Envelope === undefined) {
              throw new Error("Validated v2 envelope is unavailable");
            }
            if (rowFindings.some(({ field }) => field === "contributors")) {
              await client.query(
                "DELETE FROM catalog_contributors WHERE catalog_id=$1",
                [catalogId],
              );
              if (v2Row.contributorsAction === "REPLACE") {
                for (const contributor of contributorsForImport(
                  v2Envelope,
                  importId,
                )) {
                  await client.query(
                    `INSERT INTO catalog_contributors(catalog_id, position, name, role)
                     VALUES ($1,$2,$3,$4)`,
                    [
                      catalogId,
                      contributor.position,
                      contributor.name,
                      contributor.role,
                    ],
                  );
                }
              }
            }
            if (rowFindings.some(({ field }) => field === "publicCitations")) {
              await client.query(
                "DELETE FROM catalog_source_citations WHERE catalog_id=$1",
                [catalogId],
              );
              if (v2Row.publicCitationsAction === "REPLACE") {
                const citations = v2Envelope.publicCitationRows
                  .filter(
                    ({ catalogImportId }) =>
                      String(catalogImportId) === importId,
                  )
                  .sort((left, right) => left.position - right.position);
                for (const citation of citations) {
                  await client.query(
                    `INSERT INTO catalog_source_citations(
                       catalog_id, position, label, citation, url
                     ) VALUES ($1,$2,$3,$4,$5)`,
                    [
                      catalogId,
                      citation.position,
                      citation.label,
                      citation.citation ?? null,
                      citation.url ?? null,
                    ],
                  );
                  for (const scope of citation.appliesTo ?? []) {
                    await client.query(
                      `INSERT INTO catalog_source_citation_scopes(
                         catalog_id, citation_position, scope
                       ) VALUES ($1,$2,$3)`,
                      [catalogId, citation.position, scope],
                    );
                  }
                }
              }
            }
          }
          updated += 1;
        } else unchanged += 1;
      }
      const provenance = provenanceByImport.get(importId) ?? [];
      if (!provenance.some(({ sourceId }) => sourceId === row.sourceId)) {
        throw new Error("Primary SourceId provenance is missing or mismatched");
      }
      for (const item of provenance)
        await insertProvenance(client, catalogId, item);
      const itemResult = isCreate
        ? "CREATED"
        : recomputedDryRun.findings.some(
              ({ catalogImportId }) => String(catalogImportId) === importId,
            )
          ? "UPDATED"
          : "UNCHANGED";
      await client.query(
        `INSERT INTO catalog_import_operation_items(
           operation_id, catalog_import_id, source_id, catalog_id, result
         ) VALUES ($1,$2,$3,$4,$5)`,
        [
          input.operationId,
          row.catalogImportId,
          row.sourceId,
          catalogId,
          itemResult,
        ],
      );
      catalogIdMap.push({
        catalogImportId: importId,
        sourceId: String(row.sourceId),
        catalogId,
      });
      if (input.failureAfterCatalogRows === index + 1)
        throw new Error("Synthetic mid-transaction failure");
    }
    const result: CatalogImportApplicationResult = {
      status: "APPLIED",
      operationId: input.operationId,
      canonicalInputSha256: canonical.canonicalInputSha256,
      dryRunResultSha256: String(recomputedDryRun.dryRunResultSha256),
      created,
      updated,
      unchanged,
      catalogIdMap,
      appliedAt: input.appliedAt,
    };
    await client.query(
      `UPDATE catalog_import_operations SET status='APPLIED', result_json=$2::jsonb, applied_at=$3
       WHERE operation_id=$1`,
      [input.operationId, JSON.stringify(result), input.appliedAt],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* Preserve the original failure. */
    }
    throw error;
  } finally {
    client.release();
  }
};
