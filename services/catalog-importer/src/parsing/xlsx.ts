import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import {
  CATALOG_IMPORT_SHEET_NAMES,
  CATALOG_IMPORT_XLSX_LAYOUT_SPEC,
} from "@moya/contracts/internal/catalog-import";
import ExcelJS from "exceljs";

import {
  CatalogImportDiagnosticError,
  failCatalogImport,
} from "../diagnostics.js";
import { buildParsedCatalogImportBundle } from "./canonical-bundle.js";
import {
  CATALOG_IMPORT_XLSX_LIMITS,
  preflightCatalogImportOoxmlContainer,
} from "./ooxml-preflight.js";

import type { CatalogImportDiagnostic } from "../diagnostics.js";
import type {
  LocatedCatalogImportTableRow,
  ParsedCatalogImportBundle,
} from "./canonical-bundle.js";
import type { CatalogImportOoxmlPreflightResult } from "./ooxml-preflight.js";

export interface CatalogImportXlsxPreflightResult extends CatalogImportOoxmlPreflightResult {
  readonly sourceArtifactSha256: string;
  readonly sheets: readonly string[];
}

const diagnostic = (
  code: CatalogImportDiagnostic["code"],
  category: CatalogImportDiagnostic["category"],
  message: string,
  input: {
    readonly file?: string;
    readonly sheet?: string;
    readonly row?: number;
    readonly machineHeader?: string;
    readonly cellReference?: string;
  } = {},
): CatalogImportDiagnostic => ({
  code,
  severity: "ERROR",
  category,
  message,
  sourceFormat: "XLSX",
  ...input,
});

const cellIsBlank = (cell: ExcelJS.Cell): boolean =>
  cell.value === null || cell.value === undefined || cell.value === "";

const assertNoWorkbookPayload = (workbook: ExcelJS.Workbook): void => {
  let materializedCells = 0;
  for (const worksheet of workbook.worksheets) {
    if (worksheet.state !== "visible") {
      failCatalogImport(
        diagnostic(
          "XLSX_SHEET_LAYOUT_MISMATCH",
          "UNSAFE_WORKBOOK_CONTENT",
          "Hidden and veryHidden worksheets are not permitted",
          { sheet: worksheet.name },
        ),
      );
    }
    for (const column of worksheet.columns) {
      if (column.hidden) {
        failCatalogImport(
          diagnostic(
            "XLSX_SHEET_LAYOUT_MISMATCH",
            "UNSAFE_WORKBOOK_CONTENT",
            "Hidden worksheet columns are not permitted",
            { sheet: worksheet.name },
          ),
        );
      }
    }
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.hidden) {
        failCatalogImport(
          diagnostic(
            "XLSX_SHEET_LAYOUT_MISMATCH",
            "UNSAFE_WORKBOOK_CONTENT",
            "Hidden worksheet rows are not permitted",
            { sheet: worksheet.name, row: row.number },
          ),
        );
      }
      row.eachCell({ includeEmpty: false }, (cell) => {
        materializedCells += 1;
        if (
          materializedCells >
          CATALOG_IMPORT_XLSX_LIMITS.maximumMaterializedCells
        ) {
          failCatalogImport(
            diagnostic(
              "OOXML_RESOURCE_LIMIT",
              "UNSAFE_WORKBOOK_CONTENT",
              "Workbook exceeds the materialized cell limit",
            ),
          );
        }
        if (cell.note !== undefined && cell.note !== null) {
          failCatalogImport(
            diagnostic(
              "XLSX_ACTIVE_CONTENT",
              "UNSAFE_WORKBOOK_CONTENT",
              "Workbook comments and notes are not permitted",
              {
                sheet: worksheet.name,
                row: row.number,
                cellReference: cell.address,
              },
            ),
          );
        }
        const value = cell.value;
        if (
          value !== null &&
          typeof value === "object" &&
          ("formula" in value || "sharedFormula" in value)
        ) {
          failCatalogImport(
            diagnostic(
              "XLSX_ACTIVE_CONTENT",
              "FORMULA_ACTIVE_CONTENT",
              "Workbook formulas are not permitted, including cached results",
              {
                sheet: worksheet.name,
                row: row.number,
                cellReference: cell.address,
              },
            ),
          );
        }
        if (cell.hyperlink !== undefined) {
          failCatalogImport(
            diagnostic(
              "XLSX_EXTERNAL_RELATIONSHIP",
              "UNSAFE_WORKBOOK_CONTENT",
              "Workbook hyperlinks are not accepted as canonical URL values",
              {
                sheet: worksheet.name,
                row: row.number,
                cellReference: cell.address,
              },
            ),
          );
        }
      });
    });
  }
};

const plainCellText = (
  worksheet: ExcelJS.Worksheet,
  cell: ExcelJS.Cell,
  machineHeader?: string,
): string => {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return failCatalogImport(
    diagnostic(
      "XLSX_UNSUPPORTED_CELL_TYPE",
      "UNSUPPORTED_CELL_TYPE",
      "Canonical input cells must contain plain text; numeric, date, boolean, error, formula, rich text, and hyperlink cells are rejected",
      {
        sheet: worksheet.name,
        row: Number(cell.row),
        ...(machineHeader === undefined ? {} : { machineHeader }),
        cellReference: cell.address,
      },
    ),
  );
};

const assertExactSheets = (workbook: ExcelJS.Workbook): void => {
  const actual = workbook.worksheets.map(({ name }) => name);
  const expected = new Set<string>(CATALOG_IMPORT_SHEET_NAMES);
  if (
    actual.length !== CATALOG_IMPORT_SHEET_NAMES.length ||
    actual.some((name) => !expected.has(name))
  ) {
    failCatalogImport(
      diagnostic(
        "XLSX_SHEET_LAYOUT_MISMATCH",
        "HEADER_LAYOUT",
        "Workbook must contain exactly the four catalog-import-xlsx/v1 sheets",
      ),
    );
  }
};

const assertMetadata = (workbook: ExcelJS.Workbook): void => {
  const instructions = workbook.getWorksheet("99_Instructions");
  if (instructions === undefined) {
    return failCatalogImport(
      diagnostic(
        "XLSX_SHEET_LAYOUT_MISMATCH",
        "HEADER_LAYOUT",
        "Workbook is missing 99_Instructions",
      ),
    );
  }
  const metadata = CATALOG_IMPORT_XLSX_LAYOUT_SPEC.instructions.metadata;
  const expectedCells = [
    [metadata.sectionCell, metadata.sectionLabel],
    [
      metadata.workbookLayoutVersion.keyCell,
      metadata.workbookLayoutVersion.key,
    ],
    [
      metadata.workbookLayoutVersion.valueCell,
      metadata.workbookLayoutVersion.value,
    ],
    [
      metadata.importContractVersion.keyCell,
      metadata.importContractVersion.key,
    ],
    [
      metadata.importContractVersion.valueCell,
      metadata.importContractVersion.value,
    ],
  ] as const;
  for (const [address, expected] of expectedCells) {
    const cell = instructions.getCell(address);
    const rowNumber = Number(cell.row);
    if (instructions.getRow(rowNumber).hidden) {
      failCatalogImport(
        diagnostic(
          "XLSX_METADATA_MISMATCH",
          "VERSION_METADATA",
          "Workbook technical metadata rows must remain visible",
          {
            sheet: instructions.name,
            row: rowNumber,
            cellReference: address,
          },
        ),
      );
    }
    const actual = plainCellText(instructions, cell);
    if (actual !== expected) {
      const versionCell =
        address === metadata.workbookLayoutVersion.valueCell ||
        address === metadata.importContractVersion.valueCell;
      failCatalogImport(
        diagnostic(
          versionCell
            ? "XLSX_WORKBOOK_VERSION_MISMATCH"
            : "XLSX_METADATA_MISMATCH",
          "VERSION_METADATA",
          versionCell
            ? "Workbook declares an unsupported layout or import contract version"
            : "Workbook technical metadata does not match catalog-import-xlsx/v1",
          {
            sheet: instructions.name,
            row: rowNumber,
            cellReference: address,
          },
        ),
      );
    }
  }
};

const dataRows = (
  worksheet: ExcelJS.Worksheet,
  fields: readonly { readonly machineHeader: string }[],
): LocatedCatalogImportTableRow[] => {
  if (
    worksheet.rowCount -
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.rowRoles.machineHeader >
    CATALOG_IMPORT_XLSX_LIMITS.maximumDataRowsPerSheet
  ) {
    failCatalogImport(
      diagnostic(
        "OOXML_RESOURCE_LIMIT",
        "UNSAFE_WORKBOOK_CONTENT",
        "Worksheet exceeds the editable data row limit",
        { sheet: worksheet.name },
      ),
    );
  }
  const expectedHeaders = fields.map(({ machineHeader }) => machineHeader);
  const machineHeaderRow =
    CATALOG_IMPORT_XLSX_LAYOUT_SPEC.rowRoles.machineHeader;
  const actualHeaders = expectedHeaders.map((_, index) =>
    plainCellText(worksheet, worksheet.getCell(machineHeaderRow, index + 1)),
  );
  if (new Set(actualHeaders).size !== actualHeaders.length) {
    failCatalogImport(
      diagnostic(
        "XLSX_HEADER_MISMATCH",
        "HEADER_LAYOUT",
        "Workbook contains duplicate machine headers",
        { sheet: worksheet.name, row: machineHeaderRow },
      ),
    );
  }
  for (const [index, expected] of expectedHeaders.entries()) {
    if (actualHeaders[index] !== expected) {
      failCatalogImport(
        diagnostic(
          "XLSX_HEADER_MISMATCH",
          "HEADER_LAYOUT",
          "Workbook machine headers do not match catalog-import/v1",
          {
            sheet: worksheet.name,
            row: machineHeaderRow,
            machineHeader: expected,
            cellReference: worksheet.getCell(machineHeaderRow, index + 1)
              .address,
          },
        ),
      );
    }
  }
  const lastColumn = expectedHeaders.length;
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    let hasUnexpectedData = false;
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      if (columnNumber > lastColumn && !cellIsBlank(cell)) {
        hasUnexpectedData = true;
      }
    });
    if (hasUnexpectedData) {
      failCatalogImport(
        diagnostic(
          "XLSX_SHEET_LAYOUT_MISMATCH",
          "HEADER_LAYOUT",
          "Workbook contains data outside the frozen machine columns",
          { sheet: worksheet.name, row: rowNumber },
        ),
      );
    }
  }
  const output: LocatedCatalogImportTableRow[] = [];
  for (
    let rowNumber = CATALOG_IMPORT_XLSX_LAYOUT_SPEC.rowRoles.firstEditableRow;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const values = Object.fromEntries(
      expectedHeaders.map((header, index) => [
        header,
        plainCellText(
          worksheet,
          worksheet.getCell(rowNumber, index + 1),
          header,
        ),
      ]),
    );
    if (Object.values(values).every((value) => value === "")) continue;
    output.push({
      values,
      location: {
        sourceFormat: "XLSX",
        sheet: worksheet.name,
        row: rowNumber,
      },
    });
  }
  return output;
};

const loadValidatedWorkbook = async (
  input: Uint8Array,
): Promise<{
  readonly workbook: ExcelJS.Workbook;
  readonly container: CatalogImportOoxmlPreflightResult;
  readonly sourceArtifactSha256: string;
}> => {
  const sourceArtifactSha256 = createHash("sha256").update(input).digest("hex");
  const container = await preflightCatalogImportOoxmlContainer(input);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(input).buffer, {
      // The frozen template applies compact validations through Row 1,048,576.
      // OOXML preflight has already validated the raw XML; materializing these
      // presentation-only rules would turn a small workbook into a memory DoS.
      ignoreNodes: ["dataValidations"],
    });
  } catch (error) {
    if (error instanceof CatalogImportDiagnosticError) throw error;
    failCatalogImport(
      diagnostic(
        "OOXML_INVALID_CONTAINER",
        "CONTAINER_OOXML",
        "Workbook OOXML could not be parsed",
        { file: "workbook.xlsx" },
      ),
    );
  }
  assertExactSheets(workbook);
  assertNoWorkbookPayload(workbook);
  assertMetadata(workbook);
  for (const [name, layout] of Object.entries(
    CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets,
  )) {
    const worksheet = workbook.getWorksheet(name);
    if (worksheet === undefined) {
      return failCatalogImport(
        diagnostic(
          "XLSX_SHEET_LAYOUT_MISMATCH",
          "HEADER_LAYOUT",
          "Workbook is missing a required data sheet",
          { sheet: name },
        ),
      );
    }
    dataRows(worksheet, layout.fields);
  }
  return { workbook, container, sourceArtifactSha256 };
};

export const preflightCatalogImportXlsxWorkbook = async (
  input: Uint8Array,
): Promise<CatalogImportXlsxPreflightResult> => {
  const validated = await loadValidatedWorkbook(input);
  return {
    ...validated.container,
    sourceArtifactSha256: validated.sourceArtifactSha256,
    sheets: validated.workbook.worksheets.map(({ name }) => name),
  };
};

export const parseCatalogImportXlsxWorkbook = async (
  input: Uint8Array,
): Promise<ParsedCatalogImportBundle> => {
  const validated = await loadValidatedWorkbook(input);
  const dataSheet = <
    Name extends keyof typeof CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets,
  >(
    name: Name,
  ) => {
    const worksheet = validated.workbook.getWorksheet(name);
    if (worksheet === undefined) {
      throw new Error(`Validated workbook is missing ${name}`);
    }
    return dataRows(
      worksheet,
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets[name].fields,
    );
  };
  return buildParsedCatalogImportBundle({
    sourceFormat: "XLSX",
    sourceArtifactSha256: validated.sourceArtifactSha256,
    catalogRows: dataSheet("01_Catalog"),
    aliasRows: dataSheet("02_Aliases"),
    provenanceRows: dataSheet("03_Provenance"),
  });
};

export const parseCatalogImportXlsxFile = async (
  filePath: string,
): Promise<ParsedCatalogImportBundle> => {
  const status = await lstat(filePath).catch(() => undefined);
  const sourceName = path.basename(filePath);
  if (status === undefined) {
    return failCatalogImport(
      diagnostic(
        "OOXML_INVALID_CONTAINER",
        "CONTAINER_OOXML",
        "Explicit XLSX input path must be a regular non-symlink file",
        { file: sourceName },
      ),
    );
  }
  if (status.isSymbolicLink() || !status.isFile()) {
    return failCatalogImport(
      diagnostic(
        "OOXML_INVALID_CONTAINER",
        "CONTAINER_OOXML",
        "Explicit XLSX input path must be a regular non-symlink file",
        { file: sourceName },
      ),
    );
  }
  if (status.size > CATALOG_IMPORT_XLSX_LIMITS.maximumCompressedBytes) {
    failCatalogImport(
      diagnostic(
        "OOXML_RESOURCE_LIMIT",
        "UNSAFE_WORKBOOK_CONTENT",
        "Workbook exceeds the compressed input size limit",
        { file: sourceName },
      ),
    );
  }
  return parseCatalogImportXlsxWorkbook(await readFile(filePath));
};
