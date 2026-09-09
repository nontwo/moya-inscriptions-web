import {
  catalogSearchSourceSelectSql,
  projectCatalogSearchSourceRow,
} from "@moya/catalog-postgres";
import { sql, type MigrateUpArgs } from "@payloadcms/db-postgres";

// Preserve the original view column order; PostgreSQL permits appending this
// private adapter column without dropping the existing read views or grants.
export const upgradePublishedCatalogSearchViewSql = `
CREATE OR REPLACE VIEW catalog_entries AS
SELECT
  c.catalog_id,
  c.kind::text AS kind,
  c.title,
  c.summary,
  c.period_label,
  c.dynasty_value AS dynasty,
  c.dynasty_state::text AS dynasty_state,
  c.date_text_value AS date_text,
  c.date_text_state::text AS date_text_state,
  c.province_value AS province,
  c.province_state::text AS province_state,
  c.prefecture_value AS prefecture,
  c.prefecture_state::text AS prefecture_state,
  c.county_value AS county,
  c.county_state::text AS county_state,
  c.current_location_value AS current_location,
  c.current_location_state::text AS current_location_state,
  c.current_custodian_value AS current_custodian,
  c.current_custodian_state::text AS current_custodian_state,
  CASE WHEN c.description_state = 'VALUE' THEN c.description_value END AS description,
  c.script_style_value AS script_style,
  c.script_style_state::text AS script_style_state,
  c.transcription_value AS transcription,
  c.transcription_state::text AS transcription_state,
  c.historical_context_value AS historical_context,
  c.historical_context_state::text AS historical_context_state,
  c.scholarly_research_value AS scholarly_research,
  c.scholarly_research_state::text AS scholarly_research_state,
  c.description_state::text AS description_state
FROM catalogs c
WHERE c._status = 'published'
OFFSET 0;
`;

export const createPublishedCatalogSearchSql = `
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE TABLE catalog_search_documents (
  catalog_id VARCHAR(128) PRIMARY KEY REFERENCES catalogs(catalog_id) ON DELETE CASCADE,
  normalization_version TEXT COLLATE "C" NOT NULL,
  title TEXT COLLATE "C" NOT NULL,
  aliases TEXT[] COLLATE "C" NOT NULL,
  normalized_title TEXT COLLATE "C" NOT NULL,
  normalized_aliases TEXT[] COLLATE "C" NOT NULL,
  title_alias_text TEXT COLLATE "C" NOT NULL,
  structured_text TEXT COLLATE "C" NOT NULL,
  combined_text TEXT COLLATE "C" NOT NULL
);
CREATE INDEX catalog_search_documents_combined_trgm_idx
  ON catalog_search_documents USING GIN (combined_text public.gin_trgm_ops);
`;

const textArray = (values: readonly string[]) =>
  sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;

/** The caller supplies the migration or exact Payload write transaction. */
export async function synchronizePublishedCatalogSearch(
  db: Pick<MigrateUpArgs["db"], "execute">,
  catalogId: string,
  published: boolean,
): Promise<void> {
  if (!published) {
    await db.execute(
      sql`DELETE FROM catalog_search_documents WHERE catalog_id = ${catalogId}`,
    );
    return;
  }
  const result = await db.execute(
    sql`${sql.raw(catalogSearchSourceSelectSql)} WHERE entry.catalog_id = ${catalogId}::text`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("Published Catalog search source unavailable");
  const document = projectCatalogSearchSourceRow(row);
  await db.execute(sql`
    INSERT INTO catalog_search_documents (
      catalog_id, normalization_version, title, aliases, normalized_title,
      normalized_aliases, title_alias_text, structured_text, combined_text
    ) VALUES (
      ${catalogId}, ${document.normalizationVersion}, ${document.title},
      ${textArray(document.aliases)}, ${document.normalizedTitle},
      ${textArray(document.normalizedAliases)}, ${document.titleAliasText},
      ${document.structuredText}, ${document.combinedText}
    ) ON CONFLICT (catalog_id) DO UPDATE SET
      normalization_version = EXCLUDED.normalization_version,
      title = EXCLUDED.title, aliases = EXCLUDED.aliases,
      normalized_title = EXCLUDED.normalized_title,
      normalized_aliases = EXCLUDED.normalized_aliases,
      title_alias_text = EXCLUDED.title_alias_text,
      structured_text = EXCLUDED.structured_text,
      combined_text = EXCLUDED.combined_text
  `);
}
