/**
 * Payload 3.88 PostgreSQL primary document and embedded child tables are the
 * published authority. Draft versions and mutable media-master rows are never
 * joined here. Existing Public API queries retain their DTO and transaction
 * boundary through these views; there is no copied editable projection.
 *
 * OFFSET 0 deliberately makes each view non-updatable in PostgreSQL. Install
 * through a CMS migration in its own database, where these legacy names are
 * absent. Runtime credentials still receive SELECT privileges only.
 */
export const createPublishedCatalogViewsSql = `
CREATE VIEW catalog_entries AS
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
  c.scholarly_research_state::text AS scholarly_research_state
FROM catalogs c
WHERE c._status = 'published'
OFFSET 0;

CREATE VIEW catalog_aliases AS
SELECT c.catalog_id, (a._order - 1)::integer AS position, a.alias
FROM catalogs_aliases a
JOIN catalogs c ON c.id = a._parent_id
WHERE c._status = 'published'
OFFSET 0;

CREATE VIEW catalog_contributors AS
SELECT c.catalog_id, (a._order - 1)::integer AS position, a.name, a.role::text AS role
FROM catalogs_contributors a
JOIN catalogs c ON c.id = a._parent_id
WHERE c._status = 'published'
OFFSET 0;

CREATE VIEW catalog_source_citations AS
SELECT c.catalog_id, (a._order - 1)::integer AS position, a.label, a.citation, a.url
FROM catalogs_source_citations a
JOIN catalogs c ON c.id = a._parent_id
WHERE c._status = 'published'
OFFSET 0;

CREATE VIEW catalog_source_citation_scopes AS
SELECT c.catalog_id, (a._order - 1)::integer AS citation_position, s.value::text AS scope
FROM catalogs_source_citations_applies_to s
JOIN catalogs_source_citations a ON a.id = s.parent_id
JOIN catalogs c ON c.id = a._parent_id
WHERE c._status = 'published'
OFFSET 0;

CREATE VIEW catalog_media AS
SELECT
  m.media_id,
  c.catalog_id,
  m.position::integer AS position,
  m.is_representative,
  'image'::text AS kind,
  m.alt AS alt_text,
  m.width::integer AS width,
  m.height::integer AS height,
  m.object_key
FROM catalogs_media m
JOIN catalogs c ON c.id = m._parent_id
WHERE c._status = 'published'
OFFSET 0;
`;

export const dropPublishedCatalogViewsSql = `
DROP VIEW catalog_media;
DROP VIEW catalog_source_citation_scopes;
DROP VIEW catalog_source_citations;
DROP VIEW catalog_contributors;
DROP VIEW catalog_aliases;
DROP VIEW catalog_entries;
`;
