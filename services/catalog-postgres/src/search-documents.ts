import { deriveCatalogPeriodLabel } from "@moya/api";
import { projectCatalogSearchDocument } from "@moya/search";

import type { Pool, PoolClient, QueryResultRow } from "pg";

const sourceSql = `
  SELECT entry.catalog_id, entry.title, entry.summary, entry.period_label,
    entry.dynasty, entry.dynasty_state, entry.date_text, entry.date_text_state,
    CASE WHEN entry.description_state = 'VALUE' THEN entry.description END AS description,
    CASE WHEN entry.script_style_state = 'VALUE' THEN entry.script_style END AS script_style,
    CASE WHEN entry.province_state = 'VALUE' THEN entry.province END AS province,
    CASE WHEN entry.prefecture_state = 'VALUE' THEN entry.prefecture END AS prefecture,
    CASE WHEN entry.county_state = 'VALUE' THEN entry.county END AS county,
    CASE WHEN entry.current_location_state = 'VALUE' THEN entry.current_location END AS current_location,
    CASE WHEN entry.current_custodian_state = 'VALUE' THEN entry.current_custodian END AS current_custodian,
    CASE WHEN entry.transcription_state = 'VALUE' THEN entry.transcription END AS transcription,
    ARRAY(SELECT alias FROM catalog_aliases WHERE catalog_id = entry.catalog_id ORDER BY position) AS aliases,
    ARRAY(SELECT name FROM catalog_contributors WHERE catalog_id = entry.catalog_id ORDER BY position) AS contributor_names
  FROM catalog_entries AS entry
  WHERE entry.catalog_id = $1::text
`;

const upsertSql = `
  INSERT INTO catalog_search_documents (
    catalog_id, normalization_version, title, aliases, normalized_title,
    normalized_aliases, title_alias_text, structured_text, combined_text
  ) VALUES ($1, $2, $3, $4::text[], $5, $6::text[], $7, $8, $9)
  ON CONFLICT (catalog_id) DO UPDATE SET
    normalization_version = EXCLUDED.normalization_version,
    title = EXCLUDED.title, aliases = EXCLUDED.aliases,
    normalized_title = EXCLUDED.normalized_title,
    normalized_aliases = EXCLUDED.normalized_aliases,
    title_alias_text = EXCLUDED.title_alias_text,
    structured_text = EXCLUDED.structured_text,
    combined_text = EXCLUDED.combined_text
`;

const lockDocumentSql = `
  INSERT INTO catalog_search_documents (
    catalog_id, normalization_version, title, aliases, normalized_title,
    normalized_aliases, title_alias_text, structured_text, combined_text
  ) SELECT catalog_id, 'invalidated', '', '{}'::text[], '', '{}'::text[], '', '', ''
    FROM catalog_entries WHERE catalog_id = $1::text
  ON CONFLICT (catalog_id) DO UPDATE SET
    normalization_version = 'invalidated', title = '', aliases = '{}'::text[],
    normalized_title = '', normalized_aliases = '{}'::text[],
    title_alias_text = '', structured_text = '', combined_text = ''
  RETURNING catalog_id
`;

const exactString = (value: unknown): string => {
  if (typeof value !== "string")
    throw new Error("Invalid Catalog search source text");
  return value;
};
const stringArray = (value: unknown): string[] => {
  if (!Array.isArray(value))
    throw new Error("Invalid Catalog search source array");
  return value.map(exactString);
};

/** Only explicitly selected public fields can reach the normalization helper. */
const projectSourceRow = (row: QueryResultRow) => {
  const dynasty =
    row.dynasty_state === "VALUE" ? exactString(row.dynasty) : undefined;
  const dateText =
    row.date_text_state === "VALUE" ? exactString(row.date_text) : undefined;
  const periodLabel = deriveCatalogPeriodLabel({
    dynasty:
      dynasty === undefined
        ? { state: "UNSUPPLIED" }
        : { state: "VALUE", value: dynasty },
    dateText:
      dateText === undefined
        ? { state: "UNSUPPLIED" }
        : { state: "VALUE", value: dateText },
    ...(row.period_label === null
      ? {}
      : { storedPeriodLabel: exactString(row.period_label) }),
  });
  const source: Parameters<typeof projectCatalogSearchDocument>[0] = {
    title: exactString(row.title),
    aliases: stringArray(row.aliases),
    contributors: stringArray(row.contributor_names).map((name) => ({ name })),
    ...(dynasty === undefined ? {} : { dynasty }),
    ...(dateText === undefined ? {} : { dateText }),
    ...(periodLabel === undefined ? {} : { periodLabel }),
    ...Object.fromEntries(
      [
        ["summary", row.summary],
        ["description", row.description],
        ["scriptStyle", row.script_style],
        ["province", row.province],
        ["prefecture", row.prefecture],
        ["county", row.county],
        ["currentLocation", row.current_location],
        ["currentCustodian", row.current_custodian],
        ["transcription", row.transcription],
      ]
        .filter(([, value]) => value !== null)
        .map(([field, value]) => [field, exactString(value)]),
    ),
  };
  return projectCatalogSearchDocument(source);
};

/** Uses the caller's existing write transaction; never starts or commits one. */
export const refreshCatalogSearchDocument = async (
  client: Pick<PoolClient, "query">,
  catalogId: string,
): Promise<void> => {
  // Acquire the same tuple as every invalidating writer before a new source
  // statement snapshot. A refresh with no source write must serialize too.
  const locked = await client.query(lockDocumentSql, [catalogId]);
  if (locked.rowCount === 0) return;
  const result = await client.query(sourceSql, [catalogId]);
  const row = result.rows[0];
  if (row === undefined) {
    await client.query(
      "DELETE FROM catalog_search_documents WHERE catalog_id = $1",
      [catalogId],
    );
    return;
  }
  const document = projectSourceRow(row);
  await client.query(upsertSql, [
    catalogId,
    document.normalizationVersion,
    document.title,
    [...document.aliases],
    document.normalizedTitle,
    [...document.normalizedAliases],
    document.titleAliasText,
    document.structuredText,
    document.combinedText,
  ]);
};

/** Explicit operator operation: rebuild derived text without re-importing Catalog. */
export const rebuildCatalogSearchDocuments = async (
  pool: Pool,
): Promise<number> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Prevent source writes between reading a row and publishing its replacement.
    await client.query(
      "LOCK TABLE catalog_entries, catalog_aliases, catalog_contributors IN SHARE MODE",
    );
    const result = await client.query(
      'SELECT catalog_id FROM catalog_entries ORDER BY catalog_id COLLATE "C"',
    );
    await client.query("DELETE FROM catalog_search_documents");
    for (const row of result.rows) {
      await refreshCatalogSearchDocument(client, exactString(row.catalog_id));
    }
    await client.query("COMMIT");
    return result.rows.length;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* Preserve the original failure. */
    }
    throw error;
  } finally {
    client.release();
  }
};
