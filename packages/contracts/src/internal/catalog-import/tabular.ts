import { z } from "zod";

import {
  aliasImportRowSchema,
  aliasTypeSchema,
  canonicalCatalogImportRowSchema,
  canonicalDescriptionImportFieldSchema,
  canonicalFactualImportFieldSchema,
  catalogImportIdSchema,
  importContractVersionSchema,
  provenanceImportRowSchema,
  sourceIdSchema,
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
  const catalogId = optionalText(row.catalogId, catalogIdSchema);
  const ownerNote = optionalText(row.ownerNote, z.string().min(1).max(2_000));
  return canonicalCatalogImportRowSchema.parse({
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

export const parseCatalogImportManifestTableRow = (input: unknown) => {
  const row = catalogImportManifestTableRowSchema.parse(input);
  return importContractVersionSchema.parse(row.importContractVersion);
};
