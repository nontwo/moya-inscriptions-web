import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CATALOG_IMPORT_XLSX_LIMITS,
  CatalogImportDiagnosticError,
  createCatalogImportDryRun,
  parseCatalogImportCsvBundle,
  parseCatalogImportXlsxWorkbook,
  preflightCatalogImportXlsxWorkbook,
} from "@moya/catalog-importer";
import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  CATALOG_IMPORT_V2_CATALOG_HEADERS,
  CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
  CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
} from "@moya/contracts/internal/catalog-import";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";

import type { CatalogImportDiagnosticCode } from "@moya/catalog-importer";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const templatePath = path.join(
  repositoryRoot,
  "docs/catalog-import/catalog-import-v1-template.xlsx",
);
const v2TemplatePath = path.join(
  repositoryRoot,
  "docs/catalog-import/catalog-import-v2-template.xlsx",
);
const temporaryDirectories: string[] = [];
const realisticCatalogRowCount = 1_658;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const catalogRows = [
  {
    catalogImportId: "item-z",
    sourceId: "000123",
    catalogId: "",
    title: "摩崖合成乙",
    catalogKind: "calligraphy",
    dynasty: "唐（synthetic）",
    dynastyState: "VALUE",
    dateText: "",
    dateTextState: "UNKNOWN",
    province: "",
    provinceState: "NOT_APPLICABLE",
    prefecture: "",
    prefectureState: "UNSUPPLIED",
    county: "",
    countyState: "",
    currentLocation: "万安某处（synthetic）",
    currentLocationState: "VALUE",
    currentCustodian: "",
    currentCustodianState: "CLEAR",
    description: "合成说明，保留中文。",
    descriptionState: "VALUE",
    ownerNote: "",
  },
  {
    catalogImportId: "item-a",
    sourceId: "source-ascii-001",
    catalogId: "catalog-existing-001",
    title: "碑刻合成甲",
    catalogKind: "inscription",
    dynasty: "",
    dynastyState: "UNSUPPLIED",
    dateText: "北宋（synthetic）",
    dateTextState: "",
    province: "福建省（synthetic）",
    provinceState: "VALUE",
    prefecture: "泉州市（synthetic）",
    prefectureState: "VALUE",
    county: "洛江区（synthetic）",
    countyState: "VALUE",
    currentLocation: "",
    currentLocationState: "UNKNOWN",
    currentCustodian: "某文物管理机构（synthetic）",
    currentCustodianState: "VALUE",
    description: "",
    descriptionState: "CLEAR",
    ownerNote: "",
  },
] as const;

const aliasRows = [
  { catalogImportId: "item-z", alias: "合成旧称乙", aliasType: "historical" },
  { catalogImportId: "item-a", alias: "Synthetic A", aliasType: "alternate" },
] as const;

const provenanceRows = [
  {
    catalogImportId: "item-z",
    sourceId: "000123",
    sourceTitle: "合成来源乙",
    sourceTypeRaw: "地方旧志（synthetic）",
    sourceUrl: "https://example.invalid/source/000123",
    sourceNote: "主来源",
  },
  {
    catalogImportId: "item-z",
    sourceId: "additional-source-z",
    sourceTitle: "补充来源",
    sourceTypeRaw: "synthetic",
    sourceUrl: "",
    sourceNote: "",
  },
  {
    catalogImportId: "item-a",
    sourceId: "source-ascii-001",
    sourceTitle: "Synthetic source A",
    sourceTypeRaw: "synthetic",
    sourceUrl: "https://example.invalid/source/a",
    sourceNote: "",
  },
] as const;

const v2CatalogRows = [
  {
    ...catalogRows[0],
    catalogId: "",
    currentCustodianState: "UNSUPPLIED",
    scriptStyle: "楷书（synthetic）",
    scriptStyleState: "VALUE",
    transcription: "第一行\n第二行（synthetic）",
    transcriptionState: "VALUE",
    historicalContext: "纯合成历史背景",
    historicalContextState: "VALUE",
    scholarlyResearch: "纯合成研究说明",
    scholarlyResearchState: "VALUE",
    contributorsAction: "REPLACE",
    publicCitationsAction: "REPLACE",
  },
] as const;

const v2AliasRows = [aliasRows[0]] as const;
const v2ProvenanceRows = [provenanceRows[0]] as const;
const v2ContributorRows = [
  {
    catalogImportId: "item-z",
    position: "1",
    name: "合成书写者",
    role: "calligrapher",
  },
  {
    catalogImportId: "item-z",
    position: "0",
    name: "合成撰文者",
    role: "textAuthor",
  },
] as const;
const v2PublicCitationRows = [
  {
    catalogImportId: "item-z",
    position: "0",
    label: "合成公开引文",
    citation: "仅用于自动化测试",
    url: "https://example.invalid/public-citation",
    appliesTo: "transcription|description",
  },
] as const;

const csvCell = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

const csvTable = (
  headers: readonly string[],
  rows: readonly Readonly<Record<string, string>>[],
  newline: "\n" | "\r\n",
): string =>
  [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => csvCell(row[header] ?? "")).join(","),
    ),
    "",
  ].join(newline);

const writeCsvBundle = async (
  options: {
    readonly newline?: "\n" | "\r\n";
    readonly bom?: boolean;
    readonly catalog?: readonly Readonly<Record<string, string>>[];
    readonly aliases?: readonly Readonly<Record<string, string>>[];
    readonly provenance?: readonly Readonly<Record<string, string>>[];
  } = {},
): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "moya-parser-csv-"));
  temporaryDirectories.push(directory);
  const newline = options.newline ?? "\n";
  const bom = options.bom === true ? "\uFEFF" : "";
  await Promise.all([
    writeFile(
      path.join(directory, "00_manifest.csv"),
      `${bom}importContractVersion${newline}catalog-import/v1${newline}`,
    ),
    writeFile(
      path.join(directory, "catalog.csv"),
      `${bom}${csvTable(CATALOG_IMPORT_CATALOG_HEADERS, options.catalog ?? catalogRows, newline)}`,
    ),
    writeFile(
      path.join(directory, "aliases.csv"),
      `${bom}${csvTable(CATALOG_IMPORT_ALIAS_HEADERS, options.aliases ?? aliasRows, newline)}`,
    ),
    writeFile(
      path.join(directory, "provenance.csv"),
      `${bom}${csvTable(CATALOG_IMPORT_PROVENANCE_HEADERS, options.provenance ?? provenanceRows, newline)}`,
    ),
  ]);
  return directory;
};

const writeV2CsvBundle = async (
  options: {
    readonly newline?: "\n" | "\r\n";
    readonly bom?: boolean;
    readonly manifestVersion?: string;
    readonly catalog?: readonly Readonly<Record<string, string>>[];
    readonly aliases?: readonly Readonly<Record<string, string>>[];
    readonly provenance?: readonly Readonly<Record<string, string>>[];
    readonly contributors?: readonly Readonly<Record<string, string>>[];
    readonly publicCitations?: readonly Readonly<Record<string, string>>[];
  } = {},
): Promise<string> => {
  const directory = await mkdtemp(path.join(tmpdir(), "moya-parser-v2-csv-"));
  temporaryDirectories.push(directory);
  const newline = options.newline ?? "\n";
  const bom = options.bom === true ? "\uFEFF" : "";
  await Promise.all([
    writeFile(
      path.join(directory, "00_manifest.csv"),
      `${bom}importContractVersion${newline}${options.manifestVersion ?? "catalog-import/v2"}${newline}`,
    ),
    writeFile(
      path.join(directory, "catalog.csv"),
      `${bom}${csvTable(
        CATALOG_IMPORT_V2_CATALOG_HEADERS,
        options.catalog ?? v2CatalogRows,
        newline,
      )}`,
    ),
    writeFile(
      path.join(directory, "aliases.csv"),
      `${bom}${csvTable(
        CATALOG_IMPORT_ALIAS_HEADERS,
        options.aliases ?? v2AliasRows,
        newline,
      )}`,
    ),
    writeFile(
      path.join(directory, "provenance.csv"),
      `${bom}${csvTable(
        CATALOG_IMPORT_PROVENANCE_HEADERS,
        options.provenance ?? v2ProvenanceRows,
        newline,
      )}`,
    ),
    writeFile(
      path.join(directory, "contributors.csv"),
      `${bom}${csvTable(
        CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
        options.contributors ?? v2ContributorRows,
        newline,
      )}`,
    ),
    writeFile(
      path.join(directory, "public_citations.csv"),
      `${bom}${csvTable(
        CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
        options.publicCitations ?? v2PublicCitationRows,
        newline,
      )}`,
    ),
  ]);
  return directory;
};

const loadTemplate = async (): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Uint8Array.from(await readFile(templatePath)).buffer,
    { ignoreNodes: ["dataValidations"] },
  );
  return workbook;
};

const loadV2Template = async (): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    Uint8Array.from(await readFile(v2TemplatePath)).buffer,
    { ignoreNodes: ["dataValidations"] },
  );
  return workbook;
};

const setRows = (
  worksheet: ExcelJS.Worksheet,
  headers: readonly string[],
  rows: readonly Readonly<Record<string, string>>[],
  firstRow = 3,
): void => {
  for (const [rowIndex, values] of rows.entries()) {
    for (const [columnIndex, header] of headers.entries()) {
      worksheet.getCell(rowIndex + firstRow, columnIndex + 1).value =
        values[header] ?? "";
    }
  }
};

const setV2TableRows = (
  worksheet: ExcelJS.Worksheet,
  tableName: string,
  headers: readonly string[],
  rows: readonly Readonly<Record<string, string>>[],
): void => {
  setRows(worksheet, headers, rows);
  const table = worksheet.getTable(tableName);
  const model = (
    table as unknown as {
      readonly model: { tableRef: string; autoFilterRef: string };
    }
  ).model;
  const lastRow = 2 + Math.max(1, rows.length);
  const expandedRef = model.tableRef.replace(/\d+$/, String(lastRow));
  model.tableRef = expandedRef;
  model.autoFilterRef = expandedRef;
};

const validWorkbook = async (
  options: {
    readonly catalog?: readonly Readonly<Record<string, string>>[];
    readonly aliases?: readonly Readonly<Record<string, string>>[];
    readonly provenance?: readonly Readonly<Record<string, string>>[];
    readonly styleVariant?: boolean;
  } = {},
): Promise<ExcelJS.Workbook> => {
  const workbook = await loadTemplate();
  setRows(
    workbook.getWorksheet("01_Catalog")!,
    CATALOG_IMPORT_CATALOG_HEADERS,
    options.catalog ?? catalogRows,
  );
  setRows(
    workbook.getWorksheet("02_Aliases")!,
    CATALOG_IMPORT_ALIAS_HEADERS,
    options.aliases ?? aliasRows,
  );
  setRows(
    workbook.getWorksheet("03_Provenance")!,
    CATALOG_IMPORT_PROVENANCE_HEADERS,
    options.provenance ?? provenanceRows,
  );
  if (options.styleVariant === true) {
    workbook.getWorksheet("01_Catalog")!.getCell("D3").font = {
      bold: true,
      color: { argb: "FF7A1F1F" },
    };
  }
  return workbook;
};

const validV2Workbook = async (
  options: {
    readonly catalog?: readonly Readonly<Record<string, string>>[];
    readonly aliases?: readonly Readonly<Record<string, string>>[];
    readonly provenance?: readonly Readonly<Record<string, string>>[];
    readonly contributors?: readonly Readonly<Record<string, string>>[];
    readonly publicCitations?: readonly Readonly<Record<string, string>>[];
  } = {},
): Promise<ExcelJS.Workbook> => {
  const workbook = await loadV2Template();
  setV2TableRows(
    workbook.getWorksheet("01_Catalog")!,
    "CatalogImportTable",
    CATALOG_IMPORT_V2_CATALOG_HEADERS,
    options.catalog ?? v2CatalogRows,
  );
  setV2TableRows(
    workbook.getWorksheet("02_Aliases")!,
    "AliasImportTable",
    CATALOG_IMPORT_ALIAS_HEADERS,
    options.aliases ?? v2AliasRows,
  );
  setV2TableRows(
    workbook.getWorksheet("03_Provenance")!,
    "ProvenanceImportTable",
    CATALOG_IMPORT_PROVENANCE_HEADERS,
    options.provenance ?? v2ProvenanceRows,
  );
  setV2TableRows(
    workbook.getWorksheet("04_Contributors")!,
    "ContributorImportTable",
    CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
    options.contributors ?? v2ContributorRows,
  );
  setV2TableRows(
    workbook.getWorksheet("05_Public_Citations")!,
    "PublicCitationImportTable",
    CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
    options.publicCitations ?? v2PublicCitationRows,
  );
  return workbook;
};

const workbookBytes = async (workbook: ExcelJS.Workbook): Promise<Uint8Array> =>
  new Uint8Array(await workbook.xlsx.writeBuffer());

const expectDiagnostic = async (
  promise: Promise<unknown>,
  code: CatalogImportDiagnosticCode,
): Promise<CatalogImportDiagnosticError> => {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogImportDiagnosticError);
    const diagnosticError = error as CatalogImportDiagnosticError;
    expect(diagnosticError.diagnostics.map((item) => item.code)).toContain(
      code,
    );
    return diagnosticError;
  }
  throw new Error(`Expected ${code}`);
};

const mutateZip = async (
  input: Uint8Array,
  mutate: (zip: JSZip) => void | Promise<void>,
): Promise<Uint8Array> => {
  const zip = await JSZip.loadAsync(input);
  await mutate(zip);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
};

const replaceAllBytes = (
  input: Uint8Array,
  from: string,
  to: string,
): Uint8Array => {
  expect(Buffer.byteLength(from)).toBe(Buffer.byteLength(to));
  const output = Buffer.from(input);
  const needle = Buffer.from(from);
  const replacement = Buffer.from(to);
  let offset = 0;
  let replacements = 0;
  while ((offset = output.indexOf(needle, offset)) !== -1) {
    replacement.copy(output, offset);
    offset += replacement.length;
    replacements += 1;
  }
  expect(replacements).toBeGreaterThan(1);
  return output;
};

describe("catalog-import/v1 CSV/XLSX convergence", () => {
  it("accepts the approved blank workbook security/structure while preserving the non-empty canonical invariant", async () => {
    const bytes = await readFile(templatePath);
    await expect(
      preflightCatalogImportXlsxWorkbook(bytes),
    ).resolves.toMatchObject({
      sourceArtifactSha256:
        "58b46464905282e700e541e51096bae7175d63b64c535998f3ec70ec88884e5e",
      sheets: ["01_Catalog", "02_Aliases", "03_Provenance", "99_Instructions"],
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(bytes),
      "CANONICAL_INVARIANT",
    );
  });

  it("produces the same canonical envelope, hash, row counts, and dry-run hash", async () => {
    const csv = await parseCatalogImportCsvBundle(await writeCsvBundle());
    const xlsx = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(await validWorkbook()),
    );
    expect(xlsx.envelope).toEqual(csv.envelope);
    expect(xlsx.canonicalJson).toBe(csv.canonicalJson);
    expect(xlsx.canonicalInputSha256).toBe(csv.canonicalInputSha256);
    expect(xlsx.rowCounts).toEqual(csv.rowCounts);
    expect(
      xlsx.envelope.catalogRows.find(
        ({ catalogImportId }) => catalogImportId === "item-z",
      )?.sourceId,
    ).toBe("000123");
    expect(xlsx.envelope.provenanceRows[2]?.sourceUrl).toBe(
      "https://example.invalid/source/a",
    );

    const emptyQueryPort = {
      query: () => Promise.resolve({ rows: [], rowCount: 0 }),
    };
    const completedAt = "2026-08-15T00:00:00.000Z";
    const csvDryRun = await createCatalogImportDryRun(
      emptyQueryPort,
      csv,
      completedAt,
    );
    const xlsxDryRun = await createCatalogImportDryRun(
      emptyQueryPort,
      xlsx,
      completedAt,
    );
    expect(xlsxDryRun).toEqual(csvDryRun);
    expect(xlsxDryRun.dryRunResultSha256).toBe(csvDryRun.dryRunResultSha256);
  });

  it("reads data after a blank first editable row", async () => {
    const workbook = await loadTemplate();
    setRows(
      workbook.getWorksheet("01_Catalog")!,
      CATALOG_IMPORT_CATALOG_HEADERS,
      [catalogRows[0]],
      4,
    );
    setRows(
      workbook.getWorksheet("02_Aliases")!,
      CATALOG_IMPORT_ALIAS_HEADERS,
      [aliasRows[0]],
      4,
    );
    setRows(
      workbook.getWorksheet("03_Provenance")!,
      CATALOG_IMPORT_PROVENANCE_HEADERS,
      [provenanceRows[0]],
      4,
    );

    const parsed = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(workbook),
    );
    expect(parsed.rowCounts).toEqual({ catalog: 1, aliases: 1, provenance: 1 });
    expect(parsed.envelope.catalogRows[0]?.catalogImportId).toBe("item-z");
  });

  it("accepts a realistic 1,658-row synthetic workbook within every OOXML resource bound", async () => {
    const syntheticCatalogRows = Array.from(
      { length: realisticCatalogRowCount },
      (_, index) => {
        const serial = String(index + 1).padStart(4, "0");
        return {
          catalogImportId: `synthetic-large-${serial}`,
          sourceId: `synthetic-source-${serial}`,
          catalogId: "",
          title: `合成容量测试条目 ${serial}`,
          catalogKind: index % 2 === 0 ? "inscription" : "calligraphy",
          dynasty: "",
          dynastyState: "UNSUPPLIED",
          dateText: "",
          dateTextState: "UNKNOWN",
          province: "",
          provinceState: "UNSUPPLIED",
          prefecture: "",
          prefectureState: "UNSUPPLIED",
          county: "",
          countyState: "UNSUPPLIED",
          currentLocation: "",
          currentLocationState: "UNKNOWN",
          currentCustodian: "",
          currentCustodianState: "UNSUPPLIED",
          description: `仅用于自动化回归的合成说明 ${serial}`,
          descriptionState: "VALUE",
          ownerNote: "",
        };
      },
    );
    const syntheticProvenanceRows = syntheticCatalogRows.map(
      ({ catalogImportId, sourceId }, index) => {
        const serial = String(index + 1).padStart(4, "0");
        return {
          catalogImportId,
          sourceId,
          sourceTitle: `合成容量测试来源 ${serial}`,
          sourceTypeRaw: "synthetic-capacity-regression",
          sourceUrl: `https://example.invalid/synthetic-capacity/${serial}`,
          sourceNote: "synthetic-only",
        };
      },
    );
    const bytes = await workbookBytes(
      await validWorkbook({
        catalog: syntheticCatalogRows,
        aliases: [],
        provenance: syntheticProvenanceRows,
      }),
    );
    expect(CATALOG_IMPORT_XLSX_LIMITS.maximumCompressionRatio).toBe(200);
    const preflight = await preflightCatalogImportXlsxWorkbook(bytes);
    expect(preflight.compressedBytes).toBeLessThan(
      CATALOG_IMPORT_XLSX_LIMITS.maximumCompressedBytes,
    );
    expect(preflight.expandedBytes).toBeLessThan(
      CATALOG_IMPORT_XLSX_LIMITS.maximumExpandedBytes,
    );
    expect(preflight.entryCount).toBeLessThan(
      CATALOG_IMPORT_XLSX_LIMITS.maximumEntries,
    );

    const parsed = await parseCatalogImportXlsxWorkbook(bytes);
    expect(parsed.rowCounts).toEqual({
      catalog: realisticCatalogRowCount,
      aliases: 0,
      provenance: realisticCatalogRowCount,
    });
    expect(parsed.envelope.catalogRows[0]?.sourceId).toBe(
      "synthetic-source-0001",
    );
    expect(parsed.envelope.catalogRows.at(-1)?.sourceId).toBe(
      "synthetic-source-1658",
    );
  });

  it("keeps formatting, row order, and ZIP metadata outside the canonical hash", async () => {
    const ordinary = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(await validWorkbook()),
    );
    const styled = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(await validWorkbook({ styleVariant: true })),
    );
    const reordered = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(
        await validWorkbook({
          catalog: [...catalogRows].reverse(),
          aliases: [...aliasRows].reverse(),
          provenance: [...provenanceRows].reverse(),
        }),
      ),
    );
    expect(styled.canonicalInputSha256).toBe(ordinary.canonicalInputSha256);
    expect(reordered.canonicalInputSha256).toBe(ordinary.canonicalInputSha256);
    expect(styled.sourceArtifactSha256).not.toBe(ordinary.sourceArtifactSha256);
  });

  it("never treats workbook or CSV content as apply authorization", async () => {
    const ordinary = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(await validWorkbook()),
    );
    const workbook = await validWorkbook();
    workbook.getWorksheet("99_Instructions")!.getCell("A71").value =
      "approved=true; Owner approval; allow import";
    const annotated = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(workbook),
    );
    expect(annotated.canonicalInputSha256).toBe(ordinary.canonicalInputSha256);
    expect(annotated).not.toHaveProperty("approval");

    const directory = await writeCsvBundle();
    await writeFile(
      path.join(directory, "approval.json"),
      '{"approved":true}\n',
    );
    await expectDiagnostic(
      parseCatalogImportCsvBundle(directory),
      "CSV_BUNDLE_LAYOUT_MISMATCH",
    );
  });

  it.each([
    ["LF", "\n" as const, false],
    ["CRLF", "\r\n" as const, false],
    ["UTF-8 BOM", "\n" as const, true],
  ])("keeps valid %s CSV input", async (_label, newline, bom) => {
    await expect(
      parseCatalogImportCsvBundle(await writeCsvBundle({ newline, bom })),
    ).resolves.toMatchObject({
      rowCounts: { catalog: 2, aliases: 2, provenance: 3 },
    });
  });

  it("rejects mixed LF/CRLF and malformed CSV", async () => {
    const mixed = await writeCsvBundle();
    const catalogPath = path.join(mixed, "catalog.csv");
    const text = await readFile(catalogPath, "utf8");
    await writeFile(catalogPath, text.replace("\n", "\r\n"));
    await expectDiagnostic(
      parseCatalogImportCsvBundle(mixed),
      "CSV_NEWLINE_STYLE_MISMATCH",
    );

    const malformed = await writeCsvBundle();
    await writeFile(
      path.join(malformed, "aliases.csv"),
      `${CATALOG_IMPORT_ALIAS_HEADERS.join(",")}\n"unterminated\n`,
    );
    await expectDiagnostic(
      parseCatalogImportCsvBundle(malformed),
      "CSV_MALFORMED",
    );
  });

  it.each([
    ["duplicate", "catalogImportId,catalogImportId,aliasType"],
    ["case variation", "CatalogImportId,alias,aliasType"],
    ["unknown", "catalogImportId,alias,unknown"],
  ])("rejects %s CSV headers", async (_label, headers) => {
    const directory = await writeCsvBundle();
    await writeFile(path.join(directory, "aliases.csv"), `${headers}\n`);
    await expectDiagnostic(
      parseCatalogImportCsvBundle(directory),
      "CSV_HEADER_MISMATCH",
    );
  });
});

describe("XLSX security and structural validation", () => {
  it("rejects invalid ZIP, non-XLSX ZIP, and a missing workbook relationship", async () => {
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(Buffer.from("not-a-zip")),
      "OOXML_INVALID_CONTAINER",
    );
    const nonXlsx = new JSZip();
    nonXlsx.file("readme.txt", "not xlsx");
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(
        await nonXlsx.generateAsync({ type: "uint8array" }),
      ),
      "OOXML_MISSING_REQUIRED_PART",
    );
    const missingRelationship = await mutateZip(
      await workbookBytes(await validWorkbook()),
      (zip) => {
        zip.remove("_rels/.rels");
      },
    );
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(missingRelationship),
      "OOXML_MISSING_REQUIRED_PART",
    );
  });

  it.each([
    [
      "layout version",
      "B69",
      "catalog-import-xlsx/v2",
      "XLSX_WORKBOOK_VERSION_MISMATCH",
    ],
    [
      "contract version",
      "B70",
      "catalog-import/v2",
      "XLSX_WORKBOOK_VERSION_MISMATCH",
    ],
    ["missing metadata", "B69", "", "XLSX_WORKBOOK_VERSION_MISMATCH"],
    ["metadata key", "A69", "layoutVersion", "XLSX_METADATA_MISMATCH"],
  ] as const)("rejects wrong %s", async (_label, address, value, code) => {
    const workbook = await validWorkbook();
    workbook.getWorksheet("99_Instructions")!.getCell(address).value = value;
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(workbook)),
      code,
    );
  });

  it("rejects missing, extra, hidden, and renamed sheets", async () => {
    for (const mutate of [
      (workbook: ExcelJS.Workbook) =>
        workbook.removeWorksheet(workbook.getWorksheet("02_Aliases")!.id),
      (workbook: ExcelJS.Workbook) => workbook.addWorksheet("04_Extra"),
      (workbook: ExcelJS.Workbook) => {
        workbook.getWorksheet("02_Aliases")!.state = "hidden";
      },
      (workbook: ExcelJS.Workbook) => {
        workbook.getWorksheet("02_Aliases")!.name = "02_Alias";
      },
    ]) {
      const workbook = await validWorkbook();
      mutate(workbook);
      await expectDiagnostic(
        parseCatalogImportXlsxWorkbook(await workbookBytes(workbook)),
        "XLSX_SHEET_LAYOUT_MISMATCH",
      );
    }
  });

  it("rejects wrong, duplicate, missing, and out-of-layout machine columns", async () => {
    for (const mutate of [
      (sheet: ExcelJS.Worksheet) => {
        sheet.getCell("D2").value = "Title";
      },
      (sheet: ExcelJS.Worksheet) => {
        sheet.getCell("D2").value = "catalogKind";
      },
      (sheet: ExcelJS.Worksheet) => {
        sheet.getCell("D2").value = "";
      },
    ]) {
      const workbook = await validWorkbook();
      mutate(workbook.getWorksheet("01_Catalog")!);
      await expectDiagnostic(
        parseCatalogImportXlsxWorkbook(await workbookBytes(workbook)),
        "XLSX_HEADER_MISMATCH",
      );
    }
    const outside = await validWorkbook();
    outside.getWorksheet("01_Catalog")!.getCell("W3").value = "ignored?";
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(outside)),
      "XLSX_SHEET_LAYOUT_MISMATCH",
    );
  });

  it.each([
    ["numeric identity", 123],
    ["date", new Date("2026-08-15T00:00:00.000Z")],
    ["boolean", true],
    ["error", { error: "#VALUE!" }],
    ["rich text", { richText: [{ text: "hidden style" }] }],
  ])("rejects %s canonical cell types", async (_label, value) => {
    const workbook = await validWorkbook();
    workbook.getWorksheet("01_Catalog")!.getCell("B3").value =
      value as ExcelJS.CellValue;
    const error = await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(workbook)),
      "XLSX_UNSUPPORTED_CELL_TYPE",
    );
    expect(error.diagnostics[0]).toMatchObject({
      sheet: "01_Catalog",
      row: 3,
      machineHeader: "sourceId",
      cellReference: "B3",
    });
  });

  it("rejects formula cells including cached results and hyperlink relationships", async () => {
    const formula = await validWorkbook();
    formula.getWorksheet("01_Catalog")!.getCell("D3").value = {
      formula: '="synthetic"',
      result: "synthetic",
    };
    const formulaError = await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(formula)),
      "XLSX_ACTIVE_CONTENT",
    );
    expect(formulaError.diagnostics[0]).toMatchObject({
      sheet: "01_Catalog",
      row: 3,
      cellReference: "D3",
    });

    const hyperlink = await validWorkbook();
    hyperlink.getWorksheet("03_Provenance")!.getCell("E3").value = {
      text: "https://example.invalid/source",
      hyperlink: "https://example.invalid/source",
    };
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(hyperlink)),
      "XLSX_EXTERNAL_RELATIONSHIP",
    );
  });

  it.each([
    ["macro", "xl/vbaProject.bin"],
    ["external link", "xl/externalLinks/externalLink1.xml"],
    ["external connection", "xl/connections.xml"],
    ["embedded object", "xl/embeddings/oleObject1.bin"],
  ])("rejects %s OOXML payloads", async (_label, partName) => {
    const bytes = await mutateZip(
      await workbookBytes(await validWorkbook()),
      (zip) => {
        zip.file(partName, "synthetic unsafe payload");
      },
    );
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(bytes),
      "XLSX_ACTIVE_CONTENT",
    );
  });

  it("rejects malicious paths, duplicate entries, unsafe XML, and resource attacks", async () => {
    const base = await workbookBytes(await validWorkbook());
    const safePath = await mutateZip(base, (zip) => {
      zip.file("xl/evil.xml", "<safe/>");
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(
        replaceAllBytes(safePath, "xl/evil.xml", "../evil.xml"),
      ),
      "OOXML_UNSAFE_ENTRY_PATH",
    );

    const distinct = await mutateZip(base, (zip) => {
      zip.file("xl/dup1.xml", "<one/>");
      zip.file("xl/dup2.xml", "<two/>");
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(
        replaceAllBytes(distinct, "xl/dup2.xml", "xl/dup1.xml"),
      ),
      "OOXML_DUPLICATE_ENTRY",
    );

    const unsafeXml = await mutateZip(base, async (zip) => {
      const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
      zip.file(
        "xl/workbook.xml",
        workbookXml.replace(">", '><!DOCTYPE x [<!ENTITY x "unsafe">]>'),
      );
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(unsafeXml),
      "OOXML_UNSAFE_XML",
    );

    const bomb = await mutateZip(base, (zip) => {
      zip.file(
        "xl/large.xml",
        "A".repeat(
          Math.min(
            CATALOG_IMPORT_XLSX_LIMITS.maximumEntryBytes,
            2 * 1024 * 1024,
          ),
        ),
      );
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(bomb),
      "OOXML_RESOURCE_LIMIT",
    );

    const excessiveRow = await mutateZip(base, async (zip) => {
      const partName = "xl/worksheets/sheet1.xml";
      const worksheetXml = await zip.file(partName)!.async("string");
      expect(worksheetXml).toContain('r="A3"');
      zip.file(partName, worksheetXml.replace('r="A3"', 'r="A10003"'));
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(excessiveRow),
      "OOXML_RESOURCE_LIMIT",
    );
  });

  it("maps semantic and cross-row failures back to visible XLSX locations", async () => {
    const invalidKind = await validWorkbook({
      catalog: [{ ...catalogRows[0], catalogKind: "seal" }, catalogRows[1]],
    });
    const kindError = await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(invalidKind)),
      "TABULAR_ROW_INVALID",
    );
    expect(kindError.diagnostics[0]).toMatchObject({
      sheet: "01_Catalog",
      row: 3,
      machineHeader: "catalogKind",
      cellReference: "E3",
    });

    const invalidState = await validWorkbook({
      catalog: [
        { ...catalogRows[0], dynasty: "唐", dynastyState: "UNKNOWN" },
        catalogRows[1],
      ],
    });
    const stateError = await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(invalidState)),
      "TABULAR_ROW_INVALID",
    );
    expect(stateError.diagnostics[0]).toMatchObject({
      sheet: "01_Catalog",
      row: 3,
      machineHeader: "dynastyState",
      cellReference: "G3",
    });

    const duplicate = await validWorkbook({
      catalog: [
        catalogRows[0],
        { ...catalogRows[1], catalogImportId: "item-z" },
      ],
    });
    const duplicateError = await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(duplicate)),
      "CANONICAL_INVARIANT",
    );
    expect(duplicateError.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheet: "01_Catalog",
          row: 4,
          machineHeader: "catalogImportId",
          cellReference: "A4",
        }),
      ]),
    );

    const duplicateSource = await validWorkbook({
      catalog: [catalogRows[0], { ...catalogRows[1], sourceId: "000123" }],
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(duplicateSource)),
      "CANONICAL_INVARIANT",
    );

    const badAlias = await validWorkbook({
      aliases: [{ ...aliasRows[0], aliasType: "other" }, aliasRows[1]],
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(badAlias)),
      "TABULAR_ROW_INVALID",
    );

    const brokenReference = await validWorkbook({
      provenance: [
        { ...provenanceRows[0], catalogImportId: "missing" },
        provenanceRows[1],
        provenanceRows[2],
      ],
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(brokenReference)),
      "CANONICAL_INVARIANT",
    );
  });

  it("surfaces missing primary provenance as a dry-run identity blocker", async () => {
    const workbook = await validWorkbook({
      provenance: provenanceRows.filter(
        ({ sourceId }) => sourceId !== "source-ascii-001",
      ),
    });
    const parsed = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(workbook),
    );
    const dryRun = await createCatalogImportDryRun(
      { query: () => Promise.resolve({ rows: [], rowCount: 0 }) },
      parsed,
      "2026-08-15T00:00:00.000Z",
    );
    expect(dryRun).toMatchObject({
      state: "FAILED",
      applyReady: false,
      applyBlockers: ["IDENTITY_CONFLICT"],
    });
  });
});

describe("catalog-import/v2 CSV/XLSX versioned parsing", () => {
  it("preflights the generated template and converges complete CSV/XLSX input", async () => {
    await expect(
      preflightCatalogImportXlsxWorkbook(await readFile(v2TemplatePath)),
    ).resolves.toMatchObject({
      sheets: [
        "01_Catalog",
        "02_Aliases",
        "03_Provenance",
        "04_Contributors",
        "05_Public_Citations",
        "99_Instructions",
      ],
    });
    const citationRows = [
      ...v2PublicCitationRows,
      {
        catalogImportId: "item-z",
        position: "2",
        label: "第二条合成公开引文",
        citation: "仅用于重排测试",
        url: "",
        appliesTo: "record|scholarlyResearch",
      },
    ];
    const csv = await parseCatalogImportCsvBundle(
      await writeV2CsvBundle({ publicCitations: citationRows }),
    );
    const xlsx = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(
        await validV2Workbook({
          contributors: [...v2ContributorRows].reverse(),
          publicCitations: [...citationRows].reverse(),
        }),
      ),
    );

    expect(csv.envelope.importContractVersion).toBe("catalog-import/v2");
    expect(xlsx.envelope).toEqual(csv.envelope);
    expect(xlsx.canonicalJson).toBe(csv.canonicalJson);
    expect(xlsx.canonicalInputSha256).toBe(csv.canonicalInputSha256);
    expect(xlsx.rowCounts).toEqual({
      catalog: 1,
      aliases: 1,
      provenance: 1,
      contributors: 2,
      publicCitations: 2,
    });
    if (xlsx.envelope.importContractVersion !== "catalog-import/v2") {
      throw new Error("Expected catalog-import/v2");
    }
    expect(xlsx.envelope.catalogRows[0]?.transcription).toEqual({
      state: "VALUE",
      value: "第一行\n第二行（synthetic）",
    });
    expect(
      (
        JSON.parse(xlsx.canonicalJson) as {
          readonly contributorRows: readonly { readonly position: number }[];
        }
      ).contributorRows.map(({ position }) => position),
    ).toEqual([0, 1]);
    expect(xlsx.envelope.publicCitationRows[0]?.appliesTo).toEqual([
      "description",
      "transcription",
    ]);
    expect(
      xlsx.envelope.publicCitationRows.map(({ position }) => position),
    ).toEqual([0, 2]);
  });

  it("preserves the exact PostgreSQL INTEGER maximum across CSV and XLSX", async () => {
    const contributors = [
      v2ContributorRows[1],
      { ...v2ContributorRows[0], position: "2147483647" },
    ];
    const publicCitations = [
      { ...v2PublicCitationRows[0], position: "2147483647" },
    ];
    const csv = await parseCatalogImportCsvBundle(
      await writeV2CsvBundle({ contributors, publicCitations }),
    );
    const xlsx = await parseCatalogImportXlsxWorkbook(
      await workbookBytes(
        await validV2Workbook({ contributors, publicCitations }),
      ),
    );

    expect(xlsx.envelope).toEqual(csv.envelope);
    expect(xlsx.canonicalJson).toBe(csv.canonicalJson);
    expect(xlsx.canonicalInputSha256).toBe(csv.canonicalInputSha256);
    if (xlsx.envelope.importContractVersion !== "catalog-import/v2") {
      throw new Error("Expected catalog-import/v2");
    }
    expect(
      xlsx.envelope.contributorRows.map(({ position }) => position),
    ).toEqual([0, 2_147_483_647]);
    expect(
      xlsx.envelope.publicCitationRows.map(({ position }) => position),
    ).toEqual([2_147_483_647]);
  });

  it("accepts exact empty child files when both collection actions preserve", async () => {
    const catalog = [
      {
        ...v2CatalogRows[0],
        contributorsAction: "",
        publicCitationsAction: "PRESERVE",
      },
    ];
    const parsed = await parseCatalogImportCsvBundle(
      await writeV2CsvBundle({
        catalog,
        contributors: [],
        publicCitations: [],
      }),
    );
    expect(parsed.rowCounts).toEqual({
      catalog: 1,
      aliases: 1,
      provenance: 1,
      contributors: 0,
      publicCitations: 0,
    });
    if (parsed.envelope.importContractVersion !== "catalog-import/v2") {
      throw new Error("Expected catalog-import/v2");
    }
    expect(parsed.envelope.catalogRows[0]).toMatchObject({
      contributorsAction: "PRESERVE",
      publicCitationsAction: "PRESERVE",
    });
  });

  it.each([
    ["LF", "\n" as const, false],
    ["CRLF", "\r\n" as const, false],
    ["UTF-8 BOM", "\n" as const, true],
  ])("keeps valid v2 %s CSV input", async (_label, newline, bom) => {
    await expect(
      parseCatalogImportCsvBundle(
        await writeV2CsvBundle({
          newline,
          bom,
          catalog: [{ ...v2CatalogRows[0], transcription: "单行合成文本" }],
        }),
      ),
    ).resolves.toMatchObject({
      envelope: { importContractVersion: "catalog-import/v2" },
      rowCounts: { contributors: 2, publicCitations: 1 },
    });
  });

  it("selects CSV layout only after validating explicit manifest metadata", async () => {
    const v1ManifestWithV2Files = await writeV2CsvBundle({
      manifestVersion: "catalog-import/v1",
    });
    await expectDiagnostic(
      parseCatalogImportCsvBundle(v1ManifestWithV2Files),
      "CSV_BUNDLE_LAYOUT_MISMATCH",
    );

    const unknownManifest = await writeV2CsvBundle({
      manifestVersion: "catalog-import/v99",
    });
    await writeFile(path.join(unknownManifest, "catalog.csv"), "broken");
    const unknownError = await expectDiagnostic(
      parseCatalogImportCsvBundle(unknownManifest),
      "CSV_BUNDLE_LAYOUT_MISMATCH",
    );
    expect(unknownError.diagnostics[0]?.category).toBe("VERSION_METADATA");

    const missingFile = await writeV2CsvBundle();
    await rm(path.join(missingFile, "contributors.csv"));
    await expectDiagnostic(
      parseCatalogImportCsvBundle(missingFile),
      "CSV_BUNDLE_LAYOUT_MISMATCH",
    );

    const extraFile = await writeV2CsvBundle();
    await writeFile(path.join(extraFile, "unexpected.csv"), "unexpected\n");
    await expectDiagnostic(
      parseCatalogImportCsvBundle(extraFile),
      "CSV_BUNDLE_LAYOUT_MISMATCH",
    );

    const missingVersion = await writeV2CsvBundle();
    await writeFile(
      path.join(missingVersion, "00_manifest.csv"),
      "importContractVersion\n\n",
    );
    const missingVersionError = await expectDiagnostic(
      parseCatalogImportCsvBundle(missingVersion),
      "CSV_BUNDLE_LAYOUT_MISMATCH",
    );
    expect(missingVersionError.diagnostics[0]?.category).toBe(
      "VERSION_METADATA",
    );
  });

  it.each([
    ["duplicate", "catalogImportId,catalogImportId,name,role"],
    ["unknown", "catalogImportId,position,name,unknown"],
  ])("rejects v2 %s CSV headers", async (_label, headers) => {
    const directory = await writeV2CsvBundle();
    await writeFile(path.join(directory, "contributors.csv"), `${headers}\n`);
    await expectDiagnostic(
      parseCatalogImportCsvBundle(directory),
      "CSV_HEADER_MISMATCH",
    );
  });

  it("rejects a v2 CSV row with the wrong width", async () => {
    const directory = await writeV2CsvBundle();
    await writeFile(
      path.join(directory, "contributors.csv"),
      `${CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS.join(",")}\nitem-z,0,合成作者,textAuthor,extra\n`,
    );
    await expectDiagnostic(
      parseCatalogImportCsvBundle(directory),
      "CSV_MALFORMED",
    );
  });

  it("rejects mismatched XLSX version pairs before selected-layout parsing", async () => {
    const v2Workbook = await validV2Workbook();
    v2Workbook.getWorksheet("99_Instructions")!.getCell("B93").value =
      "catalog-import/v1";
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(v2Workbook)),
      "XLSX_WORKBOOK_VERSION_MISMATCH",
    );

    const v1Workbook = await validWorkbook();
    v1Workbook.getWorksheet("99_Instructions")!.getCell("B70").value =
      "catalog-import/v2";
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(v1Workbook)),
      "XLSX_WORKBOOK_VERSION_MISMATCH",
    );
  });

  it("preserves v1 fixed-cell metadata behavior", async () => {
    const workbook = await validWorkbook();
    workbook.getWorksheet("99_Instructions")!.getCell("A71").value =
      "workbookLayoutVersion";
    await expect(
      parseCatalogImportXlsxWorkbook(await workbookBytes(workbook)),
    ).resolves.toMatchObject({
      envelope: { importContractVersion: "catalog-import/v1" },
    });
  });

  it("preserves v2 sheet, active-content, cell-type, and state protections", async () => {
    const extraSheet = await validV2Workbook();
    extraSheet.addWorksheet("06_Extra");
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(extraSheet)),
      "XLSX_SHEET_LAYOUT_MISMATCH",
    );

    const hiddenSheet = await validV2Workbook();
    hiddenSheet.getWorksheet("04_Contributors")!.state = "hidden";
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(hiddenSheet)),
      "XLSX_SHEET_LAYOUT_MISMATCH",
    );

    const formula = await validV2Workbook();
    formula.getWorksheet("01_Catalog")!.getCell("D3").value = {
      formula: '="synthetic"',
      result: "synthetic",
    };
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(formula)),
      "XLSX_ACTIVE_CONTENT",
    );

    const unsupportedCell = await validV2Workbook();
    unsupportedCell.getWorksheet("04_Contributors")!.getCell("B3").value = 0;
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(unsupportedCell)),
      "XLSX_UNSUPPORTED_CELL_TYPE",
    );

    const invalidState = await validV2Workbook();
    const stateColumn =
      CATALOG_IMPORT_V2_CATALOG_HEADERS.indexOf("transcriptionState") + 1;
    invalidState.getWorksheet("01_Catalog")!.getCell(3, stateColumn).value =
      "UNKNOWN";
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(invalidState)),
      "TABULAR_ROW_INVALID",
    );
  });

  it.each([
    [
      "malformed contributor position",
      { contributors: [{ ...v2ContributorRows[0], position: "01" }] },
    ],
    [
      "invalid contributor role",
      { contributors: [{ ...v2ContributorRows[0], role: "editor" }] },
    ],
    [
      "invalid scalar state/value pair",
      {
        catalog: [
          {
            ...v2CatalogRows[0],
            transcription: "supplied",
            transcriptionState: "CLEAR",
          },
        ],
      },
    ],
    [
      "invalid collection action",
      { catalog: [{ ...v2CatalogRows[0], contributorsAction: "MERGE" }] },
    ],
    [
      "inconsistent collection action",
      {
        catalog: [{ ...v2CatalogRows[0], contributorsAction: "PRESERVE" }],
      },
    ],
    [
      "malformed citation scope",
      {
        publicCitations: [
          { ...v2PublicCitationRows[0], appliesTo: "record||description" },
        ],
      },
    ],
    [
      "duplicate citation scope",
      {
        publicCitations: [
          { ...v2PublicCitationRows[0], appliesTo: "record|record" },
        ],
      },
    ],
    [
      "unknown citation scope",
      {
        publicCitations: [
          { ...v2PublicCitationRows[0], appliesTo: "record|title" },
        ],
      },
    ],
  ])("rejects %s", async (_label, options) => {
    await expectDiagnostic(
      parseCatalogImportCsvBundle(await writeV2CsvBundle(options)),
      _label === "inconsistent collection action"
        ? "CANONICAL_INVARIANT"
        : "TABULAR_ROW_INVALID",
    );
  });

  it("rejects the first out-of-range position in both v2 CSV child files", async () => {
    for (const options of [
      {
        contributors: [{ ...v2ContributorRows[0], position: "2147483648" }],
      },
      {
        publicCitations: [
          { ...v2PublicCitationRows[0], position: "2147483648" },
        ],
      },
    ]) {
      const error = await expectDiagnostic(
        parseCatalogImportCsvBundle(await writeV2CsvBundle(options)),
        "TABULAR_ROW_INVALID",
      );
      expect(error.diagnostics[0]?.message).toBe(
        "position must be an integer from 0 through 2147483647",
      );
    }
  });

  it("rejects the first out-of-range position in both v2 XLSX child sheets", async () => {
    for (const options of [
      {
        contributors: [{ ...v2ContributorRows[0], position: "2147483648" }],
      },
      {
        publicCitations: [
          { ...v2PublicCitationRows[0], position: "2147483648" },
        ],
      },
    ]) {
      const error = await expectDiagnostic(
        parseCatalogImportXlsxWorkbook(
          await workbookBytes(await validV2Workbook(options)),
        ),
        "TABULAR_ROW_INVALID",
      );
      expect(error.diagnostics[0]?.message).toBe(
        "position must be an integer from 0 through 2147483647",
      );
    }
  });

  it("supports the 100,000-character CSV transcription maximum and rejects overflow", async () => {
    const atLimit = "文".repeat(100_000);
    const parsed = await parseCatalogImportCsvBundle(
      await writeV2CsvBundle({
        catalog: [{ ...v2CatalogRows[0], transcription: atLimit }],
      }),
    );
    if (parsed.envelope.importContractVersion !== "catalog-import/v2") {
      throw new Error("Expected catalog-import/v2");
    }
    expect(parsed.envelope.catalogRows[0]?.transcription).toEqual({
      state: "VALUE",
      value: atLimit,
    });
    await expectDiagnostic(
      parseCatalogImportCsvBundle(
        await writeV2CsvBundle({
          catalog: [{ ...v2CatalogRows[0], transcription: `${atLimit}文` }],
        }),
      ),
      "TABULAR_ROW_INVALID",
    );
  });

  it("enforces selected v2 table metadata and the XLSX physical cell limit", async () => {
    const wrongTable = await validV2Workbook();
    wrongTable
      .getWorksheet("04_Contributors")!
      .getTable("ContributorImportTable").name = "UnexpectedContributorTable";
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(wrongTable)),
      "XLSX_SHEET_LAYOUT_MISMATCH",
    );

    const outsideTable = await validV2Workbook();
    outsideTable.getWorksheet("01_Catalog")!.getCell("A4").value =
      "outside-declared-table";
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(outsideTable)),
      "XLSX_SHEET_LAYOUT_MISMATCH",
    );

    const oversized = await validV2Workbook({
      catalog: [{ ...v2CatalogRows[0], transcription: "文".repeat(32_768) }],
    });
    await expectDiagnostic(
      parseCatalogImportXlsxWorkbook(await workbookBytes(oversized)),
      "OOXML_RESOURCE_LIMIT",
    );
  });
});
