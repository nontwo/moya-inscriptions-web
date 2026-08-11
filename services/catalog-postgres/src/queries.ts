export const countCatalogEntriesSql = `
  SELECT COUNT(*)::text AS total
  FROM catalog_entries
`;

export const listCatalogEntriesSql = `
  SELECT catalog_id, kind, title, summary, period_label
  FROM catalog_entries
  ORDER BY catalog_id ASC
  LIMIT $1::integer OFFSET $2::bigint
`;

export const findCatalogEntrySql = `
  SELECT catalog_id, kind, title, summary, description, period_label
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
