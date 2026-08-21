import {
  catalogDetailSchema,
  catalogIdSchema,
} from "@moya/contracts/schemas";

import type { CatalogDetail } from "@moya/contracts";

export type CatalogDetailTransportResult =
  | { state: "success"; detail: CatalogDetail }
  | { state: "not-found" }
  | { state: "unavailable" }
  | { state: "unexpected-error" };

export interface CatalogDetailTransportContext {
  baseUrl: URL;
  fetch: typeof globalThis.fetch;
}

const buildCatalogDetailUrl = (
  baseUrl: URL,
  catalogId: string,
): URL | undefined => {
  const parsedId = catalogIdSchema.safeParse(catalogId);
  if (!parsedId.success) return undefined;

  return new URL(`v1/catalog/${encodeURIComponent(parsedId.data)}`, baseUrl);
};

export const fetchCatalogDetail = async (
  context: CatalogDetailTransportContext,
  catalogId: string,
): Promise<CatalogDetailTransportResult> => {
  const url = buildCatalogDetailUrl(context.baseUrl, catalogId);
  if (url === undefined) return { state: "not-found" };

  try {
    const response = await context.fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) return { state: "not-found" };
    if (response.status === 503) return { state: "unavailable" };
    if (response.status !== 200) return { state: "unexpected-error" };

    const parsedDetail = catalogDetailSchema.safeParse(await response.json());
    if (!parsedDetail.success) return { state: "unexpected-error" };

    return { state: "success", detail: parsedDetail.data };
  } catch {
    return { state: "unexpected-error" };
  }
};
