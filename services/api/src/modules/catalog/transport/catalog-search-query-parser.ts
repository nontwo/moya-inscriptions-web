import { catalogSearchTransportQuerySchema } from "@moya/contracts/schemas";
import type { CatalogSearchQuery } from "../application/queries/catalog-search-query.js";

export const parseCatalogSearchQuery = (input: unknown): CatalogSearchQuery => {
  const parsed = catalogSearchTransportQuerySchema.parse(input);
  return {
    q: parsed.q.trim(),
    ...(parsed.kind === undefined ? {} : { kind: parsed.kind }),
    page: parsed.page === undefined ? 1 : Number(parsed.page),
    pageSize: parsed.pageSize === undefined ? 20 : Number(parsed.pageSize),
  };
};
