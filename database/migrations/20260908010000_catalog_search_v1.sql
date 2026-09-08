CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Rebuildable projection only. Catalog identity and original text remain authoritative.
CREATE TABLE catalog_search_documents (
  catalog_id VARCHAR(128) PRIMARY KEY REFERENCES catalog_entries (catalog_id) ON DELETE CASCADE,
  normalization_version TEXT COLLATE "C" NOT NULL,
  title TEXT COLLATE "C" NOT NULL,
  aliases TEXT[] COLLATE "C" NOT NULL,
  normalized_title TEXT COLLATE "C" NOT NULL,
  normalized_aliases TEXT[] COLLATE "C" NOT NULL,
  title_alias_text TEXT COLLATE "C" NOT NULL,
  structured_text TEXT COLLATE "C" NOT NULL,
  combined_text TEXT COLLATE "C" NOT NULL
);

CREATE INDEX catalog_search_documents_combined_trgm
  ON catalog_search_documents USING GIN (combined_text public.gin_trgm_ops);

-- A writer that bypasses the controlled importer must not leave stale matches.
-- This is invoker-security: existing operator/runtime identities are not broadened.
CREATE FUNCTION invalidate_catalog_search_document()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  invalidate_sql TEXT;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    EXECUTE format('UPDATE %I.catalog_search_documents SET
      normalization_version = ''invalidated'', title = '''', aliases = ''{}''::text[],
      normalized_title = '''', normalized_aliases = ''{}''::text[],
      title_alias_text = '''', structured_text = '''', combined_text = ''''', TG_TABLE_SCHEMA);
  ELSE
    -- Keep one conflicting tuple, including when the copy is initially missing.
    -- The parent SELECT also prevents recreation during ON DELETE CASCADE.
    invalidate_sql := format('INSERT INTO %1$I.catalog_search_documents (
      catalog_id, normalization_version, title, aliases, normalized_title,
      normalized_aliases, title_alias_text, structured_text, combined_text
    ) SELECT catalog_id, ''invalidated'', '''', ''{}''::text[], '''', ''{}''::text[], '''', '''', ''''
      FROM %1$I.catalog_entries WHERE catalog_id = $1
    ON CONFLICT (catalog_id) DO UPDATE SET
      normalization_version = ''invalidated'', title = '''', aliases = ''{}''::text[],
      normalized_title = '''', normalized_aliases = ''{}''::text[],
      title_alias_text = '''', structured_text = '''', combined_text = ''''', TG_TABLE_SCHEMA);
    IF TG_OP <> 'INSERT' THEN
      EXECUTE invalidate_sql USING OLD.catalog_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      EXECUTE invalidate_sql USING NEW.catalog_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER catalog_entries_search_invalidation
AFTER UPDATE OF title, summary, description, description_state, period_label,
  dynasty, dynasty_state, date_text, date_text_state, script_style, script_style_state,
  province, province_state, prefecture, prefecture_state, county, county_state,
  current_location, current_location_state, current_custodian, current_custodian_state,
  transcription, transcription_state ON catalog_entries
FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_search_document();

CREATE TRIGGER catalog_aliases_search_invalidation
AFTER INSERT OR UPDATE OR DELETE ON catalog_aliases
FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_search_document();

CREATE TRIGGER catalog_contributors_search_invalidation
AFTER INSERT OR UPDATE OR DELETE ON catalog_contributors
FOR EACH ROW EXECUTE FUNCTION invalidate_catalog_search_document();

CREATE TRIGGER catalog_aliases_search_truncate_invalidation
AFTER TRUNCATE ON catalog_aliases
FOR EACH STATEMENT EXECUTE FUNCTION invalidate_catalog_search_document();

CREATE TRIGGER catalog_contributors_search_truncate_invalidation
AFTER TRUNCATE ON catalog_contributors
FOR EACH STATEMENT EXECUTE FUNCTION invalidate_catalog_search_document();
