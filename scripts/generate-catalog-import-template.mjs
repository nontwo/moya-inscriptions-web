#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ExcelJS from "exceljs";

import {
  CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS,
  CATALOG_IMPORT_XLSX_LAYOUT_SPEC,
  formatCatalogImportPresentationHeader,
} from "../packages/contracts/dist/internal/catalog-import/index.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const committedTemplate = path.join(
  repositoryRoot,
  "docs/catalog-import/catalog-import-v1-template.xlsx",
);
const fixedTimestamp = new Date("2026-08-13T00:00:00.000Z");
const thinBorder = { style: "thin", color: { argb: "FFD7DEE8" } };
const mediumBorder = { style: "medium", color: { argb: "FF5B6B82" } };

const parseArguments = (arguments_) => {
  let check = false;
  let output;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--check") {
      check = true;
      continue;
    }
    if (argument === "--output") {
      output = arguments_[index + 1];
      if (output === undefined) throw new Error("--output requires a path");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (check && output !== undefined)
    throw new Error("--check and --output cannot be combined");
  return { check, output };
};

const applyDataRowStyle = (worksheet, rowNumber, fields) => {
  const row = worksheet.getRow(rowNumber);
  row.height = 24;
  for (const [index, field] of fields.entries()) {
    const cell = row.getCell(index + 1);
    cell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: field.wrap === true,
    };
    cell.border = {
      top: thinBorder,
      left: thinBorder,
      bottom: thinBorder,
      right: thinBorder,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: field.stateColumn === true ? "FFF3F7FB" : "FFFFFFFF" },
    };
    if (field.textPreserving === true) cell.numFmt = "@";
  }
};

const applyHeaderStyles = (worksheet, fields) => {
  const presentation = worksheet.getRow(1);
  presentation.height = 34;
  const machine = worksheet.getRow(2);
  machine.height = 30;
  for (const [index, field] of fields.entries()) {
    const presentationCell = presentation.getCell(index + 1);
    presentationCell.font = {
      bold: true,
      color: { argb: "FF18324A" },
      size: 11,
    };
    presentationCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: field.stateColumn === true ? "FFE9F1F8" : "FFDCEAF5" },
    };
    presentationCell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: true,
    };
    presentationCell.border = {
      top: thinBorder,
      left: thinBorder,
      bottom: mediumBorder,
      right: thinBorder,
    };

    const machineCell = machine.getCell(index + 1);
    machineCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    machineCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: field.stateColumn === true ? "FF3F5F79" : "FF223B53" },
    };
    machineCell.alignment = {
      vertical: "middle",
      horizontal: "left",
      wrapText: false,
    };
    machineCell.border = {
      top: thinBorder,
      left: thinBorder,
      bottom: mediumBorder,
      right: thinBorder,
    };
  }
};

const validationFormula = (values) => `"${values.join(",")}"`;

const addDataSheet = (workbook, name, sheetLayout, syntheticRow) => {
  const worksheet = workbook.addWorksheet(name, {
    properties: { defaultRowHeight: 20 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    views: [
      {
        state: "frozen",
        xSplit: sheetLayout.freeze.xSplit,
        ySplit: sheetLayout.freeze.ySplit,
        activeCell: sheetLayout.freeze.topLeftCell,
        showGridLines: true,
      },
    ],
  });
  worksheet.views[0].showGridLines = true;
  worksheet.columns = sheetLayout.fields.map((field) => ({
    width: field.width,
  }));
  worksheet.getRow(1).values = sheetLayout.fields.map((field) =>
    formatCatalogImportPresentationHeader(
      field.presentationHeader,
      field.requiredness,
    ),
  );
  const tableRows = [sheetLayout.fields.map(() => null)];
  if (syntheticRow !== undefined) tableRows.push(syntheticRow);
  worksheet.addTable({
    name: sheetLayout.tableName,
    ref: "A2",
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleLight8",
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: false,
      showColumnStripes: false,
    },
    columns: sheetLayout.fields.map((field) => ({
      name: field.machineHeader,
      filterButton: true,
    })),
    rows: tableRows,
  });
  applyHeaderStyles(worksheet, sheetLayout.fields);
  applyDataRowStyle(worksheet, 3, sheetLayout.fields);
  if (syntheticRow !== undefined)
    applyDataRowStyle(worksheet, 4, sheetLayout.fields);

  for (const [index, field] of sheetLayout.fields.entries()) {
    if (field.validation === undefined) continue;
    const column = worksheet.getColumn(index + 1).letter;
    const validation =
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.validations[field.validation];
    worksheet.dataValidations.add(
      `${column}${CATALOG_IMPORT_XLSX_LAYOUT_SPEC.rowRoles.firstEditableRow}:${column}${CATALOG_IMPORT_XLSX_LAYOUT_SPEC.rowRoles.lastEditableRow}`,
      {
        type: "list",
        allowBlank: true,
        showInputMessage: true,
        showErrorMessage: true,
        errorStyle: "stop",
        promptTitle: validation.promptTitle,
        prompt: validation.prompt,
        errorTitle: "值不符合 catalog-import/v1",
        error: `请从下拉清单选择：${validation.values.join(" / ")}`,
        formulae: [validationFormula(validation.values)],
      },
    );
  }
  return worksheet;
};

const addSectionHeading = (worksheet, row, title) => {
  worksheet.mergeCells(`A${row}:F${row}`);
  const cell = worksheet.getCell(`A${row}`);
  cell.value = title;
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 13 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF355C7D" },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(row).height = 24;
};

const addInstructionLine = (worksheet, row, value) => {
  worksheet.mergeCells(`A${row}:F${row}`);
  const cell = worksheet.getCell(`A${row}`);
  cell.value = value;
  cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  cell.font = { size: 11, color: { argb: "FF263746" } };
  worksheet.getRow(row).height = 28;
};

const addInstructionsSheet = (workbook) => {
  const spec = CATALOG_IMPORT_XLSX_LAYOUT_SPEC;
  const worksheet = workbook.addWorksheet("99_Instructions", {
    properties: { defaultRowHeight: 20 },
    views: [
      { state: "frozen", ySplit: 2, activeCell: "A3", showGridLines: true },
    ],
  });
  worksheet.views[0].showGridLines = true;
  worksheet.columns = [
    { width: 25 },
    { width: 28 },
    { width: 25 },
    { width: 22 },
    { width: 58 },
    { width: 20 },
  ];
  worksheet.mergeCells("A1:F1");
  worksheet.getCell("A1").value = spec.instructions.title;
  worksheet.getCell("A1").font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 18,
  };
  worksheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF17324D" },
  };
  worksheet.getCell("A1").alignment = {
    vertical: "middle",
    horizontal: "left",
  };
  worksheet.getRow(1).height = 34;
  worksheet.mergeCells("A2:F2");
  worksheet.getCell("A2").value =
    "本文件是 Owner / Editor working template；PostgreSQL 才是 canonical runtime source of truth。请复制模板后填写具体 batch，不要直接编辑正式模板。";
  worksheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  worksheet.getCell("A2").font = { color: { argb: "FF4A5B69" }, italic: true };
  worksheet.getRow(2).height = 34;

  addSectionHeading(worksheet, 4, "A. Owner 快速开始");
  const quickStart = [
    "1. 复制本模板，建立一个具体 batch workbook；不要直接修改正式模板。",
    "2. 新建 Catalog：catalogId 留空；更新 Catalog：catalogId 必须填写既有且不可变的目标 ID。",
    "3. 每条 01_Catalog 都要填写 catalogImportId、sourceId、title、catalogKind。",
    "4. 子表用 catalogImportId 关联 01_Catalog；catalogImportId ≠ sourceId ≠ catalogId。",
    "5. value 有内容时，state 留空或选 VALUE；state 的英文 machine value 不翻译。",
    "6. blank 或 UNSUPPLIED 表示本批次未提供；UNKNOWN 表示未知；NOT_APPLICABLE 表示不适用。",
    "7. CLEAR 才表示请求清除，并需要逐字段审批；blank ≠ delete。",
    "8. aliasType 只允许 alternate / historical；CatalogKind 只允许 inscription / calligraphy。",
    "9. duplicate 只产生候选，不自动 merge、改写 CatalogId 或解除 blocker。",
    "10. 成功 Import ≠ Publish；导入不改变 publication lifecycle。",
  ];
  quickStart.forEach((line, index) =>
    addInstructionLine(worksheet, 5 + index, line),
  );

  addSectionHeading(worksheet, 17, "B. Identity / State / Location guidance");
  const identityGuidance = [
    "Identity：catalogImportId 是 batch-local 关联键；sourceId 是来源记录身份；catalogId 是 Catalog 身份。三者不可互换。CatalogId / SourceId linkage conflict 不可审批、不可 Apply。",
    "State：事实字段使用 VALUE / UNSUPPLIED / UNKNOWN / NOT_APPLICABLE / CLEAR；description 仅使用 VALUE / UNSUPPLIED / CLEAR。state 为 UNKNOWN、NOT_APPLICABLE 或 CLEAR 时，value 必须为空。",
    "Location：province / prefecture / county 是行政区；currentLocation 是具体地点或遗址；currentCustodian 是当前管理或保管机构。",
    "纯 synthetic 示例：province=福建省，prefecture=泉州市，county=洛江区，currentLocation=万安某处，currentCustodian=某文物管理机构。该示例不是 production data。",
    "SourceId mirroring：03_Provenance 可在相同 catalogImportId 下镜像主表 sourceId 以扩展同一 SourceRecord metadata；重复 pair 或跨 Catalog 绑定冲突会失败。",
  ];
  identityGuidance.forEach((line, index) =>
    addInstructionLine(worksheet, 18 + index, line),
  );

  addSectionHeading(worksheet, 25, "C. Field Guide");
  worksheet.getRow(26).values = [
    "Sheet",
    "中文名称",
    "Machine header",
    "Requiredness",
    "如何填写",
    "示例",
  ];
  for (let column = 1; column <= 6; column += 1) {
    const cell = worksheet.getCell(26, column);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4C708D" },
    };
    cell.alignment = { wrapText: true, vertical: "middle" };
    cell.border = {
      top: thinBorder,
      left: thinBorder,
      bottom: mediumBorder,
      right: thinBorder,
    };
  }
  let guideRow = 27;
  for (const [sheetName, sheetLayout] of Object.entries(spec.dataSheets)) {
    for (const field of sheetLayout.fields) {
      worksheet.getRow(guideRow).values = [
        sheetName,
        field.presentationHeader,
        field.machineHeader,
        CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS[field.requiredness],
        field.guidance,
        field.example,
      ];
      worksheet.getRow(guideRow).height = 32;
      for (let column = 1; column <= 6; column += 1) {
        const cell = worksheet.getCell(guideRow, column);
        cell.alignment = { wrapText: true, vertical: "top" };
        cell.border = {
          top: thinBorder,
          left: thinBorder,
          bottom: thinBorder,
          right: thinBorder,
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: guideRow % 2 === 0 ? "FFF6F9FC" : "FFFFFFFF" },
        };
      }
      guideRow += 1;
    }
  }

  addSectionHeading(
    worksheet,
    61,
    "D. Advanced persistence / approval / hash notes",
  );
  const advanced = [
    "当前 Apply 有硬性 persistence-gap gate：temporal/region/location/custodian、aliasType、SourceRecord/provenance 与 durable Import Batch audit 未闭合前不得无损 Apply。Approval 不能授权 silent loss。",
    "Alias row 受 ALIAS_TYPE_STORAGE_REQUIRED 阻断；raw provenance 受 PROVENANCE_STORAGE_REQUIRED 阻断。不得部分写入或用 audit preservation 冒充 domain persistence。",
    "Identity conflict 始终不可 approval；Level A/B critical changes 需要 field-level approval；每个 CLEAR 都需要 field-level approval。",
    "Approval 绑定 importContractVersion、canonicalInputSha256、dryRunResultSha256。canonicalInputSha256 由 validated canonical rows 按稳定业务键排序后计算；单纯重排 workbook rows 不改变 semantic hash。sourceArtifactSha256 只承担文件级审计。",
    "本 template 不包含 parser、diff、dry-run runtime、apply、database write、migration、Admin、publication、media 或 production data。",
  ];
  advanced.forEach((line, index) =>
    addInstructionLine(worksheet, 62 + index, line),
  );

  const metadata = spec.instructions.metadata;
  worksheet.getCell(metadata.sectionCell).value = metadata.sectionLabel;
  worksheet.getCell(metadata.sectionCell).font = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 13,
  };
  worksheet.getCell(metadata.sectionCell).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF355C7D" },
  };
  worksheet.getCell(metadata.workbookLayoutVersion.keyCell).value =
    metadata.workbookLayoutVersion.key;
  worksheet.getCell(metadata.workbookLayoutVersion.valueCell).value =
    metadata.workbookLayoutVersion.value;
  worksheet.getCell(metadata.importContractVersion.keyCell).value =
    metadata.importContractVersion.key;
  worksheet.getCell(metadata.importContractVersion.valueCell).value =
    metadata.importContractVersion.value;
  for (const address of [
    metadata.workbookLayoutVersion.keyCell,
    metadata.workbookLayoutVersion.valueCell,
    metadata.importContractVersion.keyCell,
    metadata.importContractVersion.valueCell,
  ]) {
    const cell = worksheet.getCell(address);
    cell.numFmt = "@";
    cell.border = {
      top: thinBorder,
      left: thinBorder,
      bottom: thinBorder,
      right: thinBorder,
    };
  }
  return worksheet;
};

const syntheticRows = {
  "01_Catalog": [
    "synthetic-001",
    "synthetic-source-001",
    null,
    "纯合成测试条目",
    "inscription",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
  ],
  "02_Aliases": ["synthetic-001", "纯合成别名", "alternate"],
  "03_Provenance": [
    "synthetic-001",
    "synthetic-source-001",
    "纯合成来源",
    "synthetic",
    "https://example.invalid/source",
    "仅供 generator check",
  ],
};

export const createCatalogImportWorkbook = ({ synthetic = false } = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Moya catalog-import dev generator";
  workbook.lastModifiedBy = "Moya catalog-import dev generator";
  workbook.created = fixedTimestamp;
  workbook.modified = fixedTimestamp;
  workbook.lastPrinted = fixedTimestamp;
  workbook.company = "Moya";
  workbook.title = "Moya Catalog Import v1 Owner Template";
  workbook.subject = "Safe blank catalog-import/v1 workbook";
  workbook.keywords = "catalog-import/v1 catalog-import-xlsx/v1 owner template";
  workbook.category = "Internal Owner Data Preparation";
  workbook.description =
    "Generated from the internal catalog import workbook layout specification.";
  workbook.calcProperties.fullCalcOnLoad = false;
  workbook.calcProperties.forceFullCalc = false;
  workbook.calcProperties.calcMode = "manual";

  for (const [name, sheetLayout] of Object.entries(
    CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets,
  )) {
    addDataSheet(
      workbook,
      name,
      sheetLayout,
      synthetic ? syntheticRows[name] : undefined,
    );
  }
  addInstructionsSheet(workbook);
  return workbook;
};

export const generateCatalogImportTemplate = async (
  output,
  { synthetic = false } = {},
) => {
  const workbook = createCatalogImportWorkbook({ synthetic });
  await mkdir(path.dirname(output), { recursive: true });
  await workbook.xlsx.writeFile(output, {
    useStyles: true,
    useSharedStrings: true,
  });
};

/** Observable OOXML-part fingerprint; ZIP container metadata is intentionally excluded. */
const collectFiles = async (directory, prefix = "") => {
  const parts = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      parts.push(
        ...(await collectFiles(path.join(directory, entry.name), relative)),
      );
    } else if (entry.isFile()) {
      parts.push(relative);
    }
  }
  return parts;
};

const observableFingerprint = async (file, directory) => {
  await mkdir(directory, { recursive: true });
  execFileSync("unzip", ["-qq", file, "-d", directory]);
  const parts = (await collectFiles(directory)).sort();
  const entries = [];
  for (const part of parts) {
    const content = await readFile(path.join(directory, ...part.split("/")));
    entries.push({
      part,
      sha256: createHash("sha256").update(content).digest("hex"),
      size: content.byteLength,
    });
  }
  return entries;
};

const checkReopenAndExpansion = async (blankFile, directory) => {
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.readFile(blankFile, { ignoreNodes: ["dataValidations"] });
  assert.deepEqual(
    reopened.worksheets.map((sheet) => sheet.name),
    CATALOG_IMPORT_XLSX_LAYOUT_SPEC.sheetOrder,
  );
  for (const [name, sheetLayout] of Object.entries(
    CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets,
  )) {
    const sheet = reopened.getWorksheet(name);
    assert.ok(sheet, `Missing ${name} after public-library reopen`);
    assert.equal(sheet.rowCount, 3, `${name} must stop at physical Row 3`);
    assert.equal(sheet.views[0].state, "frozen");
    assert.equal(sheet.views[0].xSplit, sheetLayout.freeze.xSplit);
    assert.equal(sheet.views[0].ySplit, sheetLayout.freeze.ySplit);
    assert.equal(sheet.getCell("A3").border.bottom.style, "thin");
  }

  const expansionFile = path.join(
    directory,
    "catalog-import-expanded-smoke.xlsx",
  );
  await generateCatalogImportTemplate(expansionFile, { synthetic: true });
  const expanded = new ExcelJS.Workbook();
  await expanded.xlsx.readFile(expansionFile, {
    ignoreNodes: ["dataValidations"],
  });
  for (const [sheetIndex, [name, sheetLayout]] of Object.entries(
    CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets,
  ).entries()) {
    const sheet = expanded.getWorksheet(name);
    assert.ok(sheet);
    assert.equal(sheet.rowCount, 4);
    const table = sheet.getTable(sheetLayout.tableName).table;
    const expandedRef = sheetLayout.tableRef.replace(/3$/, "4");
    assert.equal(table.tableRef, expandedRef);
    assert.equal(table.autoFilterRef, expandedRef);
    assert.deepEqual(
      table.columns.map((column) => column.name),
      sheetLayout.fields.map((field) => field.machineHeader),
    );
    assert.equal(sheet.getCell("A4").numFmt, "@");
    assert.equal(sheet.getCell("A4").border.bottom.style, "thin");
    const worksheetXml = execFileSync("unzip", [
      "-p",
      expansionFile,
      `xl/worksheets/sheet${sheetIndex + 1}.xml`,
    ]).toString("utf8");
    for (const [fieldIndex, field] of sheetLayout.fields.entries()) {
      if (field.validation === undefined) continue;
      const column = sheet.getColumn(fieldIndex + 1).letter;
      assert.match(
        worksheetXml,
        new RegExp(`sqref="${column}3:${column}1048576"`),
      );
    }
  }
};

const checkCommittedTemplate = async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "moya-catalog-import-check-"),
  );
  try {
    const generated = path.join(directory, "catalog-import-v1-template.xlsx");
    await generateCatalogImportTemplate(generated);
    const [committed, fresh] = await Promise.all([
      observableFingerprint(
        committedTemplate,
        path.join(directory, "committed"),
      ),
      observableFingerprint(generated, path.join(directory, "generated")),
    ]);
    assert.deepEqual(
      fresh,
      committed,
      "Committed XLSX observable OOXML parts are stale; run pnpm generate:catalog-import-template",
    );
    await checkReopenAndExpansion(generated, directory);
    const bytes = await readFile(generated);
    console.log(
      `Catalog Import template is current (${bytes.byteLength} bytes; observable OOXML equivalent).`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { check, output } = parseArguments(process.argv.slice(2));
  if (check) {
    await checkCommittedTemplate();
  } else {
    const destination =
      output === undefined ? committedTemplate : path.resolve(output);
    await generateCatalogImportTemplate(destination);
    console.log(`Generated ${destination}`);
  }
}
