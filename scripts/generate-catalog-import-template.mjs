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
  CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC,
  CATALOG_IMPORT_XLSX_LAYOUT_SPEC,
  formatCatalogImportPresentationHeader,
} from "../packages/contracts/dist/internal/catalog-import/index.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const committedTemplates = {
  v1: path.join(
    repositoryRoot,
    "docs/catalog-import/catalog-import-v1-template.xlsx",
  ),
  v2: path.join(
    repositoryRoot,
    "docs/catalog-import/catalog-import-v2-template.xlsx",
  ),
};
const layoutSpecs = {
  v1: CATALOG_IMPORT_XLSX_LAYOUT_SPEC,
  v2: CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC,
};
const fixedTimestamp = new Date("2026-08-13T00:00:00.000Z");
const thinBorder = { style: "thin", color: { argb: "FFD7DEE8" } };
const mediumBorder = { style: "medium", color: { argb: "FF5B6B82" } };

const parseArguments = (arguments_) => {
  let check = false;
  let output;
  let version = "v1";
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
    if (argument === "--version") {
      const requestedVersion = arguments_[index + 1];
      if (requestedVersion !== "v1" && requestedVersion !== "v2") {
        throw new Error("--version requires v1 or v2");
      }
      version = requestedVersion;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (check && output !== undefined)
    throw new Error("--check and --output cannot be combined");
  return { check, output, version };
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

const addDataSheet = (
  workbook,
  name,
  sheetLayout,
  layoutSpec,
  syntheticRow,
) => {
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
    const validation = layoutSpec.validations[field.validation];
    worksheet.dataValidations.add(
      `${column}${layoutSpec.rowRoles.firstEditableRow}:${column}${layoutSpec.rowRoles.lastEditableRow}`,
      {
        type: "list",
        allowBlank: true,
        showInputMessage: true,
        showErrorMessage: true,
        errorStyle: "stop",
        promptTitle: validation.promptTitle,
        prompt: validation.prompt,
        errorTitle: `值不符合 ${layoutSpec.importContractVersion}`,
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

const addInstructionsSheet = (workbook, spec) => {
  const isV2 = spec.importContractVersion === "catalog-import/v2";
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
  worksheet.getCell("A2").value = isV2
    ? "本文件是 catalog-import/v2 Owner / Editor working template；PostgreSQL 才是 canonical runtime source of truth。请复制模板后填写具体 batch，不要直接编辑正式模板。"
    : "本文件是 Owner / Editor working template；PostgreSQL 才是 canonical runtime source of truth。请复制模板后填写具体 batch，不要直接编辑正式模板。";
  worksheet.getCell("A2").alignment = { wrapText: true, vertical: "middle" };
  worksheet.getCell("A2").font = { color: { argb: "FF4A5B69" }, italic: true };
  worksheet.getRow(2).height = 34;

  addSectionHeading(worksheet, 4, "A. Owner 快速开始");
  const quickStart = isV2
    ? [
        "1. 复制本模板，建立一个具体 batch workbook；不要直接修改正式模板。",
        "2. 新建 Catalog：catalogId 留空；更新 Catalog：catalogId 必须填写既有且不可变的目标 ID。",
        "3. 每条 01_Catalog 都要填写 catalogImportId、sourceId、title、catalogKind。",
        "4. 五个数据表都用 catalogImportId 关联 01_Catalog；catalogImportId ≠ sourceId ≠ catalogId。",
        "5. summary / periodLabel 是无 state 的直接可选文本；留空表示省略且不清除既有值。",
        "6. 其余 value 有内容时，state 留空或选 VALUE；state 与 action 的英文 machine value 不翻译。blank 或 UNSUPPLIED 表示本批次未提供。",
        "7. CLEAR 才表示请求清除，并需要逐字段审批；blank ≠ delete。",
        "8. contributorsAction / publicCitationsAction 留空等同 PRESERVE；REPLACE 必须提供子表行。",
        "9. duplicate 只产生候选，不自动 merge、改写 CatalogId 或解除 blocker。",
        "10. 成功 Import ≠ Publish；导入不改变 publication lifecycle。",
      ]
    : [
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
  const identityGuidance = isV2
    ? [
        "Identity：catalogImportId 是 batch-local 关联键；sourceId 是来源记录身份；catalogId 是 Catalog 身份。三者不可互换。CatalogId / SourceId linkage conflict 不可审批、不可 Apply。",
        "State：summary / periodLabel 没有 state 或 CLEAR；一般事实字段与 scriptStyle 可用五种 state；description 与三个长文本字段仅用 VALUE / UNSUPPLIED / CLEAR。非 VALUE state 时 value 必须为空。",
        "Location：province / prefecture / county 是行政区；currentLocation 是具体地点或遗址；currentCustodian 是当前管理或保管机构。",
        "纯 synthetic 示例：province=福建省，prefecture=泉州市，county=洛江区，currentLocation=万安某处，currentCustodian=某文物管理机构。该示例不是 production data。",
        "SourceId persistence：每条 01_Catalog 在 Apply 时都需要一条相同 catalogImportId + sourceId 的 03_Provenance 主来源行；可另加其他来源。重复 pair 或跨 Catalog 绑定冲突会失败。",
      ]
    : [
        "Identity：catalogImportId 是 batch-local 关联键；sourceId 是来源记录身份；catalogId 是 Catalog 身份。三者不可互换。CatalogId / SourceId linkage conflict 不可审批、不可 Apply。",
        "State：事实字段使用 VALUE / UNSUPPLIED / UNKNOWN / NOT_APPLICABLE / CLEAR；description 仅使用 VALUE / UNSUPPLIED / CLEAR。state 为 UNKNOWN、NOT_APPLICABLE 或 CLEAR 时，value 必须为空。",
        "Location：province / prefecture / county 是行政区；currentLocation 是具体地点或遗址；currentCustodian 是当前管理或保管机构。",
        "纯 synthetic 示例：province=福建省，prefecture=泉州市，county=洛江区，currentLocation=万安某处，currentCustodian=某文物管理机构。该示例不是 production data。",
        "SourceId persistence：每条 01_Catalog 在 Apply 时都需要一条相同 catalogImportId + sourceId 的 03_Provenance 主来源行；可另加其他来源。重复 pair 或跨 Catalog 绑定冲突会失败。",
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

  const advancedSectionRow = isV2 ? 82 : 61;
  addSectionHeading(
    worksheet,
    advancedSectionRow,
    "D. Advanced persistence / approval / hash notes",
  );
  const advanced = isV2
    ? [
        "V2 Apply 支持 summary / periodLabel、既有字段、四个 stateful 内容字段、contributors 与 curated public citations；ownerNote 与既有 alias-update ambiguity 仍然 fail closed。",
        "PRESERVE 不改集合；REPLACE 以完整子表集合取代旧集合；CLEAR 删除完整集合。Create candidate 不允许 CLEAR。",
        "Public citation 的 appliesTo 留空表示省略（semantic scope=record）；非空只用 | 连接无空格、无重复的精确 machine scope。",
        "Identity conflict 始终不可 approval；Level A/B critical changes 与每个 CLEAR 需要 field-level approval；Level C 普通变更可用 batch approval。",
        "Approval 绑定 importContractVersion、canonicalInputSha256、dryRunResultSha256。validated canonical rows 按稳定业务键排序；单纯重排行不改变 semantic hash。",
        "本 template 不包含发布、媒体、Admin UI、Research/CMS/Person/Institution/Place taxonomy 或 production data。",
      ]
    : [
        "当前 Apply 已支持：title / CatalogKind、事实字段 value/state、description、alias / aliasType、SourceId / provenance metadata，以及 durable Import Batch audit。",
        "仍然 fail closed：supplied ownerNote 不会静默丢弃；alias collection UPDATE 的 replace / merge / delete semantics 尚未定义。",
        "Research evidence、Owner research decisions/state 与 external ResearchRecord / SQLite state 不属于 catalog-import/v1。",
        "Identity conflict 始终不可 approval；Level A/B critical changes 需要 field-level approval；每个 CLEAR 都需要 field-level approval。",
        "Approval 绑定 importContractVersion、canonicalInputSha256、dryRunResultSha256。canonicalInputSha256 由 validated canonical rows 按稳定业务键排序后计算；单纯重排 workbook rows 不改变 semantic hash。sourceArtifactSha256 只承担文件级审计。",
        "本 template 不包含 parser、diff、dry-run runtime、apply、database write、migration、Admin、publication、media 或 production data。",
      ];
  advanced.forEach((line, index) =>
    addInstructionLine(worksheet, advancedSectionRow + 1 + index, line),
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

const v2SyntheticRows = {
  "01_Catalog": [
    "synthetic-001",
    "synthetic-source-001",
    null,
    "纯合成测试条目",
    "inscription",
    "纯合成标题下导语",
    "唐代（synthetic）",
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
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    null,
    "UNSUPPLIED",
    "REPLACE",
    "REPLACE",
    null,
  ],
  "02_Aliases": syntheticRows["02_Aliases"],
  "03_Provenance": syntheticRows["03_Provenance"],
  "04_Contributors": ["synthetic-001", "0", "纯合成贡献者", "textAuthor"],
  "05_Public_Citations": [
    "synthetic-001",
    "0",
    "纯合成来源",
    "纯合成引文",
    "https://example.invalid/citation",
    "record",
  ],
};

export const createCatalogImportWorkbook = ({
  synthetic = false,
  version = "v1",
} = {}) => {
  const layoutSpec = layoutSpecs[version];
  if (layoutSpec === undefined)
    throw new Error(`Unknown template version: ${version}`);
  const versionSyntheticRows =
    version === "v2" ? v2SyntheticRows : syntheticRows;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Moya catalog-import dev generator";
  workbook.lastModifiedBy = "Moya catalog-import dev generator";
  workbook.created = fixedTimestamp;
  workbook.modified = fixedTimestamp;
  workbook.lastPrinted = fixedTimestamp;
  workbook.company = "Moya";
  workbook.title =
    version === "v2"
      ? "Moya Catalog Import v2 Owner Template"
      : "Moya Catalog Import v1 Owner Template";
  workbook.subject =
    version === "v2"
      ? "Safe blank catalog-import/v2 workbook"
      : "Safe blank catalog-import/v1 workbook";
  workbook.keywords =
    version === "v2"
      ? "catalog-import/v2 catalog-import-xlsx/v2 owner template"
      : "catalog-import/v1 catalog-import-xlsx/v1 owner template";
  workbook.category = "Internal Owner Data Preparation";
  workbook.description =
    "Generated from the internal catalog import workbook layout specification.";
  workbook.calcProperties.fullCalcOnLoad = false;
  workbook.calcProperties.forceFullCalc = false;
  workbook.calcProperties.calcMode = "manual";

  for (const [name, sheetLayout] of Object.entries(layoutSpec.dataSheets)) {
    addDataSheet(
      workbook,
      name,
      sheetLayout,
      layoutSpec,
      synthetic ? versionSyntheticRows[name] : undefined,
    );
  }
  addInstructionsSheet(workbook, layoutSpec);
  return workbook;
};

export const generateCatalogImportTemplate = async (
  output,
  { synthetic = false, version = "v1" } = {},
) => {
  const workbook = createCatalogImportWorkbook({ synthetic, version });
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

const checkReopenAndExpansion = async (blankFile, directory, version) => {
  const layoutSpec = layoutSpecs[version];
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.readFile(blankFile, { ignoreNodes: ["dataValidations"] });
  assert.deepEqual(
    reopened.worksheets.map((sheet) => sheet.name),
    layoutSpec.sheetOrder,
  );
  for (const [name, sheetLayout] of Object.entries(layoutSpec.dataSheets)) {
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
    `catalog-import-${version}-expanded-smoke.xlsx`,
  );
  await generateCatalogImportTemplate(expansionFile, {
    synthetic: true,
    version,
  });
  const expanded = new ExcelJS.Workbook();
  await expanded.xlsx.readFile(expansionFile, {
    ignoreNodes: ["dataValidations"],
  });
  for (const [sheetIndex, [name, sheetLayout]] of Object.entries(
    layoutSpec.dataSheets,
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

const checkCommittedTemplate = async (version) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "moya-catalog-import-check-"),
  );
  try {
    const generated = path.join(
      directory,
      `catalog-import-${version}-template.xlsx`,
    );
    await generateCatalogImportTemplate(generated, { version });
    const [committed, fresh] = await Promise.all([
      observableFingerprint(
        committedTemplates[version],
        path.join(directory, "committed"),
      ),
      observableFingerprint(generated, path.join(directory, "generated")),
    ]);
    assert.deepEqual(
      fresh,
      committed,
      `Committed ${version} XLSX observable OOXML parts are stale; run the matching template generator`,
    );
    await checkReopenAndExpansion(generated, directory, version);
    const bytes = await readFile(generated);
    console.log(
      `Catalog Import ${version} template is current (${bytes.byteLength} bytes; observable OOXML equivalent).`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { check, output, version } = parseArguments(process.argv.slice(2));
  if (check) {
    await checkCommittedTemplate(version);
  } else {
    const destination =
      output === undefined ? committedTemplates[version] : path.resolve(output);
    await generateCatalogImportTemplate(destination, { version });
    console.log(`Generated ${destination}`);
  }
}
