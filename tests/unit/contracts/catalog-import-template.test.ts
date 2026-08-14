import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  CATALOG_IMPORT_SHEET_NAMES,
  CATALOG_IMPORT_WORKBOOK_SPEC,
  CATALOG_IMPORT_XLSX_LAYOUT_SPEC,
  CATALOG_IMPORT_XLSX_LAYOUT_VERSION,
  formatCatalogImportPresentationHeader,
} from "@moya/contracts/internal/catalog-import";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const templateUrl = new URL(
  "../../../docs/catalog-import/catalog-import-v1-template.xlsx",
  import.meta.url,
);
const generatorUrl = new URL(
  "../../../scripts/generate-catalog-import-template.mjs",
  import.meta.url,
);
const repositoryRoot = path.resolve(
  path.dirname(templateUrl.pathname),
  "../..",
);

/** Test-only abstraction: callers verify observable OOXML, not a ZIP library. */
interface OoxmlArchiveReader {
  listParts(): Promise<readonly string[]>;
  readText(part: string): Promise<string>;
}

class CommandOoxmlArchiveReader implements OoxmlArchiveReader {
  constructor(private readonly filePath: string) {}

  async listParts(): Promise<readonly string[]> {
    const { stdout } = await execFileAsync("unzip", ["-Z1", this.filePath]);
    return stdout.trim().split("\n");
  }

  async readText(part: string): Promise<string> {
    const escapedPart = part.replaceAll("[", "\\[").replaceAll("]", "\\]");
    const { stdout } = await execFileAsync("unzip", [
      "-p",
      this.filePath,
      escapedPart,
    ]);
    return stdout;
  }
}

const archive = new CommandOoxmlArchiveReader(templateUrl.pathname);

const xmlAttribute = (element: string, attribute: string): string => {
  const value = element.match(new RegExp(`${attribute}="([^"]+)"`))?.[1];
  if (value === undefined)
    throw new Error(`Missing ${attribute} in ${element}`);
  return value;
};

const decodeXml = (value: string): string =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const sharedStringValues = (sharedStringsXml: string): string[] =>
  [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml(
      [...(match[1] ?? "").matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
        .map((text) => text[1] ?? "")
        .join(""),
    ),
  );

const cellElement = (sheetXml: string, address: string): string => {
  const element = sheetXml.match(
    new RegExp(`<c\\b[^>]*\\br="${address}"[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`),
  )?.[0];
  if (element === undefined) throw new Error(`Missing cell ${address}`);
  return element;
};

const cellValue = (
  sheetXml: string,
  address: string,
  sharedStrings: readonly string[],
): string | undefined => {
  const cell = cellElement(sheetXml, address);
  const raw = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1];
  if (raw === undefined) return undefined;
  if (cell.includes('t="s"')) return sharedStrings[Number(raw)];
  return decodeXml(raw);
};

const tableHeaders = (tableXml: string): string[] =>
  [...tableXml.matchAll(/<tableColumn\b[^>]*\bname="([^"]+)"/g)].map((match) =>
    decodeXml(match[1] ?? ""),
  );

const worksheetRows = (sheetXml: string): string[] =>
  [...sheetXml.matchAll(/<row\b[^>]*\br="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );

describe("safe Catalog Import workbook template", () => {
  it("is generator-current and contains exactly the four versioned sheets", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [generatorUrl.pathname, "--check"],
      { cwd: repositoryRoot, timeout: 30_000 },
    );
    expect(stdout).toContain("observable OOXML equivalent");

    const parts = await archive.listParts();
    expect(parts).toContain("xl/workbook.xml");
    const workbook = await archive.readText("xl/workbook.xml");
    const sheetElements = [
      ...workbook.matchAll(/<sheet\b[^>]*\bname="[^"]+"[^>]*\/>/g),
    ].map((match) => match[0]);

    expect(sheetElements.map((sheet) => xmlAttribute(sheet, "name"))).toEqual(
      CATALOG_IMPORT_SHEET_NAMES,
    );
    expect(
      sheetElements.map((sheet) => xmlAttribute(sheet, "sheetId")),
    ).toEqual(["1", "2", "3", "4"]);
    expect(workbook).not.toMatch(
      /<sheet\b[^>]*\bstate="(?:hidden|veryHidden)"/,
    );
  });

  it("freezes Row 1 presentation, Row 2 machine headers and Row 3 table entry", async () => {
    const sharedStrings = sharedStringValues(
      await archive.readText("xl/sharedStrings.xml"),
    );
    const layouts = Object.entries(CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets);

    for (const [index, [, sheetLayout]] of layouts.entries()) {
      const worksheet = await archive.readText(
        `xl/worksheets/sheet${index + 1}.xml`,
      );
      const table = await archive.readText(`xl/tables/table${index + 1}.xml`);
      const lastColumn = sheetLayout.tableRef.match(/:([A-Z]+)3$/)?.[1];
      expect(lastColumn).toBeDefined();
      expect(worksheet).toContain(`<dimension ref="A1:${lastColumn ?? ""}3"/>`);
      expect(worksheetRows(worksheet)).toEqual(["1", "2", "3"]);
      expect(worksheet).not.toContain("<mergeCells");
      expect(worksheet).not.toContain('showGridLines="0"');
      expect(worksheet).toContain(
        `<pane xSplit="${sheetLayout.freeze.xSplit}" ySplit="${sheetLayout.freeze.ySplit}" topLeftCell="${sheetLayout.freeze.topLeftCell}"`,
      );
      expect(table).toContain(`name="${sheetLayout.tableName}"`);
      expect(table).toContain(`ref="${sheetLayout.tableRef}"`);
      expect(table).toContain(`<autoFilter ref="${sheetLayout.tableRef}"`);
      expect(tableHeaders(table)).toEqual(
        sheetLayout.fields.map((field) => field.machineHeader),
      );

      for (const [columnIndex, field] of sheetLayout.fields.entries()) {
        const columnLetter = String.fromCharCode(65 + columnIndex);
        expect(cellValue(worksheet, `${columnLetter}1`, sharedStrings)).toBe(
          formatCatalogImportPresentationHeader(
            field.presentationHeader,
            field.requiredness,
          ),
        );
        expect(cellValue(worksheet, `${columnLetter}2`, sharedStrings)).toBe(
          field.machineHeader,
        );
        expect(cellValue(worksheet, `${columnLetter}3`, sharedStrings)).toBe(
          undefined,
        );
      }
    }
  });

  it("keeps exact machine headers and compact full-range validation prompts", async () => {
    const tables = await Promise.all(
      [1, 2, 3].map((index) => archive.readText(`xl/tables/table${index}.xml`)),
    );
    expect(tableHeaders(tables[0] ?? "")).toEqual(
      CATALOG_IMPORT_CATALOG_HEADERS,
    );
    expect(tableHeaders(tables[1] ?? "")).toEqual(CATALOG_IMPORT_ALIAS_HEADERS);
    expect(tableHeaders(tables[2] ?? "")).toEqual(
      CATALOG_IMPORT_PROVENANCE_HEADERS,
    );

    const catalog = await archive.readText("xl/worksheets/sheet1.xml");
    const aliases = await archive.readText("xl/worksheets/sheet2.xml");
    expect(catalog.match(/<dataValidation\b/g)).toHaveLength(9);
    for (const range of [
      "E3:E1048576",
      "G3:G1048576",
      "I3:I1048576",
      "K3:K1048576",
      "M3:M1048576",
      "O3:O1048576",
      "Q3:Q1048576",
      "S3:S1048576",
      "U3:U1048576",
    ]) {
      expect(catalog).toContain(`sqref="${range}"`);
    }
    expect(catalog).toContain(
      `&quot;${CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.catalogKind.join(",")}&quot;`,
    );
    expect(
      catalog.match(
        /&quot;VALUE,UNSUPPLIED,UNKNOWN,NOT_APPLICABLE,CLEAR&quot;/g,
      ),
    ).toHaveLength(7);
    expect(catalog).toContain("blank 不删除");
    expect(catalog).toContain(
      `&quot;${CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.descriptionState.join(",")}&quot;`,
    );
    expect(aliases).toContain('sqref="C3:C1048576"');
    expect(aliases).toContain(
      `&quot;${CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.aliasType.join(",")}&quot;`,
    );

    for (const worksheet of [catalog, aliases]) {
      expect(worksheet).not.toContain('r="1048576"');
      expect(worksheet).not.toContain('<row r="4"');
    }
  });

  it("preserves identity text formats, explicit borders and light state grouping", async () => {
    const catalog = await archive.readText("xl/worksheets/sheet1.xml");
    const aliases = await archive.readText("xl/worksheets/sheet2.xml");
    const provenance = await archive.readText("xl/worksheets/sheet3.xml");
    const styles = await archive.readText("xl/styles.xml");
    const cellXfs = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1];
    expect(cellXfs).toBeDefined();
    const xfs = [
      ...(cellXfs ?? "").matchAll(/<xf\b(?:[^>]*?\/>|[^>]*>[\s\S]*?<\/xf>)/g),
    ].map((match) => match[0]);

    for (const [worksheet, addresses] of [
      [catalog, ["A3", "B3", "C3"]],
      [aliases, ["A3"]],
      [provenance, ["A3", "B3"]],
    ] as const) {
      for (const address of addresses) {
        const styleIndex = Number(
          xmlAttribute(cellElement(worksheet, address), "s"),
        );
        expect(xfs[styleIndex]).toContain('numFmtId="49"');
        expect(xfs[styleIndex]).toContain('borderId="2"');
      }
    }
    const stateStyle = Number(xmlAttribute(cellElement(catalog, "G3"), "s"));
    const ordinaryStyle = Number(xmlAttribute(cellElement(catalog, "F3"), "s"));
    expect(xmlAttribute(xfs[stateStyle] ?? "", "fillId")).not.toBe(
      xmlAttribute(xfs[ordinaryStyle] ?? "", "fillId"),
    );
    expect(styles).toContain('<bottom style="medium"');
    expect(styles).toContain('<bottom style="thin"');
  });

  it("puts Owner guidance before fixed visible machine metadata", async () => {
    const instructions = await archive.readText("xl/worksheets/sheet4.xml");
    const sharedStrings = sharedStringValues(
      await archive.readText("xl/sharedStrings.xml"),
    );
    expect(cellValue(instructions, "A4", sharedStrings)).toBe(
      "A. Owner 快速开始",
    );
    expect(cellValue(instructions, "A17", sharedStrings)).toBe(
      "B. Identity / State / Location guidance",
    );
    expect(cellValue(instructions, "A25", sharedStrings)).toBe(
      "C. Field Guide",
    );
    expect(cellValue(instructions, "A61", sharedStrings)).toBe(
      "D. Advanced persistence / approval / hash notes",
    );
    expect(instructions).toContain('<dimension ref="A1:F70"/>');
    expect(cellValue(instructions, "A68", sharedStrings)).toBe(
      "Technical Metadata",
    );
    expect(cellValue(instructions, "A69", sharedStrings)).toBe(
      "workbookLayoutVersion",
    );
    expect(cellValue(instructions, "B69", sharedStrings)).toBe(
      CATALOG_IMPORT_XLSX_LAYOUT_VERSION,
    );
    expect(cellValue(instructions, "A70", sharedStrings)).toBe(
      "importContractVersion",
    );
    expect(cellValue(instructions, "B70", sharedStrings)).toBe(
      CATALOG_IMPORT_CONTRACT_VERSION,
    );
    expect(
      ["A26", "B26", "C26", "D26", "E26", "F26"].map((address) =>
        cellValue(instructions, address, sharedStrings),
      ),
    ).toEqual([
      "Sheet",
      "中文名称",
      "Machine header",
      "Requiredness",
      "如何填写",
      "示例",
    ]);
    expect(cellValue(instructions, "B27", sharedStrings)).toBe("批次内关联 ID");
    expect(cellValue(instructions, "D27", sharedStrings)).toBe(
      CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS.REQUIRED,
    );
    expect(cellValue(instructions, "F27", sharedStrings)).toBe(
      "synthetic-item-001",
    );
    expect(cellValue(instructions, "B29", sharedStrings)).toBe("平台目录 ID");
    expect(cellValue(instructions, "D29", sharedStrings)).toBe(
      CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS.UPDATE_ONLY,
    );
    expect(cellValue(instructions, "F36", sharedStrings)).toBe(
      "福建省（synthetic）",
    );
    expect(cellValue(instructions, "F38", sharedStrings)).toBe(
      "泉州市（synthetic）",
    );
    expect(cellValue(instructions, "F40", sharedStrings)).toBe(
      "洛江区（synthetic）",
    );
    expect(cellValue(instructions, "F42", sharedStrings)).toBe(
      "万安某处（synthetic）",
    );
    expect(cellValue(instructions, "F44", sharedStrings)).toBe(
      "某文物管理机构（synthetic）",
    );
    expect(cellValue(instructions, "D49", sharedStrings)).toBe(
      CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS.CHILD_ROW_REQUIRED,
    );
    expect(cellValue(instructions, "F56", sharedStrings)).toBe(
      "https://example.invalid",
    );
    const literalText = sharedStrings.join("\n");
    for (const evidence of [
      "blank ≠ delete",
      "成功 Import ≠ Publish",
      "duplicate 只产生候选，不自动 merge",
      "catalogImportId ≠ sourceId ≠ catalogId",
      "福建省",
      "泉州市",
      "洛江区",
      "万安某处",
      "某文物管理机构",
      "每条 01_Catalog 在 Apply 时都需要一条",
      "supplied ownerNote 不会静默丢弃",
      "alias collection UPDATE",
      "Research evidence",
    ]) {
      expect(literalText).toContain(evidence);
    }
    expect(literalText).not.toContain("ALIAS_TYPE_STORAGE_REQUIRED");
    expect(literalText).not.toContain("PROVENANCE_STORAGE_REQUIRED");
  });

  it("contains no production rows, hidden payloads, active content or secrets", async () => {
    const parts = await archive.listParts();
    for (const forbiddenPart of [
      "vbaProject.bin",
      "externalLinks",
      "connections.xml",
      "embeddings",
      "oleObjects",
      "activeX",
      "ctrlProps",
    ]) {
      expect(parts.some((part) => part.includes(forbiddenPart))).toBe(false);
    }

    const worksheets = await Promise.all(
      [1, 2, 3, 4].map((index) =>
        archive.readText(`xl/worksheets/sheet${index}.xml`),
      ),
    );
    for (const worksheet of worksheets) {
      expect(worksheet).not.toContain("<f>");
      expect(worksheet).not.toMatch(/<row\b[^>]*\bhidden="1"/);
      expect(worksheet).not.toMatch(/<col\b[^>]*\bhidden="1"/);
    }
    for (const worksheet of worksheets.slice(0, 3)) {
      const firstDataRow = worksheet.match(
        /<row\b[^>]*\br="3"[^>]*>([\s\S]*?)<\/row>/,
      )?.[1];
      expect(firstDataRow).toBeDefined();
      expect(firstDataRow).not.toContain("<v>");
      expect(firstDataRow).not.toContain("<f>");
    }

    const serialized = (
      await Promise.all(
        parts
          .filter((part) => part.endsWith(".xml"))
          .map((part) => archive.readText(part)),
      )
    ).join("\n");
    for (const forbidden of [
      "publicationIntent",
      "objectKey",
      "storagePath",
      "storageProvider",
      "DATABASE_URL",
      "postgresql://",
      "BEGIN TRANSACTION",
      "migrationMetadata",
      "prisma.schema",
      "drizzle",
      "typeorm",
      "AWS_SECRET_ACCESS_KEY",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
