ALTER TABLE catalog_entries
  ADD COLUMN script_style VARCHAR(2000),
  ADD COLUMN script_style_state TEXT NOT NULL DEFAULT 'UNSUPPLIED',
  ADD COLUMN transcription VARCHAR(100000),
  ADD COLUMN transcription_state TEXT NOT NULL DEFAULT 'UNSUPPLIED',
  ADD COLUMN historical_context VARCHAR(20000),
  ADD COLUMN historical_context_state TEXT NOT NULL DEFAULT 'UNSUPPLIED',
  ADD COLUMN scholarly_research VARCHAR(20000),
  ADD COLUMN scholarly_research_state TEXT NOT NULL DEFAULT 'UNSUPPLIED',
  ADD CONSTRAINT catalog_entries_script_style_valid CHECK (
    script_style IS NULL
    OR (script_style <> '' AND script_style = BTRIM(script_style))
  ),
  ADD CONSTRAINT catalog_entries_script_style_state_valid CHECK (
    script_style_state IN ('VALUE', 'UNSUPPLIED', 'UNKNOWN', 'NOT_APPLICABLE', 'CLEAR')
    AND ((script_style_state = 'VALUE') = (script_style IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_transcription_valid CHECK (
    transcription IS NULL
    OR (transcription <> '' AND transcription = BTRIM(transcription))
  ),
  ADD CONSTRAINT catalog_entries_transcription_state_valid CHECK (
    transcription_state IN ('VALUE', 'UNSUPPLIED', 'CLEAR')
    AND ((transcription_state = 'VALUE') = (transcription IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_historical_context_valid CHECK (
    historical_context IS NULL
    OR (historical_context <> '' AND historical_context = BTRIM(historical_context))
  ),
  ADD CONSTRAINT catalog_entries_historical_context_state_valid CHECK (
    historical_context_state IN ('VALUE', 'UNSUPPLIED', 'CLEAR')
    AND ((historical_context_state = 'VALUE') = (historical_context IS NOT NULL))
  ),
  ADD CONSTRAINT catalog_entries_scholarly_research_valid CHECK (
    scholarly_research IS NULL
    OR (scholarly_research <> '' AND scholarly_research = BTRIM(scholarly_research))
  ),
  ADD CONSTRAINT catalog_entries_scholarly_research_state_valid CHECK (
    scholarly_research_state IN ('VALUE', 'UNSUPPLIED', 'CLEAR')
    AND ((scholarly_research_state = 'VALUE') = (scholarly_research IS NOT NULL))
  );

CREATE TABLE catalog_contributors (
  catalog_id VARCHAR(128) NOT NULL REFERENCES catalog_entries (catalog_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name VARCHAR(500) NOT NULL,
  role TEXT NOT NULL,
  PRIMARY KEY (catalog_id, position),
  CONSTRAINT catalog_contributors_identity_unique UNIQUE (catalog_id, name, role),
  CONSTRAINT catalog_contributors_position_valid CHECK (position >= 0),
  CONSTRAINT catalog_contributors_name_valid CHECK (
    name <> '' AND name = BTRIM(name)
  ),
  CONSTRAINT catalog_contributors_role_valid CHECK (
    role IN ('textAuthor', 'calligrapher')
  )
);

CREATE TABLE catalog_source_citation_scopes (
  catalog_id VARCHAR(128) NOT NULL,
  citation_position INTEGER NOT NULL,
  scope TEXT NOT NULL,
  PRIMARY KEY (catalog_id, citation_position, scope),
  CONSTRAINT catalog_source_citation_scopes_citation_fkey
    FOREIGN KEY (catalog_id, citation_position)
    REFERENCES catalog_source_citations (catalog_id, position)
    ON DELETE CASCADE,
  CONSTRAINT catalog_source_citation_scopes_scope_valid CHECK (
    scope IN (
      'record',
      'description',
      'transcription',
      'historicalContext',
      'scholarlyResearch'
    )
  )
);
