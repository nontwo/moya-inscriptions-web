import {
  CATALOG_IMPORT_CONTRACT_VERSION,
  aliasTypeSchema,
  catalogImportFieldStateSchema,
} from "./schemas.js";

export const CATALOG_IMPORT_SHEET_NAMES = [
  "01_Catalog",
  "02_Aliases",
  "03_Provenance",
  "99_Instructions",
] as const;

export const CATALOG_IMPORT_CATALOG_HEADERS = [
  "catalogImportId",
  "sourceId",
  "catalogId",
  "title",
  "catalogKind",
  "dynasty",
  "dynastyState",
  "dateText",
  "dateTextState",
  "province",
  "provinceState",
  "prefecture",
  "prefectureState",
  "county",
  "countyState",
  "currentLocation",
  "currentLocationState",
  "currentCustodian",
  "currentCustodianState",
  "description",
  "descriptionState",
  "ownerNote",
] as const;

export const CATALOG_IMPORT_ALIAS_HEADERS = [
  "catalogImportId",
  "alias",
  "aliasType",
] as const;

export const CATALOG_IMPORT_PROVENANCE_HEADERS = [
  "catalogImportId",
  "sourceId",
  "sourceTitle",
  "sourceTypeRaw",
  "sourceUrl",
  "sourceNote",
] as const;

export const CATALOG_IMPORT_MANIFEST_HEADERS = [
  "importContractVersion",
] as const;

export const CATALOG_IMPORT_FIELD_POLICY = {
  catalogImportId: { persistence: "RAW_ONLY", protection: "identity" },
  sourceId: { persistence: "SUPPORTED_NOW", protection: "identity" },
  catalogId: { persistence: "SUPPORTED_NOW", protection: "identity" },
  title: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  catalogKind: { persistence: "SUPPORTED_NOW", protection: "LEVEL_A" },
  dynasty: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  dateText: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  province: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  prefecture: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  county: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  currentLocation: {
    persistence: "SUPPORTED_NOW",
    protection: "LEVEL_B",
  },
  currentCustodian: {
    persistence: "SUPPORTED_NOW",
    protection: "LEVEL_B",
  },
  description: { persistence: "SUPPORTED_NOW", protection: "LEVEL_C" },
  ownerNote: { persistence: "RAW_ONLY", protection: "LEVEL_C" },
  alias: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  aliasType: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  sourceTitle: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  sourceTypeRaw: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  sourceUrl: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  sourceNote: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
} as const;

export const CATALOG_IMPORT_WORKBOOK_SPEC = {
  importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
  sheets: {
    "01_Catalog": { headers: CATALOG_IMPORT_CATALOG_HEADERS },
    "02_Aliases": { headers: CATALOG_IMPORT_ALIAS_HEADERS },
    "03_Provenance": { headers: CATALOG_IMPORT_PROVENANCE_HEADERS },
    "99_Instructions": {
      versionKey: "importContractVersion",
      versionValue: CATALOG_IMPORT_CONTRACT_VERSION,
    },
  },
  allowedValues: {
    catalogKind: ["inscription", "calligraphy"],
    fieldState: catalogImportFieldStateSchema.options,
    descriptionState: ["VALUE", "UNSUPPLIED", "CLEAR"],
    aliasType: aliasTypeSchema.options,
  },
} as const;

export const CATALOG_IMPORT_CSV_SPEC = {
  files: {
    "00_manifest.csv": CATALOG_IMPORT_MANIFEST_HEADERS,
    "catalog.csv": CATALOG_IMPORT_CATALOG_HEADERS,
    "aliases.csv": CATALOG_IMPORT_ALIAS_HEADERS,
    "provenance.csv": CATALOG_IMPORT_PROVENANCE_HEADERS,
  },
  inputEncoding: "UTF-8 with optional BOM",
  inputNewlines: ["LF", "CRLF"],
  outputEncoding: "UTF-8 without BOM",
  outputNewline: "LF",
  finalNewline: true,
  unknownColumns: "REJECT",
  duplicateColumns: "REJECT",
} as const;
