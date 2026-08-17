import {
  catalogListTransportQuerySchema,
  catalogPageSchema,
} from "@moya/contracts/schemas";

import type { CatalogListTransportQuery, CatalogPage } from "@moya/contracts";

export type CatalogPageTransportResult =
  | { state: "success"; page: CatalogPage }
  | { state: "unavailable" }
  | { state: "unexpected-error" };

export interface CatalogListTransportContext {
  baseUrl: URL;
  fetch: typeof globalThis.fetch;
}

const buildCatalogListUrl = (
  baseUrl: URL,
  query: CatalogListTransportQuery,
): URL | undefined => {
  const parsedQuery = catalogListTransportQuerySchema.safeParse(query);
  if (!parsedQuery.success) return undefined;

  const url = new URL("v1/catalog", baseUrl);
  const { kind, page, pageSize } = parsedQuery.data;

  if (kind !== undefined) url.searchParams.set("kind", kind);
  if (page !== undefined) url.searchParams.set("page", page);
  if (pageSize !== undefined) url.searchParams.set("pageSize", pageSize);

  return url;
};

export const fetchCatalogPage = async (
  context: CatalogListTransportContext,
  query: CatalogListTransportQuery = {},
): Promise<CatalogPageTransportResult> => {
  const url = buildCatalogListUrl(context.baseUrl, query);
  if (url === undefined) return { state: "unexpected-error" };

  try {
    const response = await context.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (response.status === 503) return { state: "unavailable" };
    if (response.status !== 200) return { state: "unexpected-error" };

    const parsedPage = catalogPageSchema.safeParse(await response.json());
    if (!parsedPage.success) return { state: "unexpected-error" };

    return { state: "success", page: parsedPage.data };
  } catch {
    return { state: "unexpected-error" };
  }
};
