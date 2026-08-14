import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_CSV_SPEC,
  CATALOG_IMPORT_MANIFEST_HEADERS,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  canonicalCatalogImportEnvelopeSchema,
  canonicalizeAliasImportTableRow,
  canonicalizeCatalogImportTableRow,
  canonicalizeProvenanceImportTableRow,
  catalogImportDryRunSchema,
  dryRunFindingIdSchema,
  duplicateCandidateSchema,
  importApprovalSchema,
  parseCatalogImportManifestTableRow,
  serializeCanonicalCatalogImportEnvelope,
  sha256Schema,
} from "@moya/contracts/internal/catalog-import";
import type {
  CanonicalCatalogImportEnvelope,
  CatalogImportDryRun,
  ImportApproval,
} from "@moya/contracts/internal/catalog-import";
import type { Pool, PoolClient, QueryResultRow } from "pg";

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

export const hashApproval = (approval: ImportApproval): string =>
  textSha256(stableJson(importApprovalSchema.parse(approval)));

const parseCsv = (input: string): string[][] => {
  const text = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }
    if (
      afterQuote &&
      character !== "," &&
      character !== "\n" &&
      character !== "\r"
    ) {
      throw new Error("Unexpected character after a quoted CSV field");
    }
    if (character === '"') {
      if (cell !== "" || afterQuote) throw new Error("Malformed CSV quote");
      quoted = true;
      continue;
    }
    if (character === ",") {
      row.push(cell);
      cell = "";
      afterQuote = false;
      continue;
    }
    if (character === "\r") {
      if (text[index + 1] !== "\n") throw new Error("Bare CR is not valid CSV");
      index += 1;
    }
    if (character === "\n" || character === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      afterQuote = false;
      continue;
    }
    cell += character;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

const tableObjects = (
  input: string,
  expectedHeaders: readonly string[],
  filename: string,
): Record<string, string>[] => {
  const rows = parseCsv(input);
  const headers = rows[0];
  if (headers === undefined) throw new Error(`${filename} is empty`);
  if (new Set(headers).size !== headers.length) {
    throw new Error(`${filename} contains duplicate headers`);
  }
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index])
  ) {
    throw new Error(`${filename} headers do not match catalog-import/v1`);
  }
  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(
        `${filename} row ${rowIndex + 2} has the wrong cell count`,
      );
    }
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });
};

export interface ParsedCatalogImportBundle {
  readonly envelope: CanonicalCatalogImportEnvelope;
  readonly canonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly rowCounts: {
    readonly catalog: number;
    readonly aliases: number;
    readonly provenance: number;
  };
}

export const parseCatalogImportCsvBundle = async (
  directory: string,
): Promise<ParsedCatalogImportBundle> => {
  const [manifestFilename, catalogFilename, aliasFilename, provenanceFilename] =
    Object.keys(CATALOG_IMPORT_CSV_SPEC.files);
  if (
    manifestFilename === undefined ||
    catalogFilename === undefined ||
    aliasFilename === undefined ||
    provenanceFilename === undefined
  ) {
    throw new Error("catalog-import/v1 CSV specification is incomplete");
  }
  const [manifestText, catalogText, aliasText, provenanceText] =
    await Promise.all([
      readFile(join(directory, manifestFilename), "utf8"),
      readFile(join(directory, catalogFilename), "utf8"),
      readFile(join(directory, aliasFilename), "utf8"),
      readFile(join(directory, provenanceFilename), "utf8"),
    ]);
  const manifest = tableObjects(
    manifestText,
    CATALOG_IMPORT_MANIFEST_HEADERS,
    manifestFilename,
  );
  if (manifest.length !== 1)
    throw new Error(`${manifestFilename} requires one row`);
  parseCatalogImportManifestTableRow(manifest[0]);
  const catalogRows = tableObjects(
    catalogText,
    CATALOG_IMPORT_CATALOG_HEADERS,
    catalogFilename,
  ).map(canonicalizeCatalogImportTableRow);
  const aliasRows = tableObjects(
    aliasText,
    CATALOG_IMPORT_ALIAS_HEADERS,
    aliasFilename,
  ).map(canonicalizeAliasImportTableRow);
  const provenanceRows = tableObjects(
    provenanceText,
    CATALOG_IMPORT_PROVENANCE_HEADERS,
    provenanceFilename,
  ).map(canonicalizeProvenanceImportTableRow);
  const envelope = canonicalCatalogImportEnvelopeSchema.parse({
    importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
    catalogRows,
    aliasRows,
    provenanceRows,
  });
  const canonicalJson = serializeCanonicalCatalogImportEnvelope(envelope);
  return {
    envelope,
    canonicalJson,
    canonicalInputSha256: textSha256(canonicalJson),
    rowCounts: {
      catalog: catalogRows.length,
      aliases: aliasRows.length,
      provenance: provenanceRows.length,
    },
  };
};

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

interface CatalogAliasRow extends QueryResultRow {
  readonly catalog_id: string;
  readonly alias: string;
  readonly alias_type: "alternate" | "historical";
}

export const hashCatalogImportDryRun = (
  input: Omit<CatalogImportDryRun, "dryRunResultSha256" | "completedAt">,
) => textSha256(stableJson(input));

const canonicalizeParsedBundle = (
  parsed: ParsedCatalogImportBundle,
): ParsedCatalogImportBundle => {
  const envelope = canonicalCatalogImportEnvelopeSchema.parse(parsed.envelope);
  const canonicalJson = serializeCanonicalCatalogImportEnvelope(envelope);
  const canonicalInputSha256 = textSha256(canonicalJson);
  const rowCounts = {
    catalog: envelope.catalogRows.length,
    aliases: envelope.aliasRows.length,
    provenance: envelope.provenanceRows.length,
  };
  if (
    parsed.canonicalJson !== canonicalJson ||
    parsed.canonicalInputSha256 !== canonicalInputSha256 ||
    stableJson(parsed.rowCounts) !== stableJson(rowCounts)
  ) {
    throw new Error(
      "Parsed import bundle metadata does not match its envelope",
    );
  }
  return { envelope, canonicalJson, canonicalInputSha256, rowCounts };
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

const fieldValue = (field: {
  readonly state: string;
  readonly value?: string;
}) => (field.state === "VALUE" ? field.value : null);

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

export const createCatalogImportDryRun = async (
  queryPort: QueryPort,
  parsed: ParsedCatalogImportBundle,
  completedAt: string,
): Promise<CatalogImportDryRun> => {
  const canonical = canonicalizeParsedBundle(parsed);
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
      readonly approval: ImportApproval;
    }
  | {
      readonly runtime: "PRODUCTION";
      readonly purpose: "PRODUCTION_IMPORT";
      readonly publicationApproval: false;
      readonly approval: ImportApproval;
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
  canonicalInputSha256: string,
  dryRunResultSha256: string,
  approvalSha256: string,
): Promise<CatalogImportApplicationResult | undefined> => {
  const result = await client.query<
    QueryResultRow & {
      canonical_input_sha256: string;
      dry_run_result_sha256: string;
      approval_sha256: string;
      status: string;
      result_json: CatalogImportApplicationResult | null;
    }
  >(
    `SELECT canonical_input_sha256, dry_run_result_sha256, approval_sha256, status, result_json
     FROM catalog_import_operations WHERE operation_id = $1`,
    [operationId],
  );
  const existing = result.rows[0];
  if (existing === undefined) return undefined;
  if (
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
  dryRun: CatalogImportDryRun,
  canonicalInputSha256: string,
) => {
  const approval = importApprovalSchema.parse(authorization.approval);
  if (
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
    readonly dryRun: CatalogImportDryRun;
    readonly authorization: CatalogImportAuthorization;
    readonly catalogIdAllocator?: CatalogIdAllocator | undefined;
    readonly appliedAt: string;
    readonly failureAfterCatalogRows?: number;
  },
): Promise<CatalogImportApplicationResult> => {
  const suppliedDryRun = catalogImportDryRunSchema.parse(input.dryRun);
  const canonical = canonicalizeParsedBundle(input.parsed);
  const {
    dryRunResultSha256: suppliedDryRunHash,
    completedAt: _suppliedCompletedAt,
    ...suppliedDryRunBody
  } = suppliedDryRun;
  void _suppliedCompletedAt;
  if (hashCatalogImportDryRun(suppliedDryRunBody) !== suppliedDryRunHash) {
    throw new Error("Supplied dry-run result hash is invalid");
  }
  const suppliedApproval = importApprovalSchema.parse(
    input.authorization.approval,
  );
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
        CATALOG_IMPORT_CONTRACT_VERSION,
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
    for (const [index, row] of canonical.envelope.catalogRows.entries()) {
      const importId = String(row.catalogImportId);
      const isCreate = row.catalogId === undefined;
      const catalogId = isCreate
        ? await input.catalogIdAllocator!.allocateCatalogId({
            catalogImportId: importId,
          })
        : String(row.catalogId);
      if (isCreate) {
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
        for (const [position, alias] of (
          aliasesByImport.get(importId) ?? []
        ).entries()) {
          await client.query(
            "INSERT INTO catalog_aliases(catalog_id, position, alias, alias_type) VALUES ($1,$2,$3,$4)",
            [catalogId, position, alias.alias, alias.aliasType],
          );
        }
        created += 1;
      } else {
        const outcome = recomputedDryRun.findings.some(
          ({ catalogImportId }) => String(catalogImportId) === importId,
        )
          ? "UPDATED"
          : "UNCHANGED";
        if (outcome === "UPDATED") {
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
        : updated + unchanged > 0 &&
            recomputedDryRun.findings.some(
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
