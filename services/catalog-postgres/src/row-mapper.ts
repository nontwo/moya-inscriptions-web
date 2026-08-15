import {
  catalogIdSchema,
  catalogKindSchema,
  mediaIdSchema,
} from "@moya/contracts/schemas";

import type {
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogMediaProjection,
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

export interface CatalogMediaRow extends QueryResultRow {
  readonly media_id: unknown;
  readonly catalog_id: unknown;
  readonly position: unknown;
  readonly is_representative: unknown;
  readonly kind: unknown;
  readonly alt_text: unknown;
  readonly width: unknown;
  readonly height: unknown;
  readonly object_key: unknown;
}

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new Error(`Invalid PostgreSQL Catalog ${field}`);
  }
  return value;
};

const optionalString = (value: unknown, field: string): string | undefined =>
  value === null ? undefined : requiredString(value, field);

const positiveInteger = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`Invalid PostgreSQL Catalog Media ${field}`);
  }
  return Number(value);
};

export const mapCatalogMediaRow = (
  row: CatalogMediaRow,
): CatalogMediaProjection => {
  if (!Number.isInteger(row.position) || Number(row.position) < 0) {
    throw new Error("Invalid PostgreSQL Catalog Media position");
  }
  if (typeof row.is_representative !== "boolean") {
    throw new Error("Invalid PostgreSQL Catalog Media representative flag");
  }
  if (row.kind !== "image") {
    throw new Error("Invalid PostgreSQL Catalog Media kind");
  }

  return {
    id: mediaIdSchema.parse(row.media_id),
    position: Number(row.position),
    isRepresentative: row.is_representative,
    kind: row.kind,
    alt: requiredString(row.alt_text, "Media alt text"),
    width: positiveInteger(row.width, "width"),
    height: positiveInteger(row.height, "height"),
    objectKey: requiredString(row.object_key, "Media object key"),
  };
};

export const mapCatalogEntryRow = (
  row: CatalogEntryRow,
  aliases: readonly string[],
  representativeMedia?: CatalogMediaProjection,
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
  ...(representativeMedia === undefined
    ? {}
    : { representativeMedia: { ...representativeMedia } }),
});

export const mapCatalogDetailRow = (
  row: CatalogEntryRow,
  aliases: readonly string[],
  sourceCitations: readonly CatalogSourceCitationProjection[],
  media: readonly CatalogMediaProjection[] = [],
): CatalogDetailProjection => ({
  ...mapCatalogEntryRow(
    row,
    aliases,
    media.find(({ isRepresentative }) => isRepresentative),
  ),
  sourceCitations: sourceCitations.map((citation) => ({ ...citation })),
  media: media.map((item) => ({ ...item })),
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

export const mapRepresentativeMediaRows = (
  rows: readonly CatalogMediaRow[],
): ReadonlyMap<string, CatalogMediaProjection> => {
  const representativeMedia = new Map<string, CatalogMediaProjection>();
  for (const row of rows) {
    const catalogId = requiredString(row.catalog_id, "Media catalog ID");
    if (representativeMedia.has(catalogId)) {
      throw new Error(
        "Invalid PostgreSQL Catalog Media representative multiplicity",
      );
    }
    const media = mapCatalogMediaRow(row);
    if (!media.isRepresentative) {
      throw new Error("Invalid PostgreSQL representative Media row");
    }
    representativeMedia.set(catalogId, media);
  }
  return representativeMedia;
};

export const mapCatalogMediaRows = (
  rows: readonly CatalogMediaRow[],
): readonly CatalogMediaProjection[] => rows.map(mapCatalogMediaRow);
