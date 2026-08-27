import { catalogDetailSchema, catalogIdSchema } from "@moya/contracts/schemas";

import type { CatalogDetailTransportResult } from "./catalog-detail";

export interface CatalogDetailClientContext {
  readonly baseUrl: URL;
  readonly fetch: typeof globalThis.fetch;
}

const defaultContext = (): CatalogDetailClientContext => ({
  baseUrl: new URL(globalThis.location.href),
  fetch: globalThis.fetch,
});

export const fetchSameOriginCatalogDetail = async (
  catalogId: string,
  signal?: AbortSignal,
  context: CatalogDetailClientContext = defaultContext(),
): Promise<CatalogDetailTransportResult> => {
  const parsedId = catalogIdSchema.safeParse(catalogId);
  if (!parsedId.success) return { state: "not-found" };

  try {
    const response = await context.fetch.call(
      globalThis,
      new URL(
        `/api/catalog/${encodeURIComponent(parsedId.data)}`,
        context.baseUrl,
      ),
      {
        headers: { Accept: "application/json" },
        method: "GET",
        ...(signal === undefined ? {} : { signal }),
      },
    );

    if (response.status === 404) return { state: "not-found" };
    if (response.status === 503) return { state: "unavailable" };
    if (response.status !== 200) return { state: "unexpected-error" };

    const parsedDetail = catalogDetailSchema.safeParse(await response.json());
    if (!parsedDetail.success || parsedDetail.data.id !== parsedId.data) {
      return { state: "unexpected-error" };
    }

    return { detail: parsedDetail.data, state: "success" };
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { state: "unexpected-error" };
  }
};
