ALTER TABLE catalog_entries
  ADD COLUMN dynasty VARCHAR(500),
  ADD COLUMN dynasty_state TEXT,
  ADD COLUMN date_text VARCHAR(500),
  ADD COLUMN date_text_state TEXT,
  ADD COLUMN province VARCHAR(500),
  ADD COLUMN province_state TEXT,
  ADD COLUMN prefecture VARCHAR(500),
  ADD COLUMN prefecture_state TEXT,
  ADD COLUMN county VARCHAR(500),
  ADD COLUMN county_state TEXT,
  ADD COLUMN current_location VARCHAR(500),
  ADD COLUMN current_location_state TEXT,
  ADD COLUMN current_custodian VARCHAR(500),
  ADD COLUMN current_custodian_state TEXT,
  ADD COLUMN description_state TEXT;

UPDATE catalog_entries
SET dynasty_state = 'UNSUPPLIED',
    date_text_state = 'UNSUPPLIED',
    province_state = 'UNSUPPLIED',
    prefecture_state = 'UNSUPPLIED',
    county_state = 'UNSUPPLIED',
    current_location_state = 'UNSUPPLIED',
    current_custodian_state = 'UNSUPPLIED',
    description_state = CASE
      WHEN description IS NULL THEN 'UNSUPPLIED'
      ELSE 'VALUE'
    END;

ALTER TABLE catalog_entries
  ALTER COLUMN dynasty_state SET DEFAULT 'UNSUPPLIED',
  ALTER COLUMN dynasty_state SET NOT NULL,
  ALTER COLUMN date_text_state SET DEFAULT 'UNSUPPLIED',
  ALTER COLUMN date_text_state SET NOT NULL,
  ALTER COLUMN province_state SET DEFAULT 'UNSUPPLIED',
  ALTER COLUMN province_state SET NOT NULL,
  ALTER COLUMN prefecture_state SET DEFAULT 'UNSUPPLIED',
  ALTER COLUMN prefecture_state SET NOT NULL,
  ALTER COLUMN county_state SET DEFAULT 'UNSUPPLIED',
  ALTER COLUMN county_state SET NOT NULL,
  ALTER COLUMN current_location_state SET DEFAULT 'UNSUPPLIED',
  ALTER COLUMN current_location_state SET NOT NULL,
  ALTER COLUMN current_custodian_state SET DEFAULT 'UNSUPPLIED',
  ALTER COLUMN current_custodian_state SET NOT NULL,
  ALTER COLUMN description_state SET DEFAULT 'UNSUPPLIED',
  ALTER COLUMN description_state SET NOT NULL,
  ADD CONSTRAINT catalog_entries_dynasty_state_valid CHECK (
    dynasty_state IN ('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR')
    AND ((dynasty_state = 'VALUE') = (dynasty IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_date_text_state_valid CHECK (
    date_text_state IN ('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR')
    AND ((date_text_state = 'VALUE') = (date_text IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_province_state_valid CHECK (
    province_state IN ('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR')
    AND ((province_state = 'VALUE') = (province IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_prefecture_state_valid CHECK (
    prefecture_state IN ('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR')
    AND ((prefecture_state = 'VALUE') = (prefecture IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_county_state_valid CHECK (
    county_state IN ('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR')
    AND ((county_state = 'VALUE') = (county IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_current_location_state_valid CHECK (
    current_location_state IN ('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR')
    AND ((current_location_state = 'VALUE') = (current_location IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_current_custodian_state_valid CHECK (
    current_custodian_state IN ('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR')
    AND ((current_custodian_state = 'VALUE') = (current_custodian IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_description_state_valid CHECK (
    description_state IN ('VALUE', 'UNSUPPLIED', 'CLEAR')
    AND ((description_state = 'VALUE') = (description IS NOT NULL))
  );

ALTER TABLE catalog_aliases
  ADD COLUMN alias_type TEXT NOT NULL DEFAULT 'alternate',
  ADD CONSTRAINT catalog_aliases_alias_type_valid CHECK (
    alias_type IN ('alternate', 'historical')
  );

CREATE TABLE catalog_import_sources (
  source_id VARCHAR(128) PRIMARY KEY,
  catalog_id VARCHAR(128) NOT NULL REFERENCES catalog_entries (catalog_id),
  source_title VARCHAR(500),
  source_type_raw VARCHAR(200),
  source_url TEXT,
  source_note VARCHAR(2000),
  CONSTRAINT catalog_import_sources_source_id_valid CHECK (
    source_id <> '' AND source_id !~ '[[:space:]]'
  ),
  CONSTRAINT catalog_import_sources_title_valid CHECK (
    source_title IS NULL OR (source_title <> '' AND source_title = BTRIM(source_title))
  ),
  CONSTRAINT catalog_import_sources_type_valid CHECK (
    source_type_raw IS NULL OR (source_type_raw <> '' AND source_type_raw = BTRIM(source_type_raw))
  ),
  CONSTRAINT catalog_import_sources_url_valid CHECK (
    source_url IS NULL OR (source_url <> '' AND source_url = BTRIM(source_url))
  ),
  CONSTRAINT catalog_import_sources_note_valid CHECK (
    source_note IS NULL OR (source_note <> '' AND source_note = BTRIM(source_note))
  )
);

CREATE TABLE catalog_import_operations (
  operation_id VARCHAR(128) PRIMARY KEY,
  import_contract_version TEXT NOT NULL,
  canonical_input_sha256 CHAR(64) NOT NULL,
  dry_run_result_sha256 CHAR(64) NOT NULL,
  approval_sha256 CHAR(64) NOT NULL,
  validation_context JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPLYING', 'APPLIED')),
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  applied_at TIMESTAMPTZ,
  CONSTRAINT catalog_import_operations_id_valid CHECK (
    operation_id <> '' AND operation_id !~ '[[:space:]]'
  ),
  CONSTRAINT catalog_import_operations_contract_valid CHECK (
    import_contract_version = 'catalog-import/v1'
  ),
  CONSTRAINT catalog_import_operations_input_hash_valid CHECK (
    canonical_input_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT catalog_import_operations_plan_hash_valid CHECK (
    dry_run_result_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT catalog_import_operations_approval_hash_valid CHECK (
    approval_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT catalog_import_operations_completion_valid CHECK (
    (status = 'APPLYING' AND result_json IS NULL AND applied_at IS NULL)
    OR (status = 'APPLIED' AND result_json IS NOT NULL AND applied_at IS NOT NULL)
  ),
  UNIQUE (canonical_input_sha256, dry_run_result_sha256, approval_sha256)
);

CREATE TABLE catalog_import_operation_items (
  operation_id VARCHAR(128) NOT NULL REFERENCES catalog_import_operations (operation_id),
  catalog_import_id VARCHAR(128) NOT NULL,
  source_id VARCHAR(128) NOT NULL REFERENCES catalog_import_sources (source_id),
  catalog_id VARCHAR(128) NOT NULL REFERENCES catalog_entries (catalog_id),
  result TEXT NOT NULL CHECK (result IN ('CREATED', 'UPDATED', 'UNCHANGED')),
  PRIMARY KEY (operation_id, catalog_import_id),
  UNIQUE (operation_id, source_id),
  UNIQUE (operation_id, catalog_id)
);

CREATE FUNCTION normalize_catalog_description_import_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.description IS NOT NULL AND NEW.description_state = 'UNSUPPLIED' THEN
    NEW.description_state := 'VALUE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_entries_description_import_state
BEFORE INSERT OR UPDATE OF description, description_state ON catalog_entries
FOR EACH ROW
EXECUTE FUNCTION normalize_catalog_description_import_state();
