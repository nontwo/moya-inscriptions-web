import { catalogIdSchema, catalogKindSchema } from "@moya/contracts/schemas";

import type {
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogSourceCitationProjection,
} from "@moya/api";
import type { QueryResultRow } from "pg";

export interface CatalogEntryRow extends QueryResultRow {
  readonly catalog_id: unknown;
  readonly kind: unknown;
  readonly title: unknown;
  readonly summary: unknown;
  readonly description?: unknown;
  readonly period_label: unknown;
}

export interface CatalogAliasRow extends QueryResultRow {
  readonly catalog_id: unknown;
  readonly position: unknown;
  readonly alias: unknown;
}

export interface CatalogCitationRow extends QueryResultRow {
  readonly catalog_id: unknown;
  readonly position: unknown;
  readonly label: unknown;
  readonly citation: unknown;
  readonly url: unknown;
}

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Invalid PostgreSQL Catalog ${field}`);
  }
  return value;
};

const optionalString = (value: unknown, field: string): string | undefined =>
  value === null ? undefined : requiredString(value, field);

export const mapCatalogEntryRow = (
  row: CatalogEntryRow,
  aliases: readonly string[],
): CatalogListItemProjection => ({
  id: catalogIdSchema.parse(row.catalog_id),
  kind: catalogKindSchema.parse(row.kind),
  title: requiredString(row.title, "title"),
  aliases: [...aliases],
  ...(row.summary === null
    ? {}
    : { summary: requiredString(row.summary, "summary") }),
  ...(row.period_label === null
    ? {}
    : { periodLabel: requiredString(row.period_label, "period label") }),
});

export const mapCatalogDetailRow = (
  row: CatalogEntryRow,
  aliases: readonly string[],
  sourceCitations: readonly CatalogSourceCitationProjection[],
): CatalogDetailProjection => ({
  ...mapCatalogEntryRow(row, aliases),
  sourceCitations: sourceCitations.map((citation) => ({ ...citation })),
  ...(row.description === null || row.description === undefined
    ? {}
    : { description: requiredString(row.description, "description") }),
});

export const mapAliasRows = (
  rows: readonly CatalogAliasRow[],
): ReadonlyMap<string, readonly string[]> => {
  const aliases = new Map<string, string[]>();
  for (const row of rows) {
    const catalogId = requiredString(row.catalog_id, "alias catalog ID");
    const alias = requiredString(row.alias, "alias");
    if (!Number.isInteger(row.position) || Number(row.position) < 0) {
      throw new Error("Invalid PostgreSQL Catalog alias position");
    }
    const values = aliases.get(catalogId) ?? [];
    values.push(alias);
    aliases.set(catalogId, values);
  }
  return aliases;
};

export const mapCitationRows = (
  rows: readonly CatalogCitationRow[],
): readonly CatalogSourceCitationProjection[] =>
  rows.map((row) => {
    if (!Number.isInteger(row.position) || Number(row.position) < 0) {
      throw new Error("Invalid PostgreSQL Catalog citation position");
    }
    const citation = optionalString(row.citation, "citation");
    const url = optionalString(row.url, "citation URL");
    return {
      label: requiredString(row.label, "citation label"),
      ...(citation === undefined ? {} : { citation }),
      ...(url === undefined ? {} : { url }),
    };
  });
