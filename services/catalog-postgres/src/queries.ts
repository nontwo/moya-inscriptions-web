export const countCatalogEntriesSql = `
  SELECT COUNT(*)::text AS total
  FROM catalog_entries
  WHERE ($1::text IS NULL OR kind = $1::text)
`;

export const listCatalogEntriesSql = `
  SELECT catalog_id, kind, title, summary, period_label,
         dynasty, dynasty_state, date_text, date_text_state,
         province, province_state, prefecture, prefecture_state,
         county, county_state, current_location, current_location_state,
         current_custodian, current_custodian_state
  FROM catalog_entries
  WHERE ($1::text IS NULL OR kind = $1::text)
  ORDER BY catalog_id ASC
  LIMIT $2::integer OFFSET $3::bigint
`;

export const findCatalogEntrySql = `
  SELECT catalog_id, kind, title, summary, description, period_label,
         dynasty, dynasty_state, date_text, date_text_state,
         province, province_state, prefecture, prefecture_state,
         county, county_state, current_location, current_location_state,
         current_custodian, current_custodian_state
  FROM catalog_entries
  WHERE catalog_id = $1
`;

export const listCatalogAliasesSql = `
  SELECT catalog_id, position, alias
  FROM catalog_aliases
  WHERE catalog_id = ANY($1::text[])
  ORDER BY catalog_id ASC, position ASC
`;

export const listCatalogCitationsSql = `
  SELECT catalog_id, position, label, citation, url
  FROM catalog_source_citations
  WHERE catalog_id = $1
  ORDER BY position ASC
`;

export const listRepresentativeCatalogMediaSql = `
  SELECT media_id, catalog_id, position, is_representative, kind,
         alt_text, width, height, object_key
  FROM catalog_media
  WHERE catalog_id = ANY($1::text[])
    AND is_representative
  ORDER BY catalog_id ASC
`;

export const listCatalogMediaSql = `
  SELECT media_id, catalog_id, position, is_representative, kind,
         alt_text, width, height, object_key
  FROM catalog_media
  WHERE catalog_id = $1
  ORDER BY position ASC
`;
