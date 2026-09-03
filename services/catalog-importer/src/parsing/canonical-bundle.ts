import { createHash } from "node:crypto";

import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  CATALOG_IMPORT_V2_CATALOG_HEADERS,
  CATALOG_IMPORT_V2_CONTRACT_VERSION,
  CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
  CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
  CATALOG_IMPORT_WORKBOOK_SPEC,
  canonicalCatalogImportEnvelopeSchema,
  canonicalCatalogImportV2EnvelopeSchema,
  canonicalizeAliasImportTableRow,
  canonicalizeCatalogContributorImportTableRow,
  canonicalizeCatalogImportV2TableRow,
  canonicalizeCatalogImportTableRow,
  canonicalizeProvenanceImportTableRow,
  canonicalizePublicCitationImportTableRow,
  serializeCanonicalCatalogImportEnvelope,
  serializeCanonicalCatalogImportV2Envelope,
} from "@moya/contracts/internal/catalog-import";

import {
  CatalogImportDiagnosticError,
  sortCatalogImportDiagnostics,
} from "../diagnostics.js";

import type {
  CanonicalCatalogImportEnvelope,
  CanonicalCatalogImportV2Envelope,
  SupportedImportContractVersion,
} from "@moya/contracts/internal/catalog-import";
import type { CatalogImportDiagnostic } from "../diagnostics.js";

export interface CatalogImportSourceLocation {
  readonly sourceFormat: "CSV" | "XLSX";
  readonly file?: string;
  readonly sheet?: string;
  readonly row: number;
}

export interface LocatedCatalogImportTableRow {
  readonly values: Readonly<Record<string, string>>;
  readonly location: CatalogImportSourceLocation;
}

interface ParsedCatalogImportBundleBase {
  readonly canonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly sourceFormat?: "CSV" | "XLSX";
  readonly sourceArtifactSha256?: string;
  readonly diagnostics?: readonly CatalogImportDiagnostic[];
}

export interface ParsedCatalogImportV1Bundle extends ParsedCatalogImportBundleBase {
  readonly envelope: CanonicalCatalogImportEnvelope;
  readonly rowCounts: {
    readonly catalog: number;
    readonly aliases: number;
    readonly provenance: number;
  };
}

export interface ParsedCatalogImportV2Bundle extends ParsedCatalogImportBundleBase {
  readonly envelope: CanonicalCatalogImportV2Envelope;
  readonly rowCounts: {
    readonly catalog: number;
    readonly aliases: number;
    readonly provenance: number;
    readonly contributors: number;
    readonly publicCitations: number;
  };
}

export type ParsedCatalogImportBundle =
  ParsedCatalogImportV1Bundle | ParsedCatalogImportV2Bundle;

interface ValidationIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

const validationIssues = (error: unknown): readonly ValidationIssue[] => {
  if (error === null || typeof error !== "object" || !("issues" in error)) {
    return [];
  }
  const issues = (error as { readonly issues?: unknown }).issues;
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) => {
    if (
      issue === null ||
      typeof issue !== "object" ||
      !("message" in issue) ||
      typeof (issue as { readonly message?: unknown }).message !== "string"
    ) {
      return [];
    }
    const path = (issue as { readonly path?: unknown }).path;
    return [
      {
        path: Array.isArray(path) ? path : [],
        message: (issue as { readonly message: string }).message,
      },
    ];
  });
};

const columnName = (index: number): string => {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

const cellReference = (
  location: CatalogImportSourceLocation,
  headers: readonly string[],
  machineHeader: string | undefined,
): string | undefined => {
  if (location.sourceFormat !== "XLSX" || machineHeader === undefined) {
    return undefined;
  }
  const index = headers.indexOf(machineHeader);
  return index === -1 ? undefined : `${columnName(index)}${location.row}`;
};

const inferMachineHeader = (
  values: Readonly<Record<string, string>>,
  headers: readonly string[],
): string | undefined => {
  for (const required of [
    "catalogImportId",
    "sourceId",
    "title",
    "catalogKind",
  ] as const) {
    if (headers.includes(required) && values[required] === "") return required;
  }
  if (
    headers.includes("catalogKind") &&
    !CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.catalogKind.includes(
      values.catalogKind as "inscription" | "calligraphy",
    )
  ) {
    return "catalogKind";
  }
  if (
    headers.includes("aliasType") &&
    !CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.aliasType.includes(
      values.aliasType as "alternate" | "historical",
    )
  ) {
    return "aliasType";
  }
  const pairs = [
    ["dynasty", "dynastyState"],
    ["dateText", "dateTextState"],
    ["province", "provinceState"],
    ["prefecture", "prefectureState"],
    ["county", "countyState"],
    ["currentLocation", "currentLocationState"],
    ["currentCustodian", "currentCustodianState"],
    ["description", "descriptionState"],
  ] as const;
  for (const [valueHeader, stateHeader] of pairs) {
    const value = values[valueHeader] ?? "";
    const state = values[stateHeader] ?? "";
    if (
      (value !== "" && state !== "" && state !== "VALUE") ||
      (value === "" && state === "VALUE")
    ) {
      return stateHeader;
    }
  }
  return undefined;
};

const rowDiagnostics = (
  error: unknown,
  row: LocatedCatalogImportTableRow,
  headers: readonly string[],
): CatalogImportDiagnostic[] => {
  const issues = validationIssues(error);
  const fallbackMessage =
    error instanceof Error ? error.message : "Tabular row validation failed";
  const inputs =
    issues.length === 0 ? [{ path: [], message: fallbackMessage }] : issues;
  return inputs.map((issue) => {
    const issueHeader = [...issue.path]
      .reverse()
      .find(
        (item): item is string =>
          typeof item === "string" && headers.includes(item),
      );
    const machineHeader =
      issueHeader ?? inferMachineHeader(row.values, headers);
    const reference = cellReference(row.location, headers, machineHeader);
    return {
      code: "TABULAR_ROW_INVALID",
      severity: "ERROR",
      category: "TABULAR_ROW_VALIDATION",
      message: issue.message,
      ...row.location,
      ...(machineHeader === undefined ? {} : { machineHeader }),
      ...(reference === undefined ? {} : { cellReference: reference }),
    } satisfies CatalogImportDiagnostic;
  });
};

const canonicalizeRows = <Output>(
  rows: readonly LocatedCatalogImportTableRow[],
  headers: readonly string[],
  canonicalize: (input: unknown) => Output,
): Output[] => {
  const output: Output[] = [];
  const diagnostics: CatalogImportDiagnostic[] = [];
  for (const row of rows) {
    try {
      output.push(canonicalize(row.values));
    } catch (error) {
      diagnostics.push(...rowDiagnostics(error, row, headers));
    }
  }
  if (diagnostics.length > 0) {
    throw new CatalogImportDiagnosticError(diagnostics);
  }
  return output;
};

const crossRowDiagnostics = (
  error: unknown,
  tables: {
    readonly sourceFormat: "CSV" | "XLSX";
    readonly importContractVersion?: SupportedImportContractVersion;
    readonly catalogRows: readonly LocatedCatalogImportTableRow[];
    readonly aliasRows: readonly LocatedCatalogImportTableRow[];
    readonly provenanceRows: readonly LocatedCatalogImportTableRow[];
    readonly contributorRows?: readonly LocatedCatalogImportTableRow[];
    readonly publicCitationRows?: readonly LocatedCatalogImportTableRow[];
  },
): CatalogImportDiagnostic[] => {
  const tableLocations = {
    catalogRows: {
      rows: tables.catalogRows,
      headers:
        tables.importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION
          ? CATALOG_IMPORT_V2_CATALOG_HEADERS
          : CATALOG_IMPORT_CATALOG_HEADERS,
    },
    aliasRows: {
      rows: tables.aliasRows,
      headers: CATALOG_IMPORT_ALIAS_HEADERS,
    },
    provenanceRows: {
      rows: tables.provenanceRows,
      headers: CATALOG_IMPORT_PROVENANCE_HEADERS,
    },
    contributorRows: {
      rows: tables.contributorRows ?? [],
      headers: CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
    },
    publicCitationRows: {
      rows: tables.publicCitationRows ?? [],
      headers: CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
    },
  } as const;
  const issues = validationIssues(error);
  if (issues.length === 0) {
    return [
      {
        code: "CANONICAL_INVARIANT",
        severity: "ERROR",
        category: "CANONICAL_INVARIANT",
        message:
          error instanceof Error
            ? error.message
            : "Canonical envelope validation failed",
        sourceFormat: tables.sourceFormat,
      },
    ];
  }
  return issues.map((issue) => {
    const collection = issue.path[0];
    const rowIndex = issue.path[1];
    const machineHeader =
      typeof issue.path[2] === "string" ? issue.path[2] : undefined;
    const table =
      typeof collection === "string" && collection in tableLocations
        ? tableLocations[collection as keyof typeof tableLocations]
        : undefined;
    const row =
      table !== undefined && typeof rowIndex === "number"
        ? table.rows[rowIndex]
        : undefined;
    const reference =
      row === undefined || table === undefined
        ? undefined
        : cellReference(row.location, table.headers, machineHeader);
    return {
      code: "CANONICAL_INVARIANT",
      severity: "ERROR",
      category: "CANONICAL_INVARIANT",
      message: issue.message,
      sourceFormat:
        row?.location.sourceFormat ??
        tables.catalogRows[0]?.location.sourceFormat ??
        tables.sourceFormat,
      ...(row === undefined ? {} : row.location),
      ...(machineHeader === undefined ? {} : { machineHeader }),
      ...(reference === undefined ? {} : { cellReference: reference }),
    } satisfies CatalogImportDiagnostic;
  });
};

export const buildParsedCatalogImportBundle = (input: {
  readonly sourceFormat: "CSV" | "XLSX";
  readonly sourceArtifactSha256?: string;
  readonly importContractVersion?: SupportedImportContractVersion;
  readonly catalogRows: readonly LocatedCatalogImportTableRow[];
  readonly aliasRows: readonly LocatedCatalogImportTableRow[];
  readonly provenanceRows: readonly LocatedCatalogImportTableRow[];
  readonly contributorRows?: readonly LocatedCatalogImportTableRow[];
  readonly publicCitationRows?: readonly LocatedCatalogImportTableRow[];
}): ParsedCatalogImportBundle => {
  const importContractVersion =
    input.importContractVersion ?? CATALOG_IMPORT_CONTRACT_VERSION;
  if (importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION) {
    const catalogRows = canonicalizeRows(
      input.catalogRows,
      CATALOG_IMPORT_V2_CATALOG_HEADERS,
      canonicalizeCatalogImportV2TableRow,
    );
    const aliasRows = canonicalizeRows(
      input.aliasRows,
      CATALOG_IMPORT_ALIAS_HEADERS,
      canonicalizeAliasImportTableRow,
    );
    const provenanceRows = canonicalizeRows(
      input.provenanceRows,
      CATALOG_IMPORT_PROVENANCE_HEADERS,
      canonicalizeProvenanceImportTableRow,
    );
    const contributorRows = canonicalizeRows(
      input.contributorRows ?? [],
      CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
      canonicalizeCatalogContributorImportTableRow,
    );
    const publicCitationRows = canonicalizeRows(
      input.publicCitationRows ?? [],
      CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
      canonicalizePublicCitationImportTableRow,
    );
    let submittedEnvelope: CanonicalCatalogImportV2Envelope;
    try {
      submittedEnvelope = canonicalCatalogImportV2EnvelopeSchema.parse({
        importContractVersion,
        catalogRows,
        aliasRows,
        provenanceRows,
        contributorRows,
        publicCitationRows,
      });
    } catch (error) {
      throw new CatalogImportDiagnosticError(
        sortCatalogImportDiagnostics(crossRowDiagnostics(error, input)),
      );
    }
    const canonicalJson =
      serializeCanonicalCatalogImportV2Envelope(submittedEnvelope);
    const envelope = canonicalCatalogImportV2EnvelopeSchema.parse(
      JSON.parse(canonicalJson),
    );
    return {
      envelope,
      canonicalJson,
      canonicalInputSha256: createHash("sha256")
        .update(canonicalJson, "utf8")
        .digest("hex"),
      rowCounts: {
        catalog: catalogRows.length,
        aliases: aliasRows.length,
        provenance: provenanceRows.length,
        contributors: contributorRows.length,
        publicCitations: publicCitationRows.length,
      },
      sourceFormat: input.sourceFormat,
      ...(input.sourceArtifactSha256 === undefined
        ? {}
        : { sourceArtifactSha256: input.sourceArtifactSha256 }),
      diagnostics: [],
    };
  }

  const catalogRows = canonicalizeRows(
    input.catalogRows,
    CATALOG_IMPORT_CATALOG_HEADERS,
    canonicalizeCatalogImportTableRow,
  );
  const aliasRows = canonicalizeRows(
    input.aliasRows,
    CATALOG_IMPORT_ALIAS_HEADERS,
    canonicalizeAliasImportTableRow,
  );
  const provenanceRows = canonicalizeRows(
    input.provenanceRows,
    CATALOG_IMPORT_PROVENANCE_HEADERS,
    canonicalizeProvenanceImportTableRow,
  );
  let envelope: CanonicalCatalogImportEnvelope;
  try {
    envelope = canonicalCatalogImportEnvelopeSchema.parse({
      importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
      catalogRows,
      aliasRows,
      provenanceRows,
    });
  } catch (error) {
    throw new CatalogImportDiagnosticError(
      sortCatalogImportDiagnostics(crossRowDiagnostics(error, input)),
    );
  }
  const canonicalJson = serializeCanonicalCatalogImportEnvelope(envelope);
  return {
    envelope,
    canonicalJson,
    canonicalInputSha256: createHash("sha256")
      .update(canonicalJson, "utf8")
      .digest("hex"),
    rowCounts: {
      catalog: catalogRows.length,
      aliases: aliasRows.length,
      provenance: provenanceRows.length,
    },
    sourceFormat: input.sourceFormat,
    ...(input.sourceArtifactSha256 === undefined
      ? {}
      : { sourceArtifactSha256: input.sourceArtifactSha256 }),
    diagnostics: [],
  };
};
