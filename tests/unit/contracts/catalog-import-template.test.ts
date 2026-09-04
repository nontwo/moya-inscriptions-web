import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  CATALOG_IMPORT_SHEET_NAMES,
  CATALOG_IMPORT_V2_CATALOG_HEADERS,
  CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
  CATALOG_IMPORT_V2_CONTRACT_VERSION,
  CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
  CATALOG_IMPORT_V2_SHEET_NAMES,
  CATALOG_IMPORT_V2_WORKBOOK_SPEC,
  CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC,
  CATALOG_IMPORT_V2_XLSX_LAYOUT_VERSION,
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
const v2TemplateUrl = new URL(
  "../../../docs/catalog-import/catalog-import-v2-template.xlsx",
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
const v2Archive = new CommandOoxmlArchiveReader(v2TemplateUrl.pathname);
const v1TemplateSha256 =
  "58b46464905282e700e541e51096bae7175d63b64c535998f3ec70ec88884e5e";
const v1ObservableFingerprintSha256 =
  "4be2d64a6e46aa9c02c8bb516fb9340bad458ca9c579b7d3bd9f677e4e0b078c";

interface ObservablePart {
  readonly part: string;
  readonly sha256: string;
  readonly size: number;
}

const collectFiles = async (
  directory: string,
  prefix = "",
): Promise<string[]> => {
  const parts: string[] = [];
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

const observableFingerprint = async (
  filePath: string,
): Promise<readonly ObservablePart[]> => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "moya-catalog-import-template-test-"),
  );
  try {
    await execFileAsync("unzip", ["-qq", filePath, "-d", directory]);
    const parts = (await collectFiles(directory)).sort();
    return await Promise.all(
      parts.map(async (part) => {
        const content = await readFile(
          path.join(directory, ...part.split("/")),
        );
        return {
          part,
          sha256: createHash("sha256").update(content).digest("hex"),
          size: content.byteLength,
        };
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

const fingerprintSha256 = (fingerprint: readonly ObservablePart[]): string =>
  createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex");

const fileSha256 = async (filePath: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

const columnLetter = (zeroBasedIndex: number): string => {
  let value = zeroBasedIndex + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

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
  it("preserves the exact v1 file, fingerprint and four-sheet default", async () => {
    expect(await fileSha256(templateUrl.pathname)).toBe(v1TemplateSha256);
    expect(
      fingerprintSha256(await observableFingerprint(templateUrl.pathname)),
    ).toBe(v1ObservableFingerprintSha256);

    for (const arguments_ of [
      [generatorUrl.pathname, "--check"],
      [generatorUrl.pathname, "--check", "--version", "v1"],
    ]) {
      const { stdout } = await execFileAsync(process.execPath, arguments_, {
        cwd: repositoryRoot,
        timeout: 30_000,
      });
      expect(stdout).toContain("observable OOXML equivalent");
    }

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
      expect(worksheet).not.toMatch(/<f\b/);
      expect(worksheet).not.toMatch(/<row\b[^>]*\bhidden="1"/);
      expect(worksheet).not.toMatch(/<col\b[^>]*\bhidden="1"/);
    }
    for (const worksheet of worksheets.slice(0, 3)) {
      const firstDataRow = worksheet.match(
        /<row\b[^>]*\br="3"[^>]*>([\s\S]*?)<\/row>/,
      )?.[1];
      expect(firstDataRow).toBeDefined();
      expect(firstDataRow).not.toContain("<v>");
      expect(firstDataRow).not.toMatch(/<f\b/);
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

describe("safe Catalog Import v2 workbook template", () => {
  it("checks and reproduces the committed six-sheet template", async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [generatorUrl.pathname, "--check", "--version", "v2"],
      { cwd: repositoryRoot, timeout: 30_000 },
    );
    expect(stdout).toContain("observable OOXML equivalent");

    const directory = await mkdtemp(
      path.join(tmpdir(), "moya-catalog-import-v2-generation-"),
    );
    try {
      const first = path.join(directory, "first.xlsx");
      const second = path.join(directory, "second.xlsx");
      for (const output of [first, second]) {
        await execFileAsync(
          process.execPath,
          [generatorUrl.pathname, "--version", "v2", "--output", output],
          { cwd: repositoryRoot, timeout: 30_000 },
        );
      }
      const [committed, firstGenerated, secondGenerated] = await Promise.all([
        observableFingerprint(v2TemplateUrl.pathname),
        observableFingerprint(first),
        observableFingerprint(second),
      ]);
      expect(firstGenerated).toEqual(committed);
      expect(secondGenerated).toEqual(committed);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

    const workbook = await v2Archive.readText("xl/workbook.xml");
    const sheetElements = [
      ...workbook.matchAll(/<sheet\b[^>]*\bname="[^"]+"[^>]*\/>/g),
    ].map((match) => match[0]);
    expect(sheetElements.map((sheet) => xmlAttribute(sheet, "name"))).toEqual(
      CATALOG_IMPORT_V2_SHEET_NAMES,
    );
    expect(
      sheetElements.map((sheet) => xmlAttribute(sheet, "sheetId")),
    ).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(workbook).not.toMatch(
      /<sheet\b[^>]*\bstate="(?:hidden|veryHidden)"/,
    );
  });

  it("uses exact headers, blank rows, formatting and categorical values", async () => {
    const sharedStrings = sharedStringValues(
      await v2Archive.readText("xl/sharedStrings.xml"),
    );
    const styles = await v2Archive.readText("xl/styles.xml");
    const cellXfs = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1];
    expect(cellXfs).toBeDefined();
    const xfs = [
      ...(cellXfs ?? "").matchAll(/<xf\b(?:[^>]*?\/>|[^>]*>[\s\S]*?<\/xf>)/g),
    ].map((match) => match[0]);
    const layouts = Object.entries(
      CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC.dataSheets,
    );

    for (const [sheetIndex, [, sheetLayout]] of layouts.entries()) {
      const worksheet = await v2Archive.readText(
        `xl/worksheets/sheet${sheetIndex + 1}.xml`,
      );
      const table = await v2Archive.readText(
        `xl/tables/table${sheetIndex + 1}.xml`,
      );
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

      for (const [fieldIndex, field] of sheetLayout.fields.entries()) {
        const column = columnLetter(fieldIndex);
        expect(cellValue(worksheet, `${column}1`, sharedStrings)).toBe(
          formatCatalogImportPresentationHeader(
            field.presentationHeader,
            field.requiredness,
          ),
        );
        expect(cellValue(worksheet, `${column}2`, sharedStrings)).toBe(
          field.machineHeader,
        );
        expect(cellValue(worksheet, `${column}3`, sharedStrings)).toBe(
          undefined,
        );
        if ("validation" in field && field.validation !== undefined) {
          const validation =
            CATALOG_IMPORT_V2_XLSX_LAYOUT_SPEC.validations[field.validation];
          expect(worksheet).toContain(`sqref="${column}3:${column}1048576"`);
          expect(worksheet).toContain(
            `&quot;${validation.values.join(",")}&quot;`,
          );
        }
        if ("textPreserving" in field && field.textPreserving === true) {
          const styleIndex = Number(
            xmlAttribute(cellElement(worksheet, `${column}3`), "s"),
          );
          expect(xfs[styleIndex]).toContain('numFmtId="49"');
          expect(xfs[styleIndex]).toContain('borderId="2"');
        }
      }
    }

    const tables = await Promise.all(
      [1, 2, 3, 4, 5].map((index) =>
        v2Archive.readText(`xl/tables/table${index}.xml`),
      ),
    );
    expect(tableHeaders(tables[0] ?? "")).toEqual(
      CATALOG_IMPORT_V2_CATALOG_HEADERS,
    );
    expect(tableHeaders(tables[1] ?? "")).toEqual(CATALOG_IMPORT_ALIAS_HEADERS);
    expect(tableHeaders(tables[2] ?? "")).toEqual(
      CATALOG_IMPORT_PROVENANCE_HEADERS,
    );
    expect(tableHeaders(tables[3] ?? "")).toEqual(
      CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
    );
    expect(tableHeaders(tables[4] ?? "")).toEqual(
      CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
    );

    const catalog = await v2Archive.readText("xl/worksheets/sheet1.xml");
    const aliases = await v2Archive.readText("xl/worksheets/sheet2.xml");
    const contributors = await v2Archive.readText("xl/worksheets/sheet4.xml");
    expect(catalog.match(/<dataValidation\b/g)).toHaveLength(15);
    expect(catalog).toContain(
      `&quot;${CATALOG_IMPORT_V2_WORKBOOK_SPEC.allowedValues.collectionAction.join(",")}&quot;`,
    );
    expect(aliases).toContain(
      `&quot;${CATALOG_IMPORT_V2_WORKBOOK_SPEC.allowedValues.aliasType.join(",")}&quot;`,
    );
    expect(contributors).toContain(
      `&quot;${CATALOG_IMPORT_V2_WORKBOOK_SPEC.allowedValues.contributorRole.join(",")}&quot;`,
    );
    expect(styles).toContain('<bottom style="medium"');
    expect(styles).toContain('<bottom style="thin"');
  });

  it("keeps visible version metadata and excludes active or hidden content", async () => {
    const instructions = await v2Archive.readText("xl/worksheets/sheet6.xml");
    const sharedStrings = sharedStringValues(
      await v2Archive.readText("xl/sharedStrings.xml"),
    );
    expect(instructions).toContain('<dimension ref="A1:F95"/>');
    expect(cellValue(instructions, "A82", sharedStrings)).toBe(
      "D. Advanced persistence / approval / hash notes",
    );
    expect(cellValue(instructions, "A93", sharedStrings)).toBe(
      "Technical Metadata",
    );
    expect(cellValue(instructions, "A94", sharedStrings)).toBe(
      "workbookLayoutVersion",
    );
    expect(cellValue(instructions, "B94", sharedStrings)).toBe(
      CATALOG_IMPORT_V2_XLSX_LAYOUT_VERSION,
    );
    expect(cellValue(instructions, "A95", sharedStrings)).toBe(
      "importContractVersion",
    );
    expect(cellValue(instructions, "B95", sharedStrings)).toBe(
      CATALOG_IMPORT_V2_CONTRACT_VERSION,
    );
    const literalText = sharedStrings.join("\n");
    for (const evidence of [
      "contributorsAction / publicCitationsAction",
      "summary / periodLabel 是无 state 的直接可选文本",
      "留空表示省略且不清除既有值",
      "留空等同 PRESERVE",
      "REPLACE 必须提供子表行",
      "appliesTo 留空表示省略",
      "0–2147483647（含）之间的整数",
      "成功 Import ≠ Publish",
    ]) {
      expect(literalText).toContain(evidence);
    }
    expect(literalText).not.toContain("非负安全整数");

    const parts = await v2Archive.listParts();
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
      [1, 2, 3, 4, 5, 6].map((index) =>
        v2Archive.readText(`xl/worksheets/sheet${index}.xml`),
      ),
    );
    for (const worksheet of worksheets) {
      expect(worksheet).not.toContain("<f>");
      expect(worksheet).not.toMatch(/<row\b[^>]*\bhidden="1"/);
      expect(worksheet).not.toMatch(/<col\b[^>]*\bhidden="1"/);
    }
    for (const worksheet of worksheets.slice(0, 5)) {
      const firstDataRow = worksheet.match(
        /<row\b[^>]*\br="3"[^>]*>([\s\S]*?)<\/row>/,
      )?.[1];
      expect(firstDataRow).toBeDefined();
      expect(firstDataRow).not.toContain("<v>");
      expect(firstDataRow).not.toContain("<f>");
    }
  });
});
