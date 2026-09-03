import {
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_CITATION_SCOPE_ORDER,
  CATALOG_IMPORT_V2_CONTRACT_VERSION,
  aliasTypeSchema,
  catalogImportCollectionActionSchema,
  catalogImportFieldStateSchema,
} from "./schemas.js";
import { catalogContributorRoleSchema } from "../../schemas.js";

export const CATALOG_IMPORT_SHEET_NAMES = [
  "01_Catalog",
  "02_Aliases",
  "03_Provenance",
  "99_Instructions",
] as const;

export const CATALOG_IMPORT_V2_SHEET_NAMES = [
  "01_Catalog",
  "02_Aliases",
  "03_Provenance",
  "04_Contributors",
  "05_Public_Citations",
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

export const CATALOG_IMPORT_V2_CATALOG_HEADERS = [
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
  "scriptStyle",
  "scriptStyleState",
  "transcription",
  "transcriptionState",
  "historicalContext",
  "historicalContextState",
  "scholarlyResearch",
  "scholarlyResearchState",
  "contributorsAction",
  "publicCitationsAction",
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

export const CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS = [
  "catalogImportId",
  "position",
  "name",
  "role",
] as const;

export const CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS = [
  "catalogImportId",
  "position",
  "label",
  "citation",
  "url",
  "appliesTo",
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

export const CATALOG_IMPORT_V2_FIELD_POLICY = {
  ...CATALOG_IMPORT_FIELD_POLICY,
  scriptStyle: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  transcription: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  historicalContext: {
    persistence: "SUPPORTED_NOW",
    protection: "LEVEL_C",
  },
  scholarlyResearch: {
    persistence: "SUPPORTED_NOW",
    protection: "LEVEL_C",
  },
  contributors: { persistence: "SUPPORTED_NOW", protection: "LEVEL_B" },
  publicCitations: {
    persistence: "SUPPORTED_NOW",
    protection: "LEVEL_B",
  },
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

export const CATALOG_IMPORT_V2_WORKBOOK_SPEC = {
  importContractVersion: CATALOG_IMPORT_V2_CONTRACT_VERSION,
  sheets: {
    "01_Catalog": { headers: CATALOG_IMPORT_V2_CATALOG_HEADERS },
    "02_Aliases": { headers: CATALOG_IMPORT_ALIAS_HEADERS },
    "03_Provenance": { headers: CATALOG_IMPORT_PROVENANCE_HEADERS },
    "04_Contributors": { headers: CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS },
    "05_Public_Citations": {
      headers: CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
    },
    "99_Instructions": {
      versionKey: "importContractVersion",
      versionValue: CATALOG_IMPORT_V2_CONTRACT_VERSION,
    },
  },
  allowedValues: {
    catalogKind: ["inscription", "calligraphy"],
    fieldState: catalogImportFieldStateSchema.options,
    descriptionState: ["VALUE", "UNSUPPLIED", "CLEAR"],
    longFormState: ["VALUE", "UNSUPPLIED", "CLEAR"],
    aliasType: aliasTypeSchema.options,
    collectionAction: catalogImportCollectionActionSchema.options,
    contributorRole: catalogContributorRoleSchema.options,
    citationScope: CATALOG_IMPORT_CITATION_SCOPE_ORDER,
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

export const CATALOG_IMPORT_V2_CSV_SPEC = {
  files: {
    "00_manifest.csv": CATALOG_IMPORT_MANIFEST_HEADERS,
    "catalog.csv": CATALOG_IMPORT_V2_CATALOG_HEADERS,
    "aliases.csv": CATALOG_IMPORT_ALIAS_HEADERS,
    "provenance.csv": CATALOG_IMPORT_PROVENANCE_HEADERS,
    "contributors.csv": CATALOG_IMPORT_V2_CONTRIBUTOR_HEADERS,
    "public_citations.csv": CATALOG_IMPORT_V2_PUBLIC_CITATION_HEADERS,
  },
  inputEncoding: "UTF-8 with optional BOM",
  inputNewlines: ["LF", "CRLF"],
  outputEncoding: "UTF-8 without BOM",
  outputNewline: "LF",
  finalNewline: true,
  unknownColumns: "REJECT",
  duplicateColumns: "REJECT",
} as const;
