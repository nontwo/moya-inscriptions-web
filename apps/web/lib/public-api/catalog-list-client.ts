import {
  catalogListTransportQuerySchema,
  catalogPageSchema,
} from "@moya/contracts/schemas";

import type { CatalogListTransportQuery } from "@moya/contracts";
import type { CatalogPageTransportResult } from "./catalog-list";

export interface CatalogListClientContext {
  readonly baseUrl: URL;
  readonly fetch: typeof globalThis.fetch;
}

const defaultContext = (): CatalogListClientContext => ({
  baseUrl: new URL(globalThis.location.href),
  fetch: globalThis.fetch,
});

export const parseCatalogListTransportQuery = (candidate: unknown) => {
  const parsed = catalogListTransportQuerySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

export const parseCatalogPage = (candidate: unknown) => {
  const parsed = catalogPageSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

export const fetchSameOriginCatalogPage = async (
  query: CatalogListTransportQuery = {},
  signal?: AbortSignal,
  context: CatalogListClientContext = defaultContext(),
): Promise<CatalogPageTransportResult> => {
  const parsedQuery = parseCatalogListTransportQuery(query);
  if (parsedQuery === null) return { state: "unexpected-error" };

  const url = new URL("/api/catalog", context.baseUrl);
  const { kind, page, pageSize } = parsedQuery;
  if (kind !== undefined) url.searchParams.set("kind", kind);
  if (page !== undefined) url.searchParams.set("page", page);
  if (pageSize !== undefined) url.searchParams.set("pageSize", pageSize);

  try {
    const response = await context.fetch.call(globalThis, url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      method: "GET",
      ...(signal === undefined ? {} : { signal }),
    });

    if (response.status === 503) return { state: "unavailable" };
    if (response.status !== 200) return { state: "unexpected-error" };

    const parsedPage = parseCatalogPage(await response.json());
    return parsedPage !== null
      ? { page: parsedPage, state: "success" }
      : { state: "unexpected-error" };
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { state: "unexpected-error" };
  }
};
