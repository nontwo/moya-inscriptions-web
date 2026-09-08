import {
  catalogSearchTransportQuerySchema,
  catalogSearchPageSchema,
} from "@moya/contracts/schemas";
import type {
  CatalogSearchTransportQuery,
  CatalogSearchPage,
} from "@moya/contracts";

export type CatalogSearchTransportResult =
  | { readonly state: "success"; readonly page: CatalogSearchPage }
  | { readonly state: "invalid-query" | "unavailable" | "unexpected-error" };

export interface CatalogSearchTransportContext {
  readonly baseUrl: URL;
  readonly fetch: typeof globalThis.fetch;
}

export const fetchCatalogSearchPage = async (
  context: CatalogSearchTransportContext,
  query: CatalogSearchTransportQuery,
  signal?: AbortSignal,
): Promise<CatalogSearchTransportResult> => {
  const parsed = catalogSearchTransportQuerySchema.safeParse(query);
  if (!parsed.success) return { state: "invalid-query" };
  const url = new URL("v1/catalog-search", context.baseUrl);
  for (const [name, value] of Object.entries(parsed.data)) {
    if (value !== undefined) url.searchParams.set(name, value);
  }
  try {
    const response = await context.fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
      ...(signal === undefined ? {} : { signal }),
    });
    if (response.status === 400) return { state: "invalid-query" };
    if (response.status === 503) return { state: "unavailable" };
    if (response.status !== 200) return { state: "unexpected-error" };
    const page = catalogSearchPageSchema.safeParse(await response.json());
    return page.success
      ? { state: "success", page: page.data }
      : { state: "unexpected-error" };
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { state: "unexpected-error" };
  }
};
