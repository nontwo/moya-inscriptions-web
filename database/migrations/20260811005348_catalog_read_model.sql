CREATE TABLE catalog_entries (
  catalog_id VARCHAR(128) PRIMARY KEY,
  kind TEXT NOT NULL,
  title VARCHAR(500) NOT NULL,
  summary VARCHAR(2000),
  description VARCHAR(20000),
  period_label VARCHAR(200),
  CONSTRAINT catalog_entries_catalog_id_valid CHECK (
    catalog_id <> ''
    AND catalog_id !~ '[[:space:]]'
  ),
  CONSTRAINT catalog_entries_kind_valid CHECK (
    kind IN ('inscription', 'cliff_inscription', 'calligraphy')
  ),
  CONSTRAINT catalog_entries_title_valid CHECK (
    title <> '' AND title = BTRIM(title)
  ),
  CONSTRAINT catalog_entries_summary_valid CHECK (
    summary IS NULL OR (summary <> '' AND summary = BTRIM(summary))
  ),
  CONSTRAINT catalog_entries_description_valid CHECK (
    description IS NULL
    OR (description <> '' AND description = BTRIM(description))
  ),
  CONSTRAINT catalog_entries_period_label_valid CHECK (
    period_label IS NULL
    OR (period_label <> '' AND period_label = BTRIM(period_label))
  )
);

CREATE TABLE catalog_aliases (
  catalog_id VARCHAR(128) NOT NULL REFERENCES catalog_entries (catalog_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  alias VARCHAR(500) NOT NULL,
  PRIMARY KEY (catalog_id, position),
  CONSTRAINT catalog_aliases_position_valid CHECK (position >= 0),
  CONSTRAINT catalog_aliases_alias_valid CHECK (
    alias <> '' AND alias = BTRIM(alias)
  )
);

CREATE TABLE catalog_source_citations (
  catalog_id VARCHAR(128) NOT NULL REFERENCES catalog_entries (catalog_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label VARCHAR(500) NOT NULL,
  citation VARCHAR(2000),
  url TEXT,
  PRIMARY KEY (catalog_id, position),
  CONSTRAINT catalog_source_citations_position_valid CHECK (position >= 0),
  CONSTRAINT catalog_source_citations_label_valid CHECK (
    label <> '' AND label = BTRIM(label)
  ),
  CONSTRAINT catalog_source_citations_citation_valid CHECK (
    citation IS NULL OR (citation <> '' AND citation = BTRIM(citation))
  ),
  CONSTRAINT catalog_source_citations_url_valid CHECK (
    url IS NULL OR (url <> '' AND url = BTRIM(url))
  )
);
