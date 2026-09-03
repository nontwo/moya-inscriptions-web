import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  CATALOG_IMPORT_CSV_SPEC,
  CATALOG_IMPORT_MANIFEST_HEADERS,
  CATALOG_IMPORT_V2_CONTRACT_VERSION,
  CATALOG_IMPORT_V2_CSV_SPEC,
  parseSupportedCatalogImportManifestTableRow,
} from "@moya/contracts/internal/catalog-import";

import {
  CatalogImportDiagnosticError,
  failCatalogImport,
} from "../diagnostics.js";
import { buildParsedCatalogImportBundle } from "./canonical-bundle.js";

import type { CatalogImportDiagnostic } from "../diagnostics.js";
import type { SupportedImportContractVersion } from "@moya/contracts/internal/catalog-import";
import type {
  LocatedCatalogImportTableRow,
  ParsedCatalogImportBundle,
} from "./canonical-bundle.js";

export const CATALOG_IMPORT_CSV_LIMITS = {
  maximumFileBytes: 4 * 1024 * 1024,
  maximumBundleBytes: 12 * 1024 * 1024,
  maximumRowsPerFile: 10_000,
} as const;

interface ParsedCsvRow {
  readonly values: readonly string[];
  readonly rowNumber: number;
}

const diagnostic = (
  code: CatalogImportDiagnostic["code"],
  category: CatalogImportDiagnostic["category"],
  message: string,
  file?: string,
  row?: number,
  machineHeader?: string,
): CatalogImportDiagnostic => ({
  code,
  severity: "ERROR",
  category,
  message,
  sourceFormat: "CSV",
  ...(file === undefined ? {} : { file }),
  ...(row === undefined ? {} : { row }),
  ...(machineHeader === undefined ? {} : { machineHeader }),
});

const strictUtf8 = (bytes: Uint8Array, filename: string): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return failCatalogImport(
      diagnostic(
        "CSV_INVALID_ENCODING",
        "CONTAINER_CSV",
        `${filename} is not valid UTF-8`,
        filename,
      ),
    );
  }
};

const assertSingleNewlineStyle = (text: string, filename: string): void => {
  let sawLf = false;
  let sawCrLf = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\r") {
      if (text[index + 1] !== "\n") {
        failCatalogImport(
          diagnostic(
            "CSV_NEWLINE_STYLE_MISMATCH",
            "CONTAINER_CSV",
            `${filename} contains a bare CR newline`,
            filename,
          ),
        );
      }
      sawCrLf = true;
      index += 1;
    } else if (character === "\n") {
      sawLf = true;
    }
    if (sawLf && sawCrLf) {
      failCatalogImport(
        diagnostic(
          "CSV_NEWLINE_STYLE_MISMATCH",
          "CONTAINER_CSV",
          `${filename} mixes LF and CRLF newline styles`,
          filename,
        ),
      );
    }
  }
};

const parseCsv = (input: string, filename: string): ParsedCsvRow[] => {
  const text = input.startsWith("\uFEFF") ? input.slice(1) : input;
  assertSingleNewlineStyle(text, filename);
  const rows: ParsedCsvRow[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let afterQuote = false;
  let physicalRow = 1;
  let rowStart = 1;
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
        if (character === "\n") physicalRow += 1;
        if (character === "\r") {
          physicalRow += 1;
          index += 1;
          cell += "\n";
        }
      }
      continue;
    }
    if (
      afterQuote &&
      character !== "," &&
      character !== "\n" &&
      character !== "\r"
    ) {
      failCatalogImport(
        diagnostic(
          "CSV_MALFORMED",
          "TABULAR_ROW_VALIDATION",
          "Unexpected character after a quoted CSV field",
          filename,
          physicalRow,
        ),
      );
    }
    if (character === '"') {
      if (cell !== "" || afterQuote) {
        failCatalogImport(
          diagnostic(
            "CSV_MALFORMED",
            "TABULAR_ROW_VALIDATION",
            "Malformed CSV quote",
            filename,
            physicalRow,
          ),
        );
      }
      quoted = true;
      continue;
    }
    if (character === ",") {
      row.push(cell);
      cell = "";
      afterQuote = false;
      continue;
    }
    if (character === "\r") index += 1;
    if (character === "\n" || character === "\r") {
      row.push(cell);
      rows.push({ values: row, rowNumber: rowStart });
      if (rows.length > CATALOG_IMPORT_CSV_LIMITS.maximumRowsPerFile) {
        failCatalogImport(
          diagnostic(
            "CSV_RESOURCE_LIMIT",
            "CONTAINER_CSV",
            `${filename} exceeds the CSV row limit`,
            filename,
          ),
        );
      }
      row = [];
      cell = "";
      afterQuote = false;
      physicalRow += 1;
      rowStart = physicalRow;
      continue;
    }
    cell += character;
  }
  if (quoted) {
    failCatalogImport(
      diagnostic(
        "CSV_MALFORMED",
        "TABULAR_ROW_VALIDATION",
        "Unterminated quoted CSV field",
        filename,
        rowStart,
      ),
    );
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push({ values: row, rowNumber: rowStart });
  }
  return rows;
};

const tableObjects = (
  input: string,
  expectedHeaders: readonly string[],
  filename: string,
  importContractVersion = "catalog-import/v1",
): LocatedCatalogImportTableRow[] => {
  const rows = parseCsv(input, filename);
  const headers = rows[0]?.values;
  if (headers === undefined) {
    return failCatalogImport(
      diagnostic(
        "CSV_HEADER_MISMATCH",
        "HEADER_LAYOUT",
        `${filename} is empty`,
        filename,
      ),
    );
  }
  if (new Set(headers).size !== headers.length) {
    failCatalogImport(
      diagnostic(
        "CSV_HEADER_MISMATCH",
        "HEADER_LAYOUT",
        `${filename} contains duplicate headers`,
        filename,
        1,
      ),
    );
  }
  if (
    headers.length !== expectedHeaders.length ||
    headers.some((header, index) => header !== expectedHeaders[index])
  ) {
    const mismatchIndex = Math.max(
      0,
      expectedHeaders.findIndex((header, index) => headers[index] !== header),
    );
    failCatalogImport(
      diagnostic(
        "CSV_HEADER_MISMATCH",
        "HEADER_LAYOUT",
        `${filename} headers do not match ${importContractVersion}`,
        filename,
        1,
        expectedHeaders[mismatchIndex],
      ),
    );
  }
  return rows.slice(1).map((csvRow) => {
    if (csvRow.values.length !== headers.length) {
      failCatalogImport(
        diagnostic(
          "CSV_MALFORMED",
          "TABULAR_ROW_VALIDATION",
          `${filename} row ${csvRow.rowNumber} has the wrong cell count`,
          filename,
          csvRow.rowNumber,
        ),
      );
    }
    return {
      values: Object.fromEntries(
        headers.map((header, index) => [header, csvRow.values[index] ?? ""]),
      ),
      location: {
        sourceFormat: "CSV",
        file: filename,
        row: csvRow.rowNumber,
      },
    };
  });
};

const readRegularFile = async (
  directory: string,
  filename: string,
): Promise<Uint8Array> => {
  const filePath = join(directory, filename);
  const status = await lstat(filePath).catch(() => undefined);
  if (status === undefined) {
    return failCatalogImport(
      diagnostic(
        "CSV_BUNDLE_LAYOUT_MISMATCH",
        "CONTAINER_CSV",
        `${filename} must be a regular file`,
        filename,
      ),
    );
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    return failCatalogImport(
      diagnostic(
        "CSV_BUNDLE_LAYOUT_MISMATCH",
        "CONTAINER_CSV",
        `${filename} must be a regular file`,
        filename,
      ),
    );
  }
  if (status.size > CATALOG_IMPORT_CSV_LIMITS.maximumFileBytes) {
    failCatalogImport(
      diagnostic(
        "CSV_RESOURCE_LIMIT",
        "CONTAINER_CSV",
        `${filename} exceeds the CSV file size limit`,
        filename,
      ),
    );
  }
  return readFile(filePath);
};

export const parseCatalogImportCsvBundle = async (
  directory: string,
): Promise<ParsedCatalogImportBundle> => {
  const directoryStatus = await lstat(directory).catch(() => undefined);
  if (directoryStatus === undefined) {
    return failCatalogImport(
      diagnostic(
        "CSV_BUNDLE_LAYOUT_MISMATCH",
        "CONTAINER_CSV",
        "CSV bundle path must be an explicitly supplied regular directory",
      ),
    );
  }
  if (directoryStatus.isSymbolicLink() || !directoryStatus.isDirectory()) {
    return failCatalogImport(
      diagnostic(
        "CSV_BUNDLE_LAYOUT_MISMATCH",
        "CONTAINER_CSV",
        "CSV bundle path must be an explicitly supplied regular directory",
      ),
    );
  }
  const actualFiles = (await readdir(directory)).sort();
  const manifestFilename = "00_manifest.csv";
  if (!actualFiles.includes(manifestFilename)) {
    return failCatalogImport(
      diagnostic(
        "CSV_BUNDLE_LAYOUT_MISMATCH",
        "VERSION_METADATA",
        "CSV bundle is missing the explicit import contract manifest",
        manifestFilename,
      ),
    );
  }
  const manifestBytes = await readRegularFile(directory, manifestFilename);
  const manifestText = strictUtf8(manifestBytes, manifestFilename);
  const manifest = tableObjects(
    manifestText,
    CATALOG_IMPORT_MANIFEST_HEADERS,
    manifestFilename,
  );
  if (manifest.length !== 1) {
    failCatalogImport(
      diagnostic(
        "CSV_BUNDLE_LAYOUT_MISMATCH",
        "VERSION_METADATA",
        `${manifestFilename} requires exactly one data row`,
        manifestFilename,
      ),
    );
  }
  let importContractVersion: SupportedImportContractVersion;
  try {
    importContractVersion = parseSupportedCatalogImportManifestTableRow(
      manifest[0]?.values,
    );
  } catch (error) {
    throw new CatalogImportDiagnosticError([
      diagnostic(
        "CSV_BUNDLE_LAYOUT_MISMATCH",
        "VERSION_METADATA",
        error instanceof Error
          ? error.message
          : "CSV import contract version is invalid",
        manifestFilename,
        manifest[0]?.location.row,
        "importContractVersion",
      ),
    ]);
  }

  const csvSpec =
    importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION
      ? CATALOG_IMPORT_V2_CSV_SPEC
      : CATALOG_IMPORT_CSV_SPEC;
  const expectedFiles = Object.keys(csvSpec.files).sort();
  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((name, index) => name !== expectedFiles[index])
  ) {
    failCatalogImport(
      diagnostic(
        "CSV_BUNDLE_LAYOUT_MISMATCH",
        "CONTAINER_CSV",
        `CSV bundle does not match the exact ${importContractVersion} file layout`,
      ),
    );
  }
  const dataFilenames = Object.keys(csvSpec.files).filter(
    (filename) => filename !== manifestFilename,
  );
  const dataBytes = await Promise.all(
    dataFilenames.map((filename) => readRegularFile(directory, filename)),
  );
  if (
    manifestBytes.byteLength +
      dataBytes.reduce((total, item) => total + item.byteLength, 0) >
    CATALOG_IMPORT_CSV_LIMITS.maximumBundleBytes
  ) {
    failCatalogImport(
      diagnostic(
        "CSV_RESOURCE_LIMIT",
        "CONTAINER_CSV",
        "CSV bundle exceeds the total size limit",
      ),
    );
  }
  const textByFilename = new Map(
    dataFilenames.map((filename, index) => [
      filename,
      strictUtf8(dataBytes[index] ?? new Uint8Array(), filename),
    ]),
  );
  const rows = (filename: string) =>
    tableObjects(
      textByFilename.get(filename) ?? "",
      csvSpec.files[filename as keyof typeof csvSpec.files],
      filename,
      importContractVersion,
    );

  const catalogRows = rows("catalog.csv");
  const aliasRows = rows("aliases.csv");
  const provenanceRows = rows("provenance.csv");
  return buildParsedCatalogImportBundle({
    sourceFormat: "CSV",
    importContractVersion,
    catalogRows,
    aliasRows,
    provenanceRows,
    ...(importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION
      ? {
          contributorRows: rows("contributors.csv"),
          publicCitationRows: rows("public_citations.csv"),
        }
      : {}),
  });
};
