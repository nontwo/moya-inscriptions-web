import type { CatalogListTransportQuery } from "@moya/contracts";
import { catalogListTransportQuerySchema } from "@moya/contracts/schemas";

import type { CatalogListQuery } from "../application/queries/catalog-list-query.js";

const normalizeCatalogListQuery = (
  query: CatalogListTransportQuery,
): CatalogListQuery => ({
  page: query.page === undefined ? 1 : Number(query.page),
  pageSize: query.pageSize === undefined ? 20 : Number(query.pageSize),
});

/** Validates transport input before creating normalized application input. */
export const parseCatalogListQuery = (input: unknown): CatalogListQuery =>
  normalizeCatalogListQuery(catalogListTransportQuerySchema.parse(input));
