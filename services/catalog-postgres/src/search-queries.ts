import {
  normalizeSearchText,
  SEARCH_NORMALIZATION_VERSION,
} from "@moya/search";

import { catalogPageOffset } from "./pagination.js";

import type { CatalogSearchQuery } from "@moya/api";

/** Query punctuation is literal; only whitespace separates same-record AND parts. */
export const escapeSearchLike = (text: string): string =>
  text.replace(/[\\%_]/g, "\\$&");

export const catalogSearchReadySql = `
  SELECT EXISTS (
    SELECT 1 FROM catalog_entries AS entry
    LEFT JOIN catalog_search_documents AS document USING (catalog_id)
    WHERE document.catalog_id IS NULL OR document.normalization_version <> $1::text
  ) AS incomplete
`;

export const buildCatalogSearchSql = ({
  q,
  kind,
  page,
  pageSize,
}: CatalogSearchQuery) => {
  const originalQuery = q.trim();
  const normalizedQuery = normalizeSearchText(originalQuery);
  const parts = normalizedQuery.split(/\s+/u).filter(Boolean);
  if (parts.length === 0 || originalQuery.length > 200) {
    throw new Error("Invalid Catalog search query");
  }
  const values: unknown[] = [
    kind ?? null,
    SEARCH_NORMALIZATION_VERSION,
    originalQuery,
    normalizedQuery,
    ...parts.map((part) => `%${escapeSearchLike(part)}%`),
  ];
  const matches = (expression: string) =>
    parts
      .map((_, index) => `${expression} LIKE $${index + 5}::text ESCAPE '\\'`)
      .join(" AND ");
  const where = `($1::text IS NULL OR entry.kind = $1::text)
    AND document.normalization_version = $2::text
    AND (${matches("document.combined_text")})`;
  const ranked = `
    SELECT entry.catalog_id,
      CASE
        WHEN document.title = $3::text THEN 0
        WHEN $3::text = ANY(document.aliases) THEN 1
        WHEN document.normalized_title = $4::text
          OR $4::text = ANY(document.normalized_aliases) THEN 2
        WHEN ${matches("document.title_alias_text")} THEN 3
        WHEN ${matches("(document.title_alias_text || E'\\n' || document.structured_text)")} THEN 4
        ELSE 5
      END AS search_rank
    FROM catalog_entries AS entry
    JOIN catalog_search_documents AS document USING (catalog_id)
    WHERE ${where}
  `;
  // The tier is evaluated across the full matching set, before LIMIT/OFFSET.
  const listSql = `
    WITH ranked AS (${ranked})
    SELECT entry.catalog_id, entry.kind, entry.title, entry.summary, entry.period_label,
      entry.dynasty, entry.dynasty_state, entry.date_text, entry.date_text_state,
      entry.province, entry.province_state, entry.prefecture, entry.prefecture_state,
      entry.county, entry.county_state, entry.current_location, entry.current_location_state,
      entry.current_custodian, entry.current_custodian_state, ranked.search_rank
    FROM ranked JOIN catalog_entries AS entry USING (catalog_id)
    ORDER BY ranked.search_rank ASC, entry.catalog_id COLLATE "C" ASC
    LIMIT $${values.length + 1}::integer OFFSET $${values.length + 2}::bigint
  `;
  return {
    countSql: `SELECT COUNT(*)::text AS total FROM (${ranked}) AS matching`,
    countValues: values,
    listSql,
    listValues: [
      ...values,
      pageSize,
      catalogPageOffset(page, pageSize).toString(),
    ],
  };
};
