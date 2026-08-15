export const CATALOG_IMPORT_DIAGNOSTIC_CODES = [
  "CSV_BUNDLE_LAYOUT_MISMATCH",
  "CSV_HEADER_MISMATCH",
  "CSV_INVALID_ENCODING",
  "CSV_MALFORMED",
  "CSV_NEWLINE_STYLE_MISMATCH",
  "CSV_RESOURCE_LIMIT",
  "CANONICAL_INVARIANT",
  "OOXML_DUPLICATE_ENTRY",
  "OOXML_ENCRYPTED_CONTENT",
  "OOXML_INVALID_CONTAINER",
  "OOXML_MISSING_REQUIRED_PART",
  "OOXML_RESOURCE_LIMIT",
  "OOXML_UNSAFE_ENTRY_PATH",
  "OOXML_UNSAFE_XML",
  "TABULAR_ROW_INVALID",
  "XLSX_ACTIVE_CONTENT",
  "XLSX_EXTERNAL_RELATIONSHIP",
  "XLSX_HEADER_MISMATCH",
  "XLSX_METADATA_MISMATCH",
  "XLSX_SHEET_LAYOUT_MISMATCH",
  "XLSX_UNSUPPORTED_CELL_TYPE",
  "XLSX_WORKBOOK_VERSION_MISMATCH",
] as const;

export type CatalogImportDiagnosticCode =
  (typeof CATALOG_IMPORT_DIAGNOSTIC_CODES)[number];

export type CatalogImportDiagnosticCategory =
  | "CANONICAL_INVARIANT"
  | "CONTAINER_CSV"
  | "CONTAINER_OOXML"
  | "FORMULA_ACTIVE_CONTENT"
  | "HEADER_LAYOUT"
  | "TABULAR_ROW_VALIDATION"
  | "UNSAFE_WORKBOOK_CONTENT"
  | "UNSUPPORTED_CELL_TYPE"
  | "VERSION_METADATA";

export interface CatalogImportDiagnostic {
  readonly code: CatalogImportDiagnosticCode;
  readonly severity: "ERROR";
  readonly category: CatalogImportDiagnosticCategory;
  readonly message: string;
  readonly sourceFormat: "CSV" | "XLSX";
  readonly file?: string;
  readonly sheet?: string;
  readonly row?: number;
  readonly machineHeader?: string;
  readonly cellReference?: string;
}

const compareText = (left: string | undefined, right: string | undefined) =>
  (left ?? "").localeCompare(right ?? "", "en");

export const sortCatalogImportDiagnostics = (
  diagnostics: readonly CatalogImportDiagnostic[],
): CatalogImportDiagnostic[] =>
  [...diagnostics].sort(
    (left, right) =>
      compareText(left.sourceFormat, right.sourceFormat) ||
      compareText(left.file, right.file) ||
      compareText(left.sheet, right.sheet) ||
      (left.row ?? 0) - (right.row ?? 0) ||
      compareText(left.cellReference, right.cellReference) ||
      compareText(left.machineHeader, right.machineHeader) ||
      compareText(left.code, right.code) ||
      compareText(left.message, right.message),
  );

export class CatalogImportDiagnosticError extends Error {
  readonly diagnostics: readonly CatalogImportDiagnostic[];

  constructor(diagnostics: readonly CatalogImportDiagnostic[]) {
    const ordered = sortCatalogImportDiagnostics(diagnostics);
    super(ordered[0]?.message ?? "Catalog import validation failed");
    this.name = "CatalogImportDiagnosticError";
    this.diagnostics = ordered;
  }
}

export const failCatalogImport = (
  diagnostic: CatalogImportDiagnostic,
): never => {
  throw new CatalogImportDiagnosticError([diagnostic]);
};
