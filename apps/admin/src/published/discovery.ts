import { sql, type MigrateUpArgs } from "@payloadcms/db-postgres";
/** One immutable ledger, outside mutable drafts and retained-version limits. */
export const createCatalogDiscoverySql = `
CREATE TABLE catalog_first_publications (
 catalog_id VARCHAR(128) PRIMARY KEY REFERENCES catalogs(catalog_id),
 first_published_at TIMESTAMPTZ
);
-- Existing records have unknown first-publication provenance. Never label their
-- migration, next edit or restoration as an original publication.
INSERT INTO catalog_first_publications(catalog_id,first_published_at) SELECT catalog_id,NULL FROM catalogs;
CREATE VIEW catalog_discovery AS
SELECT c.catalog_id,c.kind::text AS kind,c.title,p.first_published_at,
 COALESCE((SELECT array_agg(a.alias ORDER BY a._order) FROM catalogs_aliases a WHERE a._parent_id=c.id),ARRAY[]::varchar[]) AS aliases,
 jsonb_build_object(
 'dynasty',jsonb_build_object('state',COALESCE(c.filter_metadata_dynasty_state::text,'UNSUPPLIED'),'values',CASE WHEN c.filter_metadata_dynasty_state='VALUE' THEN string_to_array(c.filter_metadata_dynasty_tokens,E'\\n') ELSE ARRAY[]::text[] END),
 'textAuthor',jsonb_build_object('state',COALESCE(c.filter_metadata_text_author_state::text,'UNSUPPLIED'),'values',CASE WHEN c.filter_metadata_text_author_state='VALUE' THEN string_to_array(c.filter_metadata_text_author_tokens,E'\\n') ELSE ARRAY[]::text[] END),
 'calligrapher',jsonb_build_object('state',COALESCE(c.filter_metadata_calligrapher_state::text,'UNSUPPLIED'),'values',CASE WHEN c.filter_metadata_calligrapher_state='VALUE' THEN string_to_array(c.filter_metadata_calligrapher_tokens,E'\\n') ELSE ARRAY[]::text[] END),
 'originalRegion',jsonb_build_object('state',COALESCE(c.filter_metadata_original_region_state::text,'UNSUPPLIED'),'values',CASE WHEN c.filter_metadata_original_region_state='VALUE' THEN string_to_array(c.filter_metadata_original_region_tokens,E'\\n') ELSE ARRAY[]::text[] END),
 'script',jsonb_build_object('state',COALESCE(c.filter_metadata_script_state::text,'UNSUPPLIED'),'values',CASE WHEN c.filter_metadata_script_state='VALUE' THEN string_to_array(c.filter_metadata_script_tokens,E'\\n') ELSE ARRAY[]::text[] END)
 ) AS filter_metadata
FROM catalogs c LEFT JOIN catalog_first_publications p ON p.catalog_id=c.catalog_id
WHERE c._status='published' OFFSET 0;
`;
export async function recordFirstCatalogPublication(
  db: Pick<MigrateUpArgs["db"], "execute">,
  catalogId: string,
) {
  await db.execute(
    sql`INSERT INTO catalog_first_publications(catalog_id,first_published_at) VALUES(${catalogId},CURRENT_TIMESTAMP) ON CONFLICT(catalog_id) DO NOTHING`,
  );
}
