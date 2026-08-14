import { SaxesParser } from "saxes";
import * as yauzl from "yauzl";

import {
  CatalogImportDiagnosticError,
  failCatalogImport,
} from "../diagnostics.js";

import type { CatalogImportDiagnostic } from "../diagnostics.js";

export const CATALOG_IMPORT_XLSX_LIMITS = {
  maximumCompressedBytes: 16 * 1024 * 1024,
  maximumExpandedBytes: 64 * 1024 * 1024,
  maximumEntryBytes: 16 * 1024 * 1024,
  maximumXmlEntryBytes: 8 * 1024 * 1024,
  maximumEntries: 256,
  maximumCompressionRatio: 200,
  maximumDataRowsPerSheet: 10_000,
  maximumWorksheetRows: 10_002,
  maximumMaterializedCells: 250_000,
} as const;

export interface CatalogImportOoxmlPreflightResult {
  readonly compressedBytes: number;
  readonly expandedBytes: number;
  readonly entryCount: number;
}

const requiredParts = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
] as const;

const forbiddenPartPatterns = [
  /(?:^|\/)vbaProject\.bin$/i,
  /(?:^|\/)activeX(?:\/|$)/i,
  /(?:^|\/)ctrlProps(?:\/|$)/i,
  /(?:^|\/)customXml(?:\/|$)/i,
  /(?:^|\/)drawings(?:\/|$)/i,
  /(?:^|\/)embeddings(?:\/|$)/i,
  /(?:^|\/)externalLinks(?:\/|$)/i,
  /(?:^|\/)media(?:\/|$)/i,
  /(?:^|\/)oleObjects(?:\/|$)/i,
  /(?:^|\/)pivotCache(?:\/|$)/i,
  /(?:^|\/)printerSettings(?:\/|$)/i,
  /(?:^|\/)threadedComments(?:\/|$)/i,
  /(?:^|\/)comments\d*\.xml$/i,
  /(?:^|\/)connections\.xml$/i,
];

const diagnostic = (
  code: CatalogImportDiagnostic["code"],
  category: CatalogImportDiagnostic["category"],
  message: string,
  file?: string,
): CatalogImportDiagnostic => ({
  code,
  severity: "ERROR",
  category,
  message,
  sourceFormat: "XLSX",
  ...(file === undefined ? {} : { file }),
});

const invalidContainer = (message: string): never =>
  failCatalogImport(
    diagnostic(
      "OOXML_INVALID_CONTAINER",
      "CONTAINER_OOXML",
      message,
      "workbook.xlsx",
    ),
  );

const unsafeZipPathError = (error: unknown): boolean =>
  error instanceof Error &&
  /invalid characters in fileName|invalid relative path|backslash/i.test(
    error.message,
  );

const assertSafeEntryName = (fileName: string): void => {
  const segments = fileName.split("/");
  if (
    fileName === "" ||
    fileName.includes("\\") ||
    fileName.includes("\0") ||
    fileName.startsWith("/") ||
    /^[A-Za-z]:/.test(fileName) ||
    segments.some((segment) => segment === ".." || segment === ".")
  ) {
    failCatalogImport(
      diagnostic(
        "OOXML_UNSAFE_ENTRY_PATH",
        "UNSAFE_WORKBOOK_CONTENT",
        "Workbook ZIP contains an unsafe entry path",
        fileName,
      ),
    );
  }
};

const readEntry = async (
  zipFile: yauzl.ZipFile,
  entry: yauzl.Entry,
): Promise<Buffer> => {
  const stream = await zipFile.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let expanded = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as Uint8Array);
    expanded += bytes.byteLength;
    if (
      expanded > entry.uncompressedSize ||
      expanded > CATALOG_IMPORT_XLSX_LIMITS.maximumEntryBytes
    ) {
      failCatalogImport(
        diagnostic(
          "OOXML_RESOURCE_LIMIT",
          "UNSAFE_WORKBOOK_CONTENT",
          "Workbook ZIP entry exceeds its declared or allowed expanded size",
          entry.fileName,
        ),
      );
    }
    chunks.push(bytes);
  }
  if (expanded !== entry.uncompressedSize) {
    invalidContainer("Workbook ZIP entry size does not match its declaration");
  }
  return Buffer.concat(chunks);
};

const attributeValue = (
  attributes: Record<
    string,
    { readonly local: string; readonly value: string }
  >,
  localName: string,
): string | undefined =>
  Object.values(attributes).find(({ local }) => local === localName)?.value;

const validateXml = (
  partName: string,
  bytes: Buffer,
): {
  readonly officeDocumentTargets: readonly string[];
  readonly materializedCells: number;
} => {
  let xml: string;
  try {
    xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return failCatalogImport(
      diagnostic(
        "OOXML_UNSAFE_XML",
        "CONTAINER_OOXML",
        "OOXML XML part is not valid UTF-8",
        partName,
      ),
    );
  }
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    failCatalogImport(
      diagnostic(
        "OOXML_UNSAFE_XML",
        "UNSAFE_WORKBOOK_CONTENT",
        "OOXML DTD and entity declarations are not supported",
        partName,
      ),
    );
  }
  const officeDocumentTargets: string[] = [];
  const isWorksheet = /^xl\/worksheets\/[^/]+\.xml$/i.test(partName);
  let worksheetRows = 0;
  let materializedCells = 0;
  try {
    const parser = new SaxesParser({ xmlns: true });
    parser.on("error", (error) => {
      throw error;
    });
    parser.on("opentag", (tag) => {
      if (isWorksheet && tag.local === "row") {
        worksheetRows += 1;
        const rowReference = attributeValue(tag.attributes, "r");
        const rowNumber = Number(rowReference);
        if (
          worksheetRows > CATALOG_IMPORT_XLSX_LIMITS.maximumWorksheetRows ||
          (rowReference !== undefined &&
            (!Number.isSafeInteger(rowNumber) ||
              rowNumber < 1 ||
              rowNumber > CATALOG_IMPORT_XLSX_LIMITS.maximumWorksheetRows))
        ) {
          failCatalogImport(
            diagnostic(
              "OOXML_RESOURCE_LIMIT",
              "UNSAFE_WORKBOOK_CONTENT",
              "Worksheet exceeds the physical row limit",
              partName,
            ),
          );
        }
      }
      if (isWorksheet && tag.local === "c") {
        materializedCells += 1;
        const cellReference = attributeValue(tag.attributes, "r");
        const rowMatch = cellReference?.match(/([1-9][0-9]*)$/);
        const cellRow = Number(rowMatch?.[1]);
        if (
          materializedCells >
            CATALOG_IMPORT_XLSX_LIMITS.maximumMaterializedCells ||
          (cellReference !== undefined &&
            (rowMatch === null ||
              !Number.isSafeInteger(cellRow) ||
              cellRow > CATALOG_IMPORT_XLSX_LIMITS.maximumWorksheetRows))
        ) {
          failCatalogImport(
            diagnostic(
              "OOXML_RESOURCE_LIMIT",
              "UNSAFE_WORKBOOK_CONTENT",
              "Worksheet exceeds the materialized cell or row limit",
              partName,
            ),
          );
        }
      }
      if (tag.local === "Relationship") {
        const targetMode = attributeValue(tag.attributes, "TargetMode");
        if (targetMode?.toLowerCase() === "external") {
          failCatalogImport(
            diagnostic(
              "XLSX_EXTERNAL_RELATIONSHIP",
              "UNSAFE_WORKBOOK_CONTENT",
              "Workbook external relationships are not permitted",
              partName,
            ),
          );
        }
        if (partName === "_rels/.rels") {
          const type = attributeValue(tag.attributes, "Type");
          const target = attributeValue(tag.attributes, "Target");
          if (type?.endsWith("/officeDocument") && target !== undefined) {
            officeDocumentTargets.push(target);
          }
        }
      }
      if (partName === "[Content_Types].xml") {
        const contentType = attributeValue(tag.attributes, "ContentType");
        if (
          contentType !== undefined &&
          /macroenabled|vba|activex|oleobject/i.test(contentType)
        ) {
          failCatalogImport(
            diagnostic(
              "XLSX_ACTIVE_CONTENT",
              "FORMULA_ACTIVE_CONTENT",
              "Workbook declares macro or embedded active content",
              partName,
            ),
          );
        }
      }
    });
    parser.write(xml).close();
  } catch (error) {
    if (error instanceof CatalogImportDiagnosticError) throw error;
    failCatalogImport(
      diagnostic(
        "OOXML_UNSAFE_XML",
        "CONTAINER_OOXML",
        "OOXML XML part is malformed",
        partName,
      ),
    );
  }
  return { officeDocumentTargets, materializedCells };
};

export const preflightCatalogImportOoxmlContainer = async (
  input: Uint8Array,
): Promise<CatalogImportOoxmlPreflightResult> => {
  if (input.byteLength > CATALOG_IMPORT_XLSX_LIMITS.maximumCompressedBytes) {
    failCatalogImport(
      diagnostic(
        "OOXML_RESOURCE_LIMIT",
        "UNSAFE_WORKBOOK_CONTENT",
        "Workbook exceeds the compressed input size limit",
        "workbook.xlsx",
      ),
    );
  }
  const source = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  let zipFile: yauzl.ZipFile;
  try {
    zipFile = await yauzl.fromBufferPromise(source, {
      autoClose: false,
      decodeStrings: true,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
  } catch {
    return invalidContainer("Workbook is not a valid ZIP container");
  }

  const names = new Set<string>();
  const xmlParts = new Map<string, Buffer>();
  let entryCount = 0;
  let expandedBytes = 0;
  try {
    for await (const entry of zipFile.eachEntry()) {
      entryCount += 1;
      if (entryCount > CATALOG_IMPORT_XLSX_LIMITS.maximumEntries) {
        failCatalogImport(
          diagnostic(
            "OOXML_RESOURCE_LIMIT",
            "UNSAFE_WORKBOOK_CONTENT",
            "Workbook exceeds the ZIP entry count limit",
            "workbook.xlsx",
          ),
        );
      }
      assertSafeEntryName(entry.fileName);
      if (names.has(entry.fileName)) {
        failCatalogImport(
          diagnostic(
            "OOXML_DUPLICATE_ENTRY",
            "UNSAFE_WORKBOOK_CONTENT",
            "Workbook ZIP contains duplicate entry names",
            entry.fileName,
          ),
        );
      }
      names.add(entry.fileName);
      if (entry.isEncrypted()) {
        failCatalogImport(
          diagnostic(
            "OOXML_ENCRYPTED_CONTENT",
            "UNSAFE_WORKBOOK_CONTENT",
            "Encrypted or password-protected workbook content is unsupported",
            entry.fileName,
          ),
        );
      }
      if (
        forbiddenPartPatterns.some((pattern) => pattern.test(entry.fileName))
      ) {
        failCatalogImport(
          diagnostic(
            "XLSX_ACTIVE_CONTENT",
            "FORMULA_ACTIVE_CONTENT",
            "Workbook contains unsupported active or hidden payload parts",
            entry.fileName,
          ),
        );
      }
      if (
        entry.uncompressedSize > CATALOG_IMPORT_XLSX_LIMITS.maximumEntryBytes ||
        (entry.compressedSize === 0 && entry.uncompressedSize > 0) ||
        (entry.compressedSize > 0 &&
          entry.uncompressedSize / entry.compressedSize >
            CATALOG_IMPORT_XLSX_LIMITS.maximumCompressionRatio)
      ) {
        failCatalogImport(
          diagnostic(
            "OOXML_RESOURCE_LIMIT",
            "UNSAFE_WORKBOOK_CONTENT",
            "Workbook ZIP entry exceeds resource limits",
            entry.fileName,
          ),
        );
      }
      expandedBytes += entry.uncompressedSize;
      if (expandedBytes > CATALOG_IMPORT_XLSX_LIMITS.maximumExpandedBytes) {
        failCatalogImport(
          diagnostic(
            "OOXML_RESOURCE_LIMIT",
            "UNSAFE_WORKBOOK_CONTENT",
            "Workbook exceeds the total expanded size limit",
            "workbook.xlsx",
          ),
        );
      }
      if (entry.fileName.endsWith("/")) continue;
      const content = await readEntry(zipFile, entry);
      if (
        entry.fileName.endsWith(".xml") ||
        entry.fileName.endsWith(".rels") ||
        entry.fileName === "[Content_Types].xml"
      ) {
        if (
          content.byteLength > CATALOG_IMPORT_XLSX_LIMITS.maximumXmlEntryBytes
        ) {
          failCatalogImport(
            diagnostic(
              "OOXML_RESOURCE_LIMIT",
              "UNSAFE_WORKBOOK_CONTENT",
              "Workbook XML part exceeds the XML size limit",
              entry.fileName,
            ),
          );
        }
        xmlParts.set(entry.fileName, content);
      }
    }
  } catch (error) {
    if (error instanceof CatalogImportDiagnosticError) throw error;
    if (unsafeZipPathError(error)) {
      return failCatalogImport(
        diagnostic(
          "OOXML_UNSAFE_ENTRY_PATH",
          "UNSAFE_WORKBOOK_CONTENT",
          "Workbook ZIP contains an unsafe entry path",
          "workbook.xlsx",
        ),
      );
    }
    return invalidContainer("Workbook ZIP could not be safely expanded");
  } finally {
    zipFile.close();
  }

  for (const part of requiredParts) {
    if (!names.has(part)) {
      failCatalogImport(
        diagnostic(
          "OOXML_MISSING_REQUIRED_PART",
          "CONTAINER_OOXML",
          "Workbook is missing a required OOXML part",
          part,
        ),
      );
    }
  }
  let officeDocumentTargets: readonly string[] = [];
  let materializedCells = 0;
  for (const [partName, content] of [...xmlParts.entries()].sort(
    ([left], [right]) => left.localeCompare(right, "en"),
  )) {
    const result = validateXml(partName, content);
    if (partName === "_rels/.rels") {
      officeDocumentTargets = result.officeDocumentTargets;
    }
    materializedCells += result.materializedCells;
    if (
      materializedCells > CATALOG_IMPORT_XLSX_LIMITS.maximumMaterializedCells
    ) {
      failCatalogImport(
        diagnostic(
          "OOXML_RESOURCE_LIMIT",
          "UNSAFE_WORKBOOK_CONTENT",
          "Workbook exceeds the materialized cell limit",
          partName,
        ),
      );
    }
  }
  if (
    officeDocumentTargets.length !== 1 ||
    officeDocumentTargets[0] !== "xl/workbook.xml"
  ) {
    failCatalogImport(
      diagnostic(
        "OOXML_MISSING_REQUIRED_PART",
        "CONTAINER_OOXML",
        "Workbook package must have exactly one relationship to xl/workbook.xml",
        "_rels/.rels",
      ),
    );
  }
  return { compressedBytes: input.byteLength, expandedBytes, entryCount };
};
