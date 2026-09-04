import { z } from "zod";

import {
  aliasImportRowSchema,
  aliasTypeSchema,
  canonicalCatalogImportV2RowSchema,
  canonicalCatalogImportRowSchema,
  canonicalDescriptionImportFieldSchema,
  canonicalFactualImportFieldSchema,
  canonicalHistoricalContextImportFieldSchema,
  canonicalScholarlyResearchImportFieldSchema,
  canonicalScriptStyleImportFieldSchema,
  canonicalTranscriptionImportFieldSchema,
  canonicalizeCatalogImportCitationScopes,
  catalogContributorImportRowSchema,
  catalogImportCollectionActionSchema,
  catalogImportIdSchema,
  importContractVersionSchema,
  provenanceImportRowSchema,
  publicCitationImportRowSchema,
  sourceIdSchema,
  supportedImportContractVersionSchema,
} from "./schemas.js";
import { catalogIdSchema, catalogKindSchema } from "../../schemas.js";

const catalogTableRowShape = {
  catalogImportId: z.string(),
  sourceId: z.string(),
  catalogId: z.string(),
  title: z.string(),
  catalogKind: z.string(),
  dynasty: z.string(),
  dynastyState: z.string(),
  dateText: z.string(),
  dateTextState: z.string(),
  province: z.string(),
  provinceState: z.string(),
  prefecture: z.string(),
  prefectureState: z.string(),
  county: z.string(),
  countyState: z.string(),
  currentLocation: z.string(),
  currentLocationState: z.string(),
  currentCustodian: z.string(),
  currentCustodianState: z.string(),
  description: z.string(),
  descriptionState: z.string(),
  ownerNote: z.string(),
} as const;

export const catalogImportTableRowSchema = z.strictObject(catalogTableRowShape);

export const catalogImportV2TableRowSchema = z.strictObject({
  ...catalogTableRowShape,
  summary: z.string(),
  periodLabel: z.string(),
  scriptStyle: z.string(),
  scriptStyleState: z.string(),
  transcription: z.string(),
  transcriptionState: z.string(),
  historicalContext: z.string(),
  historicalContextState: z.string(),
  scholarlyResearch: z.string(),
  scholarlyResearchState: z.string(),
  contributorsAction: z.string(),
  publicCitationsAction: z.string(),
});

export const aliasImportTableRowSchema = z.strictObject({
  catalogImportId: z.string(),
  alias: z.string(),
  aliasType: z.string(),
});

export const provenanceImportTableRowSchema = z.strictObject({
  catalogImportId: z.string(),
  sourceId: z.string(),
  sourceTitle: z.string(),
  sourceTypeRaw: z.string(),
  sourceUrl: z.string(),
  sourceNote: z.string(),
});

export const catalogContributorImportTableRowSchema = z.strictObject({
  catalogImportId: z.string(),
  position: z.string(),
  name: z.string(),
  role: z.string(),
});

export const publicCitationImportTableRowSchema = z.strictObject({
  catalogImportId: z.string(),
  position: z.string(),
  label: z.string(),
  citation: z.string(),
  url: z.string(),
  appliesTo: z.string(),
});

export const catalogImportManifestTableRowSchema = z.strictObject({
  importContractVersion: z.string(),
});

const optionalText = <Schema extends z.ZodType>(
  value: string,
  schema: Schema,
): z.output<Schema> | undefined =>
  value === "" ? undefined : schema.parse(value);

const canonicalizeField = (
  value: string,
  state: string,
  schema: z.ZodType,
): unknown => {
  if (value !== "") {
    if (state !== "" && state !== "VALUE") {
      throw new Error("A supplied value requires blank or VALUE state");
    }
    return schema.parse({ state: "VALUE", value });
  }
  if (state === "" || state === "UNSUPPLIED") {
    return schema.parse({ state: "UNSUPPLIED" });
  }
  if (state === "VALUE") {
    throw new Error("VALUE state requires a supplied value");
  }
  return schema.parse({ state });
};

export const canonicalizeCatalogImportTableRow = (input: unknown) => {
  const row = catalogImportTableRowSchema.parse(input);
  return canonicalCatalogImportRowSchema.parse(canonicalizeCatalogFields(row));
};

const canonicalizeCatalogFields = (
  row: z.output<typeof catalogImportTableRowSchema>,
) => {
  const catalogId = optionalText(row.catalogId, catalogIdSchema);
  const ownerNote = optionalText(row.ownerNote, z.string().min(1).max(2_000));
  return {
    catalogImportId: catalogImportIdSchema.parse(row.catalogImportId),
    sourceId: sourceIdSchema.parse(row.sourceId),
    ...(catalogId === undefined ? {} : { catalogId }),
    title: row.title,
    catalogKind: catalogKindSchema.parse(row.catalogKind),
    dynasty: canonicalizeField(
      row.dynasty,
      row.dynastyState,
      canonicalFactualImportFieldSchema,
    ),
    dateText: canonicalizeField(
      row.dateText,
      row.dateTextState,
      canonicalFactualImportFieldSchema,
    ),
    province: canonicalizeField(
      row.province,
      row.provinceState,
      canonicalFactualImportFieldSchema,
    ),
    prefecture: canonicalizeField(
      row.prefecture,
      row.prefectureState,
      canonicalFactualImportFieldSchema,
    ),
    county: canonicalizeField(
      row.county,
      row.countyState,
      canonicalFactualImportFieldSchema,
    ),
    currentLocation: canonicalizeField(
      row.currentLocation,
      row.currentLocationState,
      canonicalFactualImportFieldSchema,
    ),
    currentCustodian: canonicalizeField(
      row.currentCustodian,
      row.currentCustodianState,
      canonicalFactualImportFieldSchema,
    ),
    description: canonicalizeField(
      row.description,
      row.descriptionState,
      canonicalDescriptionImportFieldSchema,
    ),
    ...(ownerNote === undefined ? {} : { ownerNote }),
  };
};

const canonicalizeCollectionAction = (value: string) =>
  catalogImportCollectionActionSchema.parse(value === "" ? "PRESERVE" : value);

export const canonicalizeCatalogImportV2TableRow = (input: unknown) => {
  const row = catalogImportV2TableRowSchema.parse(input);
  const summary = row.summary === "" ? undefined : row.summary;
  const periodLabel = row.periodLabel === "" ? undefined : row.periodLabel;
  return canonicalCatalogImportV2RowSchema.parse({
    ...canonicalizeCatalogFields(row),
    ...(summary === undefined ? {} : { summary }),
    ...(periodLabel === undefined ? {} : { periodLabel }),
    scriptStyle: canonicalizeField(
      row.scriptStyle,
      row.scriptStyleState,
      canonicalScriptStyleImportFieldSchema,
    ),
    transcription: canonicalizeField(
      row.transcription,
      row.transcriptionState,
      canonicalTranscriptionImportFieldSchema,
    ),
    historicalContext: canonicalizeField(
      row.historicalContext,
      row.historicalContextState,
      canonicalHistoricalContextImportFieldSchema,
    ),
    scholarlyResearch: canonicalizeField(
      row.scholarlyResearch,
      row.scholarlyResearchState,
      canonicalScholarlyResearchImportFieldSchema,
    ),
    contributorsAction: canonicalizeCollectionAction(row.contributorsAction),
    publicCitationsAction: canonicalizeCollectionAction(
      row.publicCitationsAction,
    ),
  });
};

export const canonicalizeAliasImportTableRow = (input: unknown) => {
  const row = aliasImportTableRowSchema.parse(input);
  return aliasImportRowSchema.parse({
    catalogImportId: row.catalogImportId,
    alias: row.alias,
    aliasType: aliasTypeSchema.parse(row.aliasType),
  });
};

export const canonicalizeProvenanceImportTableRow = (input: unknown) => {
  const row = provenanceImportTableRowSchema.parse(input);
  const sourceTitle = optionalText(row.sourceTitle, z.string().min(1).max(500));
  const sourceTypeRaw = optionalText(
    row.sourceTypeRaw,
    z.string().min(1).max(200),
  );
  const sourceUrl = optionalText(row.sourceUrl, z.url().max(2_048));
  const sourceNote = optionalText(row.sourceNote, z.string().min(1).max(2_000));
  return provenanceImportRowSchema.parse({
    catalogImportId: row.catalogImportId,
    sourceId: row.sourceId,
    ...(sourceTitle === undefined ? {} : { sourceTitle }),
    ...(sourceTypeRaw === undefined ? {} : { sourceTypeRaw }),
    ...(sourceUrl === undefined ? {} : { sourceUrl }),
    ...(sourceNote === undefined ? {} : { sourceNote }),
  });
};

const canonicalizePosition = (value: string): number => {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("position must be an integer from 0 through 2147483647");
  }
  const position = Number(value);
  if (!Number.isSafeInteger(position) || position > 2_147_483_647) {
    throw new Error("position must be an integer from 0 through 2147483647");
  }
  return position;
};

export const canonicalizeCatalogContributorImportTableRow = (
  input: unknown,
) => {
  const row = catalogContributorImportTableRowSchema.parse(input);
  return catalogContributorImportRowSchema.parse({
    catalogImportId: row.catalogImportId,
    position: canonicalizePosition(row.position),
    name: row.name,
    role: row.role,
  });
};

export const canonicalizePublicCitationImportTableRow = (input: unknown) => {
  const row = publicCitationImportTableRowSchema.parse(input);
  const citation = optionalText(row.citation, z.string().min(1).max(2_000));
  const url = optionalText(row.url, z.url());
  const appliesTo =
    row.appliesTo === ""
      ? undefined
      : canonicalizeCatalogImportCitationScopes(row.appliesTo.split("|"));
  return publicCitationImportRowSchema.parse({
    catalogImportId: row.catalogImportId,
    position: canonicalizePosition(row.position),
    label: row.label,
    ...(citation === undefined ? {} : { citation }),
    ...(url === undefined ? {} : { url }),
    ...(appliesTo === undefined ? {} : { appliesTo }),
  });
};

export const parseCatalogImportManifestTableRow = (input: unknown) => {
  const row = catalogImportManifestTableRowSchema.parse(input);
  return importContractVersionSchema.parse(row.importContractVersion);
};

export const parseSupportedCatalogImportManifestTableRow = (input: unknown) => {
  const row = catalogImportManifestTableRowSchema.parse(input);
  return supportedImportContractVersionSchema.parse(row.importContractVersion);
};
