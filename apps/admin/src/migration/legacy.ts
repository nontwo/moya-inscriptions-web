import { z } from "zod";

import {
  CATALOG_IMPORT_CITATION_SCOPE_ORDER,
  sourceIdSchema,
} from "@moya/contracts/internal/catalog-import";
import {
  EDITORIAL_FIELD_NAMES,
  editorialDraftSchema,
  editorialPublishSchema,
  type EditorialDraft,
} from "@moya/contracts/internal/editorial";
import {
  catalogCitationScopeSchema,
  catalogIdSchema,
  mediaIdSchema,
} from "@moya/contracts/schemas";

const stateColumns = {
  dynasty: "dynasty",
  dateText: "date_text",
  province: "province",
  prefecture: "prefecture",
  county: "county",
  currentLocation: "current_location",
  currentCustodian: "current_custodian",
  description: "description",
  scriptStyle: "script_style",
  transcription: "transcription",
  historicalContext: "historical_context",
  scholarlyResearch: "scholarly_research",
} as const;

const optionalText = z.string().nullable();
const position = z.number().int().nonnegative().max(2_147_483_647);
const catalogReference = { catalog_id: catalogIdSchema };
const orderedReference = { ...catalogReference, position };
const entrySchema = z.strictObject({
  ...catalogReference,
  kind: z.string(),
  title: z.string(),
  summary: optionalText,
  period_label: optionalText,
  ...Object.fromEntries(
    Object.values(stateColumns).flatMap((column) => [
      [column, optionalText],
      [`${column}_state`, z.string()],
    ]),
  ),
});

const tableSchemas = {
  catalog_entries: entrySchema,
  catalog_aliases: z.strictObject({
    ...orderedReference,
    alias: z.string(),
    alias_type: z.string(),
  }),
  catalog_import_sources: z.strictObject({
    ...catalogReference,
    source_id: sourceIdSchema,
    source_title: optionalText,
    source_type_raw: optionalText,
    source_url: optionalText,
    source_note: optionalText,
  }),
  catalog_contributors: z.strictObject({
    ...orderedReference,
    name: z.string(),
    role: z.string(),
  }),
  catalog_source_citations: z.strictObject({
    ...orderedReference,
    label: z.string(),
    citation: optionalText,
    url: optionalText,
  }),
  catalog_source_citation_scopes: z.strictObject({
    ...catalogReference,
    citation_position: position,
    scope: catalogCitationScopeSchema,
  }),
  catalog_media: z.strictObject({
    ...orderedReference,
    media_id: mediaIdSchema,
    is_representative: z.boolean(),
    kind: z.literal("image"),
    alt_text: z.string(),
    width: z.number().int().positive().max(2_147_483_647),
    height: z.number().int().positive().max(2_147_483_647),
    object_key: z.string(),
  }),
};

const primarySourceSchema = z.strictObject({
  catalogId: catalogIdSchema,
  sourceId: sourceIdSchema,
});

/** All supplemental metadata is supplied, never inferred from file names/keys. */
const approvedMediaMetadataSchema = z.strictObject({
  catalogId: catalogIdSchema,
  sourceId: sourceIdSchema,
  mediaId: mediaIdSchema,
  objectKey: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  filesize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  width: z.number().int().positive().max(2_147_483_647),
  height: z.number().int().positive().max(2_147_483_647),
  alt: z.string(),
  position,
  isRepresentative: z.boolean(),
  rights: optionalText,
  orderConfidence: z.enum(["HIGH", "LOW"]),
});

type TableName = keyof typeof tableSchemas;
type Row = Record<string, unknown>;
type FindingCategory =
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_SCHEMA_MISMATCH"
  | "DUPLICATE_CATALOG_ID"
  | "DUPLICATE_SOURCE_ID"
  | "DUPLICATE_MEDIA_ID"
  | "DUPLICATE_OBJECT_KEY"
  | "DUPLICATE_RELATION_POSITION"
  | "DUPLICATE_CITATION_SCOPE"
  | "UNKNOWN_CATALOG_REFERENCE"
  | "UNKNOWN_CITATION_REFERENCE"
  | "IDENTITY_NAMESPACE_CONFLICT"
  | "SOURCE_MAPPING_MISSING"
  | "PRIMARY_SOURCE_REQUIRED"
  | "PRIMARY_SOURCE_CONFLICT"
  | "MEDIA_METADATA_REQUIRED"
  | "MEDIA_METADATA_MISMATCH"
  | "MEDIA_METADATA_ORPHAN"
  | "CONTENT_VALIDATION_FAILED";
type Finding = {
  category: FindingCategory;
  table: TableName | "primarySources" | "mediaMetadata" | "snapshot";
  row?: number;
  field?: string;
};

const lexical = (left: unknown, right: unknown) =>
  String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;

/**
 * Pure offline conversion of the current legacy table export. The returned
 * plan contains protected content and must stay in controlled local storage.
 * Log only dryRun: findings contain fixed categories/positions, never values.
 * No database access, media byte I/O, allocation, upload or publication occurs.
 */
export function prepareLegacyEditorialMigration(input: unknown) {
  const findings: Finding[] = [];
  const rows = {} as Record<TableName, Row[]>;
  const tableNames = Object.keys(tableSchemas) as TableName[];
  const counts = {
    catalogs: 0,
    aliases: 0,
    sources: 0,
    contributors: 0,
    citations: 0,
    citationScopes: 0,
    media: 0,
  };
  const emptyResult = () => ({
    dryRun: { status: "BLOCKED" as const, counts, findings },
    drafts: [] as {
      content: EditorialDraft;
      sourcePublished: true;
      targetStatus: "draft";
    }[],
    mediaRegistrations: [] as ReturnType<typeof registrationPlan>[],
  });
  const record = z.record(z.string(), z.unknown()).safeParse(input);
  if (!record.success) {
    findings.push({ category: "SOURCE_UNAVAILABLE", table: "snapshot" });
    return emptyResult();
  }
  const snapshot = record.data;
  const allowedKeys = new Set<string>([
    ...tableNames,
    "primarySources",
    "mediaMetadata",
  ]);
  if (Object.keys(snapshot).some((key) => !allowedKeys.has(key))) {
    findings.push({ category: "SOURCE_SCHEMA_MISMATCH", table: "snapshot" });
  }
  for (const table of tableNames) {
    const inputRows = snapshot[table];
    rows[table] = [];
    if (!Array.isArray(inputRows)) {
      findings.push({ category: "SOURCE_UNAVAILABLE", table });
      continue;
    }
    for (const [row, value] of inputRows.entries()) {
      const parsed = tableSchemas[table].safeParse(value);
      if (!parsed.success) {
        findings.push({ category: "SOURCE_SCHEMA_MISMATCH", table, row });
      } else {
        rows[table].push(parsed.data);
      }
    }
  }
  counts.catalogs = rows.catalog_entries.length;
  counts.aliases = rows.catalog_aliases.length;
  counts.sources = rows.catalog_import_sources.length;
  counts.contributors = rows.catalog_contributors.length;
  counts.citations = rows.catalog_source_citations.length;
  counts.citationScopes = rows.catalog_source_citation_scopes.length;
  counts.media = rows.catalog_media.length;

  const primarySources = z
    .array(primarySourceSchema)
    .safeParse(snapshot.primarySources ?? []);
  const mediaMetadata = z
    .array(approvedMediaMetadataSchema)
    .safeParse(snapshot.mediaMetadata ?? []);
  if (!primarySources.success)
    findings.push({
      category: "PRIMARY_SOURCE_CONFLICT",
      table: "primarySources",
    });
  if (!mediaMetadata.success) {
    const knownFields = new Set(Object.keys(approvedMediaMetadataSchema.shape));
    for (const issue of mediaMetadata.error.issues) {
      const row = typeof issue.path[0] === "number" ? issue.path[0] : undefined;
      const field =
        typeof issue.path[1] === "string" && knownFields.has(issue.path[1])
          ? issue.path[1]
          : undefined;
      findings.push({
        category: "MEDIA_METADATA_REQUIRED",
        table: "mediaMetadata",
        ...(row === undefined ? {} : { row }),
        ...(field === undefined ? {} : { field }),
      });
    }
  }
  if (findings.length > 0 || !primarySources.success || !mediaMetadata.success)
    return emptyResult();

  const indexUnique = (
    items: Row[],
    field: string,
    table: TableName,
    category: FindingCategory,
  ) => {
    const found = new Map<string, Row>();
    items.forEach((item, row) => {
      const value = String(item[field]);
      if (found.has(value)) findings.push({ category, table, row, field });
      else found.set(value, item);
    });
    return found;
  };
  const catalogs = indexUnique(
    rows.catalog_entries,
    "catalog_id",
    "catalog_entries",
    "DUPLICATE_CATALOG_ID",
  );
  const sources = indexUnique(
    rows.catalog_import_sources,
    "source_id",
    "catalog_import_sources",
    "DUPLICATE_SOURCE_ID",
  );
  const media = indexUnique(
    rows.catalog_media,
    "media_id",
    "catalog_media",
    "DUPLICATE_MEDIA_ID",
  );
  indexUnique(
    rows.catalog_media,
    "object_key",
    "catalog_media",
    "DUPLICATE_OBJECT_KEY",
  );

  const byCatalog = Object.fromEntries(
    tableNames.map((table) => {
      const grouped = new Map<string, Row[]>();
      for (const row of rows[table]) {
        const key = String(row.catalog_id);
        const group = grouped.get(key) ?? [];
        group.push(row);
        grouped.set(key, group);
      }
      return [table, grouped];
    }),
  ) as Record<TableName, Map<string, Row[]>>;
  const children = (table: TableName, id: unknown) =>
    byCatalog[table].get(String(id)) ?? [];

  for (const table of tableNames.filter((name) => name !== "catalog_entries")) {
    const positions = new Set<string>();
    rows[table].forEach((item, row) => {
      if (!catalogs.has(String(item.catalog_id)))
        findings.push({
          category: "UNKNOWN_CATALOG_REFERENCE",
          table,
          row,
          field: "catalog_id",
        });
      if (item.position !== undefined) {
        const key = JSON.stringify([item.catalog_id, item.position]);
        if (positions.has(key))
          findings.push({
            category: "DUPLICATE_RELATION_POSITION",
            table,
            row,
            field: "position",
          });
        positions.add(key);
      }
    });
  }
  rows.catalog_import_sources.forEach((item, row) => {
    if (catalogs.has(String(item.source_id)))
      findings.push({
        category: "IDENTITY_NAMESPACE_CONFLICT",
        table: "catalog_import_sources",
        row,
        field: "source_id",
      });
  });
  const citations = new Set(
    rows.catalog_source_citations.map((item) =>
      JSON.stringify([item.catalog_id, item.position]),
    ),
  );
  const seenScopes = new Set<string>();
  const scopesByCitation = new Map<string, Row[]>();
  rows.catalog_source_citation_scopes.forEach((item, row) => {
    if (
      !citations.has(JSON.stringify([item.catalog_id, item.citation_position]))
    )
      findings.push({
        category: "UNKNOWN_CITATION_REFERENCE",
        table: "catalog_source_citation_scopes",
        row,
        field: "citation_position",
      });
    const key = JSON.stringify([
      item.catalog_id,
      item.citation_position,
      item.scope,
    ]);
    if (seenScopes.has(key))
      findings.push({
        category: "DUPLICATE_CITATION_SCOPE",
        table: "catalog_source_citation_scopes",
        row,
        field: "scope",
      });
    seenScopes.add(key);
    const citationKey = JSON.stringify([
      item.catalog_id,
      item.citation_position,
    ]);
    const scopes = scopesByCitation.get(citationKey) ?? [];
    scopes.push(item);
    scopesByCitation.set(citationKey, scopes);
  });

  const primaryMap = new Map<string, string>();
  primarySources.data.forEach((item, row) => {
    if (
      primaryMap.has(item.catalogId) ||
      !catalogs.has(item.catalogId) ||
      sources.get(item.sourceId)?.catalog_id !== item.catalogId
    ) {
      findings.push({
        category: "PRIMARY_SOURCE_CONFLICT",
        table: "primarySources",
        row,
      });
    } else primaryMap.set(item.catalogId, item.sourceId);
  });
  rows.catalog_entries.forEach((item, row) => {
    const bindings = children("catalog_import_sources", item.catalog_id);
    if (bindings.length === 0)
      findings.push({
        category: "SOURCE_MAPPING_MISSING",
        table: "catalog_entries",
        row,
        field: "catalog_id",
      });
    else if (bindings.length === 1 && !primaryMap.has(String(item.catalog_id)))
      primaryMap.set(String(item.catalog_id), String(bindings[0]?.source_id));
    else if (!primaryMap.has(String(item.catalog_id)))
      findings.push({
        category: "PRIMARY_SOURCE_REQUIRED",
        table: "catalog_entries",
        row,
        field: "catalog_id",
      });
  });

  const metadataMap = new Map<
    string,
    z.output<typeof approvedMediaMetadataSchema>
  >();
  mediaMetadata.data.forEach((item, row) => {
    const original = media.get(item.mediaId);
    if (!original) {
      findings.push({
        category: "MEDIA_METADATA_ORPHAN",
        table: "mediaMetadata",
        row,
      });
      return;
    }
    if (metadataMap.has(item.mediaId))
      findings.push({
        category: "DUPLICATE_MEDIA_ID",
        table: "mediaMetadata",
        row,
        field: "mediaId",
      });
    metadataMap.set(item.mediaId, item);
    const source = sources.get(item.sourceId);
    const metadataFields = {
      catalogId: "catalog_id",
      objectKey: "object_key",
      width: "width",
      height: "height",
      alt: "alt_text",
      position: "position",
      isRepresentative: "is_representative",
    } as const;
    if (source?.catalog_id !== original.catalog_id)
      findings.push({
        category: "MEDIA_METADATA_MISMATCH",
        table: "mediaMetadata",
        row,
        field: "sourceId",
      });
    for (const [field, column] of Object.entries(metadataFields)) {
      if (item[field as keyof typeof metadataFields] !== original[column])
        findings.push({
          category: "MEDIA_METADATA_MISMATCH",
          table: "mediaMetadata",
          row,
          field,
        });
    }
  });
  rows.catalog_media.forEach((item, row) => {
    if (!metadataMap.has(String(item.media_id)))
      findings.push({
        category: "MEDIA_METADATA_REQUIRED",
        table: "catalog_media",
        row,
        field: "media_id",
      });
  });
  if (findings.length > 0) return emptyResult();

  const drafts: {
    content: EditorialDraft;
    sourcePublished: true;
    targetStatus: "draft";
  }[] = [];
  const ordered = (table: TableName, id: unknown) =>
    [...children(table, id)].sort(
      (left, right) => Number(left.position) - Number(right.position),
    );
  const optional = (key: string, value: unknown) =>
    value === null ? {} : { [key]: value };
  const scopeOrder: readonly string[] = CATALOG_IMPORT_CITATION_SCOPE_ORDER;

  const originalPositions = new Map(
    rows.catalog_entries.map((entry, row) => [entry, row]),
  );
  for (const entry of [...rows.catalog_entries].sort((left, right) =>
    lexical(left.catalog_id, right.catalog_id),
  )) {
    const row = originalPositions.get(entry)!;
    const id = entry.catalog_id;
    const candidate = {
      catalogId: id,
      sourceId: primaryMap.get(String(id)),
      kind: entry.kind,
      title: entry.title,
      ...optional("summary", entry.summary),
      ...optional("periodLabel", entry.period_label),
      ...Object.fromEntries(
        Object.entries(stateColumns).map(([name, column]) => [
          name,
          {
            state: entry[`${column}_state`],
            ...optional("value", entry[column]),
          },
        ]),
      ),
      aliases: ordered("catalog_aliases", id).map((item) => ({
        alias: item.alias,
        aliasType: item.alias_type,
      })),
      provenance: [...children("catalog_import_sources", id)]
        .sort((left, right) => lexical(left.source_id, right.source_id))
        .map((item) => ({
          sourceId: item.source_id,
          ...optional("sourceTitle", item.source_title),
          ...optional("sourceTypeRaw", item.source_type_raw),
          ...optional("sourceUrl", item.source_url),
          ...optional("sourceNote", item.source_note),
        })),
      contributors: ordered("catalog_contributors", id).map((item) => ({
        name: item.name,
        role: item.role,
      })),
      sourceCitations: ordered("catalog_source_citations", id).map((item) => {
        const scopes = (
          scopesByCitation.get(JSON.stringify([id, item.position])) ?? []
        )
          .map((scope) => String(scope.scope))
          .sort(
            (left, right) =>
              scopeOrder.indexOf(left) - scopeOrder.indexOf(right),
          );
        return {
          label: item.label,
          ...optional("citation", item.citation),
          ...optional("url", item.url),
          ...(scopes.length ? { appliesTo: scopes } : {}),
        };
      }),
      media: ordered("catalog_media", id).map((item) => {
        const metadata = metadataMap.get(String(item.media_id))!;
        return {
          mediaId: item.media_id,
          objectKey: item.object_key,
          width: item.width,
          height: item.height,
          alt: item.alt_text,
          position: item.position,
          isRepresentative: item.is_representative,
          ...optional("rights", metadata.rights),
          orderConfidence: metadata.orderConfidence,
        };
      }),
    };
    const parsed = editorialPublishSchema.safeParse(candidate);
    if (!parsed.success) {
      const knownFields = new Set<string>(EDITORIAL_FIELD_NAMES);
      const fields = new Set(
        parsed.error.issues.map((issue) => {
          const field = issue.path[0];
          return typeof field === "string" && knownFields.has(field)
            ? field
            : "content";
        }),
      );
      for (const field of fields)
        findings.push({
          category: "CONTENT_VALIDATION_FAILED",
          table: "catalog_entries",
          row,
          field,
        });
      continue;
    }
    drafts.push({
      content: editorialDraftSchema.parse(parsed.data),
      // Legacy catalog_entries is the unfiltered public read model. This is
      // provenance of visibility only, never an approval for CMS publication.
      sourcePublished: true,
      targetStatus: "draft",
    });
  }
  if (findings.length > 0) return emptyResult();
  return {
    dryRun: { status: "READY" as const, counts, findings },
    drafts,
    mediaRegistrations: [...metadataMap.values()]
      .sort((left, right) => lexical(left.mediaId, right.mediaId))
      .map(registrationPlan),
  };
}

function registrationPlan(
  metadata: z.output<typeof approvedMediaMetadataSchema>,
) {
  return {
    origin: "existing" as const,
    mediaId: metadata.mediaId,
    catalogId: metadata.catalogId,
    objectKey: metadata.objectKey,
    sha256: metadata.sha256,
    filesize: metadata.filesize,
    mimeType: metadata.mimeType,
    alt: metadata.alt,
    width: metadata.width,
    height: metadata.height,
    ...(metadata.rights === null ? {} : { rights: metadata.rights }),
    orderConfidence: metadata.orderConfidence,
  };
}
