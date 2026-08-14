import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_CONTRACT_VERSION,
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
import { catalogIdSchema } from "@moya/contracts/schemas";

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
  const [manifestText, catalogText, aliasText, provenanceText] =
    await Promise.all([
      readFile(join(directory, "00_manifest.csv"), "utf8"),
      readFile(join(directory, "catalog.csv"), "utf8"),
      readFile(join(directory, "aliases.csv"), "utf8"),
      readFile(join(directory, "provenance.csv"), "utf8"),
    ]);
  const manifest = tableObjects(
    manifestText,
    CATALOG_IMPORT_MANIFEST_HEADERS,
    "00_manifest.csv",
  );
  if (manifest.length !== 1)
    throw new Error("00_manifest.csv requires one row");
  parseCatalogImportManifestTableRow(manifest[0]);
  const catalogRows = tableObjects(
    catalogText,
    CATALOG_IMPORT_CATALOG_HEADERS,
    "catalog.csv",
  ).map(canonicalizeCatalogImportTableRow);
  const aliasRows = tableObjects(
    aliasText,
    CATALOG_IMPORT_ALIAS_HEADERS,
    "aliases.csv",
  ).map(canonicalizeAliasImportTableRow);
  const provenanceRows = tableObjects(
    provenanceText,
    CATALOG_IMPORT_PROVENANCE_HEADERS,
    "provenance.csv",
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

interface SourceMappingRow extends QueryResultRow {
  readonly source_id: string;
  readonly catalog_id: string;
}

interface CatalogIdentityRow extends QueryResultRow {
  readonly catalog_id: string;
  readonly title: string;
}

const dryRunHash = (
  input: Omit<CatalogImportDryRun, "dryRunResultSha256" | "completedAt">,
) => textSha256(stableJson(input));

export const createCatalogImportDryRun = async (
  pool: Pool,
  parsed: ParsedCatalogImportBundle,
  completedAt: string,
): Promise<CatalogImportDryRun> => {
  const sourceIds = parsed.envelope.catalogRows.map(({ sourceId }) =>
    String(sourceId),
  );
  const titles = parsed.envelope.catalogRows.map(({ title }) => title);
  const [sources, titleMatches] = await Promise.all([
    pool.query<SourceMappingRow>(
      "SELECT source_id, catalog_id FROM catalog_import_sources WHERE source_id = ANY($1::text[])",
      [sourceIds],
    ),
    pool.query<CatalogIdentityRow>(
      "SELECT catalog_id, title FROM catalog_entries WHERE title = ANY($1::text[])",
      [titles],
    ),
  ]);
  const sourceMap = new Map(
    sources.rows.map((row) => [row.source_id, row.catalog_id]),
  );
  const titleMap = new Map(
    titleMatches.rows.map((row) => [row.title, row.catalog_id]),
  );
  const findings: CatalogImportDryRun["findings"] = [];
  const duplicateCandidates: CatalogImportDryRun["duplicateCandidates"] = [];
  let add = 0;
  let unchanged = 0;
  let conflict = 0;
  for (const row of parsed.envelope.catalogRows) {
    const sourceId = String(row.sourceId);
    const existingSourceCatalogId = sourceMap.get(sourceId);
    if (existingSourceCatalogId !== undefined) {
      if (
        row.catalogId !== undefined &&
        row.catalogId !== existingSourceCatalogId
      ) {
        conflict += 1;
        findings.push({
          findingId: dryRunFindingIdSchema.parse(
            `finding-${textSha256(`${sourceId}\0source-conflict`).slice(0, 32)}`,
          ),
          catalogImportId: row.catalogImportId,
          sourceId: row.sourceId,
          catalogId: row.catalogId,
          category: "IDENTITY_CONFLICT",
          field: "sourceId",
          identityConflictReason: "SOURCE_ID_REBOUND",
          applyBlocker: "IDENTITY_CONFLICT",
          approvable: false,
          requiresFieldApproval: false,
          message: "SourceId is already bound to another CatalogId",
        });
      } else {
        unchanged += 1;
      }
      continue;
    }
    const titleCatalogId = titleMap.get(row.title);
    if (row.catalogId === undefined && titleCatalogId !== undefined) {
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
        findingId: dryRunFindingIdSchema.parse(
          `finding-${textSha256(`${sourceId}\0duplicate`).slice(0, 32)}`,
        ),
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
  ];
  const withoutHashes = {
    importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
    canonicalInputSha256: sha256Schema.parse(parsed.canonicalInputSha256),
    state:
      applyBlockers.length === 0 ? ("PASSED" as const) : ("FAILED" as const),
    rowCounts: parsed.rowCounts,
    resultCounts: {
      add,
      update: 0,
      unchanged,
      conflict,
      identityConflict: findings.filter(
        ({ category }) => category === "IDENTITY_CONFLICT",
      ).length,
      error: 0,
      duplicateCandidate: duplicateCandidates.length,
    },
    findings,
    duplicateCandidates,
    applyBlockers,
    applyReady: applyBlockers.length === 0,
  };
  return catalogImportDryRunSchema.parse({
    ...withoutHashes,
    dryRunResultSha256: dryRunHash(withoutHashes),
    completedAt,
  });
};

const fieldValue = (field: {
  readonly state: string;
  readonly value?: string;
}) => (field.state === "VALUE" ? field.value : null);

const validationCatalogId = (sourceId: string) =>
  catalogIdSchema.parse(
    `validation-catalog-${textSha256(sourceId).slice(0, 24)}`,
  );

export interface ValidationContext {
  readonly validationOnly: true;
  readonly nonProduction: true;
  readonly disposableDatabase: true;
  readonly publicationApproval: false;
  readonly reusableForProduction: false;
  readonly ownerInstructionReference: string;
}

export interface CatalogImportApplicationResult {
  readonly status: "APPLIED" | "ALREADY_APPLIED";
  readonly operationId: string;
  readonly canonicalInputSha256: string;
  readonly dryRunResultSha256: string;
  readonly created: number;
  readonly updated: number;
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
    `SELECT canonical_input_sha256, dry_run_result_sha256, approval_sha256,
       status, result_json
     FROM catalog_import_operations WHERE operation_id = $1`,
    [operationId],
  );
  const existing = result.rows[0];
  if (existing === undefined) return undefined;
  if (
    existing.canonical_input_sha256 !== canonicalInputSha256 ||
    existing.dry_run_result_sha256 !== dryRunResultSha256 ||
    existing.approval_sha256 !== approvalSha256
  ) {
    throw new Error(
      "Import operation identity was reused with different hashes",
    );
  }
  if (existing.status !== "APPLIED" || existing.result_json === null) {
    throw new Error("Conflicting incomplete import operation exists");
  }
  return { ...existing.result_json, status: "ALREADY_APPLIED" };
};

export const applyCatalogImport = async (
  pool: Pool,
  input: {
    readonly operationId: string;
    readonly parsed: ParsedCatalogImportBundle;
    readonly dryRun: CatalogImportDryRun;
    readonly approval: ImportApproval;
    readonly validationContext: ValidationContext;
    readonly appliedAt: string;
    readonly failureAfterCatalogRows?: number;
  },
): Promise<CatalogImportApplicationResult> => {
  const dryRun = catalogImportDryRunSchema.parse(input.dryRun);
  const approval = importApprovalSchema.parse(input.approval);
  if (
    dryRun.applyReady !== true ||
    dryRun.state !== "PASSED" ||
    dryRun.findings.length !== 0 ||
    dryRun.applyBlockers.length !== 0 ||
    dryRun.resultCounts.add !== input.parsed.envelope.catalogRows.length ||
    dryRun.resultCounts.update !== 0 ||
    dryRun.resultCounts.conflict !== 0 ||
    dryRun.resultCounts.error !== 0
  ) {
    throw new Error(
      "Validation apply requires an exactly clean create-only dry-run",
    );
  }
  if (
    approval.state !== "APPROVED" ||
    approval.canonicalInputSha256 !== input.parsed.canonicalInputSha256 ||
    approval.dryRunResultSha256 !== dryRun.dryRunResultSha256 ||
    approval.approvedFindingIds.length !== 0
  ) {
    throw new Error("Validation approval does not bind the clean dry-run");
  }
  const approvalSha256 = hashApproval(approval);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO catalog_import_operations(
         operation_id, import_contract_version, canonical_input_sha256,
         dry_run_result_sha256, approval_sha256, validation_context,
         status, result_json, created_at, applied_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'APPLYING', NULL, $7, NULL)
       ON CONFLICT (operation_id) DO NOTHING`,
      [
        input.operationId,
        CATALOG_IMPORT_CONTRACT_VERSION,
        input.parsed.canonicalInputSha256,
        dryRun.dryRunResultSha256,
        approvalSha256,
        JSON.stringify(input.validationContext),
        input.appliedAt,
      ],
    );
    if (inserted.rowCount === 0) {
      const existing = await loadExistingResult(
        client,
        input.operationId,
        input.parsed.canonicalInputSha256,
        dryRun.dryRunResultSha256,
        approvalSha256,
      );
      if (existing === undefined) throw new Error("Import operation conflict");
      await client.query("COMMIT");
      return existing;
    }

    const existingSources = await client.query(
      "SELECT source_id FROM catalog_import_sources WHERE source_id = ANY($1::text[])",
      [
        input.parsed.envelope.catalogRows.map(({ sourceId }) =>
          String(sourceId),
        ),
      ],
    );
    if (existingSources.rows.length > 0) {
      throw new Error("SourceId state changed after dry-run");
    }

    const aliasesByImport = new Map<
      string,
      CanonicalCatalogImportEnvelope["aliasRows"]
    >();
    for (const alias of input.parsed.envelope.aliasRows) {
      const key = String(alias.catalogImportId);
      aliasesByImport.set(key, [...(aliasesByImport.get(key) ?? []), alias]);
    }
    const provenanceByImport = new Map(
      input.parsed.envelope.provenanceRows.map((row) => [
        String(row.catalogImportId),
        row,
      ]),
    );
    const catalogIdMap: CatalogImportApplicationResult["catalogIdMap"][number][] =
      [];
    for (const [index, row] of input.parsed.envelope.catalogRows.entries()) {
      const catalogId =
        row.catalogId ?? validationCatalogId(String(row.sourceId));
      await client.query(
        `INSERT INTO catalog_entries(
           catalog_id, kind, title, summary, description, period_label,
           dynasty, dynasty_state, date_text, date_text_state,
           province, province_state, prefecture, prefecture_state,
           county, county_state, current_location, current_location_state,
           current_custodian, current_custodian_state, description_state
         ) VALUES (
           $1, $2, $3, NULL, $4, NULL,
           $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
         )`,
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
        aliasesByImport.get(String(row.catalogImportId)) ?? []
      ).entries()) {
        await client.query(
          `INSERT INTO catalog_aliases(catalog_id, position, alias, alias_type)
           VALUES ($1, $2, $3, $4)`,
          [catalogId, position, alias.alias, alias.aliasType],
        );
      }
      const provenance = provenanceByImport.get(String(row.catalogImportId));
      if (provenance === undefined || provenance.sourceId !== row.sourceId) {
        throw new Error("Primary SourceId provenance is missing or mismatched");
      }
      await client.query(
        `INSERT INTO catalog_import_sources(
           source_id, catalog_id, source_title, source_type_raw, source_url, source_note
         ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          provenance.sourceId,
          catalogId,
          provenance.sourceTitle ?? null,
          provenance.sourceTypeRaw ?? null,
          provenance.sourceUrl ?? null,
          provenance.sourceNote ?? null,
        ],
      );
      await client.query(
        `INSERT INTO catalog_import_operation_items(
           operation_id, catalog_import_id, source_id, catalog_id, result
         ) VALUES ($1, $2, $3, $4, 'CREATED')`,
        [input.operationId, row.catalogImportId, row.sourceId, catalogId],
      );
      catalogIdMap.push({
        catalogImportId: String(row.catalogImportId),
        sourceId: String(row.sourceId),
        catalogId: String(catalogId),
      });
      if (input.failureAfterCatalogRows === index + 1) {
        throw new Error("Synthetic mid-transaction failure");
      }
    }
    const result: CatalogImportApplicationResult = {
      status: "APPLIED",
      operationId: input.operationId,
      canonicalInputSha256: input.parsed.canonicalInputSha256,
      dryRunResultSha256: String(dryRun.dryRunResultSha256),
      created: catalogIdMap.length,
      updated: 0,
      catalogIdMap,
      appliedAt: input.appliedAt,
    };
    await client.query(
      `UPDATE catalog_import_operations
       SET status = 'APPLIED', result_json = $2::jsonb, applied_at = $3
       WHERE operation_id = $1`,
      [input.operationId, JSON.stringify(result), input.appliedAt],
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the originating apply failure.
    }
    throw error;
  } finally {
    client.release();
  }
};
