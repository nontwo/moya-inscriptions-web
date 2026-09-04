import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";

import {
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_SHEET_NAMES,
  CATALOG_IMPORT_V2_CONTRACT_VERSION,
  CATALOG_IMPORT_V2_SHEET_NAMES,
  CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC,
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
import type { SupportedImportContractVersion } from "@moya/contracts/internal/catalog-import";
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
    for (const column of worksheet.columns ?? []) {
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
  if (typeof value === "string") {
    if (value.length > 32_767) {
      return failCatalogImport(
        diagnostic(
          "OOXML_RESOURCE_LIMIT",
          "UNSAFE_WORKBOOK_CONTENT",
          "Plain-text XLSX cells may not exceed 32,767 UTF-16 code units",
          {
            sheet: worksheet.name,
            row: Number(cell.row),
            ...(machineHeader === undefined ? {} : { machineHeader }),
            cellReference: cell.address,
          },
        ),
      );
    }
    return value;
  }
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

type CatalogImportXlsxLayoutSpec =
  | typeof CATALOG_IMPORT_XLSX_LAYOUT_SPEC
  | typeof CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC;

const layoutForVersion = (
  importContractVersion: SupportedImportContractVersion,
): CatalogImportXlsxLayoutSpec =>
  importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION
    ? CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC
    : CATALOG_IMPORT_XLSX_LAYOUT_SPEC;

const assertExactSheets = (
  workbook: ExcelJS.Workbook,
  importContractVersion: SupportedImportContractVersion,
): void => {
  const actual = workbook.worksheets.map(({ name }) => name);
  const expectedSheetNames =
    importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION
      ? CATALOG_IMPORT_V2_SHEET_NAMES
      : CATALOG_IMPORT_SHEET_NAMES;
  const expected = new Set<string>(expectedSheetNames);
  if (
    actual.length !== expectedSheetNames.length ||
    actual.some((name) => !expected.has(name))
  ) {
    failCatalogImport(
      diagnostic(
        "XLSX_SHEET_LAYOUT_MISMATCH",
        "HEADER_LAYOUT",
        `Workbook sheets do not match the exact ${importContractVersion} layout`,
      ),
    );
  }
};

const instructionsSheet = (workbook: ExcelJS.Workbook): ExcelJS.Worksheet => {
  const matches = workbook.worksheets.filter(
    ({ name }) => name === "99_Instructions",
  );
  if (matches.length !== 1 || matches[0] === undefined) {
    return failCatalogImport(
      diagnostic(
        "XLSX_SHEET_LAYOUT_MISMATCH",
        "VERSION_METADATA",
        "Workbook requires exactly one visible 99_Instructions sheet",
      ),
    );
  }
  return matches[0];
};

const readDeclaredVersion = (
  workbook: ExcelJS.Workbook,
): SupportedImportContractVersion => {
  const instructions = instructionsSheet(workbook);
  const declares = (layout: CatalogImportXlsxLayoutSpec) => {
    const metadata = layout.instructions.metadata;
    return (
      instructions.getCell(metadata.workbookLayoutVersion.valueCell).value ===
        layout.workbookLayoutVersion &&
      instructions.getCell(metadata.importContractVersion.valueCell).value ===
        layout.importContractVersion
    );
  };
  if (declares(CATALOG_IMPORT_XLSX_LAYOUT_SPEC)) {
    return CATALOG_IMPORT_CONTRACT_VERSION;
  }
  if (declares(CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC)) {
    return CATALOG_IMPORT_V2_CONTRACT_VERSION;
  }
  return failCatalogImport(
    diagnostic(
      "XLSX_WORKBOOK_VERSION_MISMATCH",
      "VERSION_METADATA",
      "Workbook declares an unsupported or mismatched layout/import contract version pair",
      { sheet: instructions.name },
    ),
  );
};

const assertMetadata = (
  workbook: ExcelJS.Workbook,
  layout: CatalogImportXlsxLayoutSpec,
): void => {
  const instructions = instructionsSheet(workbook);
  const metadata = layout.instructions.metadata;
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
            : `Workbook technical metadata does not match ${layout.workbookLayoutVersion}`,
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

interface LoadedTableModel {
  readonly name?: unknown;
  readonly displayName?: unknown;
  readonly tableRef?: unknown;
  readonly autoFilterRef?: unknown;
  readonly headerRow?: unknown;
  readonly totalsRow?: unknown;
  readonly columns?: readonly { readonly name?: unknown }[];
}

const assertExactTable = (
  worksheet: ExcelJS.Worksheet,
  expected: {
    readonly tableName: string;
    readonly tableRef: string;
    readonly fields: readonly { readonly machineHeader: string }[];
  },
): number => {
  const tables = worksheet.getTables() as unknown as readonly ExcelJS.Table[];
  const table = tables[0];
  const model = (table as unknown as { readonly model?: LoadedTableModel })
    ?.model;
  const expectedHeaders = expected.fields.map(
    ({ machineHeader }) => machineHeader,
  );
  const actualHeaders = model?.columns?.map(({ name }) => name);
  const expectedReference = /^([A-Z]+)([0-9]+):([A-Z]+)([0-9]+)$/.exec(
    expected.tableRef,
  );
  const actualReference =
    typeof model?.tableRef === "string"
      ? /^([A-Z]+)([0-9]+):([A-Z]+)([0-9]+)$/.exec(model.tableRef)
      : null;
  const referenceMatches =
    expectedReference !== null &&
    actualReference !== null &&
    actualReference[1] === expectedReference[1] &&
    actualReference[2] === expectedReference[2] &&
    actualReference[3] === expectedReference[3] &&
    Number(actualReference[4]) >= Number(expectedReference[4]) &&
    Number(actualReference[4]) <=
      CATALOG_IMPORT_XLSX_LIMITS.maximumWorksheetRows;
  if (
    tables.length !== 1 ||
    table === undefined ||
    model === undefined ||
    model.name !== expected.tableName ||
    model.displayName !== expected.tableName ||
    !referenceMatches ||
    model.autoFilterRef !== model.tableRef ||
    model.headerRow !== true ||
    model.totalsRow !== false ||
    actualHeaders?.length !== expectedHeaders.length ||
    actualHeaders.some((header, index) => header !== expectedHeaders[index])
  ) {
    failCatalogImport(
      diagnostic(
        "XLSX_SHEET_LAYOUT_MISMATCH",
        "HEADER_LAYOUT",
        `Worksheet table must use ${expected.tableName} and the ${expected.tableRef} column boundary`,
        { sheet: worksheet.name },
      ),
    );
  }
  return Number(actualReference?.[4]);
};

const dataRows = (
  worksheet: ExcelJS.Worksheet,
  fields: readonly { readonly machineHeader: string }[],
  layout: CatalogImportXlsxLayoutSpec,
  tableLastRow?: number,
): LocatedCatalogImportTableRow[] => {
  if (
    worksheet.rowCount - layout.rowRoles.machineHeader >
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
  const machineHeaderRow = layout.rowRoles.machineHeader;
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
          `Workbook machine headers do not match ${layout.importContractVersion}`,
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
    if (
      tableLastRow !== undefined &&
      rowNumber > tableLastRow &&
      expectedHeaders.some(
        (_, index) => !cellIsBlank(worksheet.getCell(rowNumber, index + 1)),
      )
    ) {
      failCatalogImport(
        diagnostic(
          "XLSX_SHEET_LAYOUT_MISMATCH",
          "HEADER_LAYOUT",
          "Workbook contains data outside the declared import table",
          { sheet: worksheet.name, row: rowNumber },
        ),
      );
    }
  }
  const output: LocatedCatalogImportTableRow[] = [];
  const lastDataRow = tableLastRow ?? worksheet.rowCount;
  for (
    let rowNumber = layout.rowRoles.firstEditableRow;
    rowNumber <= lastDataRow;
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
  readonly importContractVersion: SupportedImportContractVersion;
  readonly layout: CatalogImportXlsxLayoutSpec;
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
  assertNoWorkbookPayload(workbook);
  const importContractVersion = readDeclaredVersion(workbook);
  const layout = layoutForVersion(importContractVersion);
  assertExactSheets(workbook, importContractVersion);
  assertMetadata(workbook, layout);
  for (const [name, sheetLayout] of Object.entries(layout.dataSheets)) {
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
    const tableLastRow =
      importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION
        ? assertExactTable(worksheet, sheetLayout)
        : undefined;
    dataRows(worksheet, sheetLayout.fields, layout, tableLastRow);
  }
  return {
    workbook,
    container,
    sourceArtifactSha256,
    importContractVersion,
    layout,
  };
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
  const dataSheet = (name: string) => {
    const worksheet = validated.workbook.getWorksheet(name);
    if (worksheet === undefined) {
      throw new Error(`Validated workbook is missing ${name}`);
    }
    const sheetLayout = Object.entries(validated.layout.dataSheets).find(
      ([sheetName]) => sheetName === name,
    )?.[1];
    if (sheetLayout === undefined) {
      throw new Error(`Validated layout is missing ${name}`);
    }
    const tableLastRow =
      validated.importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION
        ? assertExactTable(worksheet, sheetLayout)
        : undefined;
    return dataRows(
      worksheet,
      sheetLayout.fields,
      validated.layout,
      tableLastRow,
    );
  };
  if (validated.importContractVersion === CATALOG_IMPORT_V2_CONTRACT_VERSION) {
    return buildParsedCatalogImportBundle({
      sourceFormat: "XLSX",
      sourceArtifactSha256: validated.sourceArtifactSha256,
      importContractVersion: validated.importContractVersion,
      catalogRows: dataSheet("01_Catalog"),
      aliasRows: dataSheet("02_Aliases"),
      provenanceRows: dataSheet("03_Provenance"),
      contributorRows: dataSheet("04_Contributors"),
      publicCitationRows: dataSheet("05_Public_Citations"),
    });
  }
  return buildParsedCatalogImportBundle({
    sourceFormat: "XLSX",
    sourceArtifactSha256: validated.sourceArtifactSha256,
    importContractVersion: validated.importContractVersion,
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
