import {
  catalogSearchTransportQuerySchema,
  catalogSearchPageSchema,
} from "@moya/contracts/schemas";
import type { CatalogSearchTransportQuery } from "@moya/contracts";
import type {
  CatalogSearchTransportContext,
  CatalogSearchTransportResult,
} from "./catalog-search";

const defaultContext = (): CatalogSearchTransportContext => ({
  baseUrl: new URL(globalThis.location.href),
  fetch: globalThis.fetch,
});
export const parseCatalogSearchQuery = (candidate: unknown) => {
  const parsed = catalogSearchTransportQuerySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};
export const parseCatalogSearchPage = (candidate: unknown) => {
  const parsed = catalogSearchPageSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};
export const fetchSameOriginCatalogSearchPage = async (
  query: CatalogSearchTransportQuery,
  signal?: AbortSignal,
  context: CatalogSearchTransportContext = defaultContext(),
): Promise<CatalogSearchTransportResult> => {
  const parsed = parseCatalogSearchQuery(query);
  if (parsed === null) return { state: "invalid-query" };
  const url = new URL("/api/catalog-search", context.baseUrl);
  for (const [name, value] of Object.entries(parsed)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  try {
    const response = await context.fetch.call(globalThis, url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      ...(signal === undefined ? {} : { signal }),
    });
    if (response.status === 400) return { state: "invalid-query" };
    if (response.status === 503) return { state: "unavailable" };
    if (response.status !== 200) return { state: "unexpected-error" };
    const page = parseCatalogSearchPage(await response.json());
    return page === null
      ? { state: "unexpected-error" }
      : { state: "success", page };
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { state: "unexpected-error" };
  }
};
