import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  CATALOG_IMPORT_SHEET_NAMES,
  CATALOG_IMPORT_WORKBOOK_SPEC,
} from "@moya/contracts/internal/catalog-import";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const templateUrl = new URL(
  "../../../docs/catalog-import/catalog-import-v1-template.xlsx",
  import.meta.url,
);

/** Test-only abstraction: callers verify OOXML parts, not a ZIP library. */
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
    const { stdout } = await execFileAsync("unzip", [
      "-p",
      this.filePath,
      part,
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

const tableHeaders = (tableXml: string): string[] =>
  [...tableXml.matchAll(/<x:tableColumn\b[^>]*\bname="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );

describe("safe Catalog Import workbook template", () => {
  it("contains exactly the four versioned contract sheets", async () => {
    const parts = await archive.listParts();
    expect(parts).toContain("xl/workbook.xml");
    const workbook = await archive.readText("xl/workbook.xml");
    const sheetElements = [
      ...workbook.matchAll(/<x:sheet\b[^>]*\bname="[^"]+"[^>]*\/>/g),
    ].map((match) => match[0]);

    expect(sheetElements.map((sheet) => xmlAttribute(sheet, "name"))).toEqual(
      CATALOG_IMPORT_SHEET_NAMES,
    );
    expect(
      sheetElements.map((sheet) => xmlAttribute(sheet, "sheetId")),
    ).toEqual(["1", "2", "3", "4"]);

    const instructions = await archive.readText("xl/worksheets/sheet4.xml");
    expect(instructions).toContain(">importContractVersion<");
    expect(instructions).toContain(`>${CATALOG_IMPORT_CONTRACT_VERSION}<`);
    expect(instructions).toContain("成功导入 ≠ 自动发布");
    expect(instructions).toContain("ALIAS_TYPE_STORAGE_REQUIRED");
    expect(instructions).toContain("PROVENANCE_STORAGE_REQUIRED");
  });

  it("derives exact table headers from the executable workbook contract", async () => {
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
    for (const [index, table] of tables.entries()) {
      expect(table).toContain("<x:autoFilter");
      expect(xmlAttribute(table, "name")).toBe(
        ["CatalogImportTable", "AliasImportTable", "ProvenanceImportTable"][
          index
        ],
      );
    }
  });

  it("keeps data rows blank and contains no production or forbidden fields", async () => {
    const worksheets = await Promise.all(
      [1, 2, 3].map((index) =>
        archive.readText(`xl/worksheets/sheet${index}.xml`),
      ),
    );

    for (const worksheet of worksheets) {
      const firstDataRow = worksheet.match(
        /<x:row\b[^>]*\br="2"[^>]*>([\s\S]*?)<\/x:row>/,
      )?.[1];
      expect(firstDataRow).toBeDefined();
      expect(firstDataRow).not.toContain("<x:v>");
      expect(firstDataRow).not.toContain("<x:f>");
    }

    const serialized = (
      await Promise.all([
        ...worksheets,
        archive.readText("xl/worksheets/sheet4.xml"),
        archive.readText("xl/tables/table1.xml"),
        archive.readText("xl/tables/table2.xml"),
        archive.readText("xl/tables/table3.xml"),
      ])
    ).join("\n");
    for (const forbidden of [
      "publicationIntent",
      "objectKey",
      "storagePath",
      "storageProvider",
      "internalRightsNotes",
      "migrationMetadata",
      "DATABASE_URL",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("applies contract-derived validation lists to editable columns", async () => {
    const catalog = await archive.readText("xl/worksheets/sheet1.xml");
    const aliases = await archive.readText("xl/worksheets/sheet2.xml");

    expect(catalog).toContain('sqref="E2"');
    expect(catalog).toContain(
      `>"${CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.catalogKind.join(",")}"<`,
    );
    expect(catalog.match(/<x:dataValidation\b/g)).toHaveLength(9);
    expect(
      catalog.match(/>"VALUE,UNSUPPLIED,UNKNOWN,NOT_APPLICABLE,CLEAR"</g),
    ).toHaveLength(7);
    expect(catalog).toContain('sqref="U2"');
    expect(catalog).toContain('>"VALUE,UNSUPPLIED,CLEAR"<');

    expect(aliases).toContain('sqref="C2"');
    expect(aliases).toContain('>"alternate,historical"<');
  });
});
