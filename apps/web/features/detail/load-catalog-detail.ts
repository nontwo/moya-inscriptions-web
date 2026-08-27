import { fetchSameOriginCatalogDetail } from "../../lib/public-api/catalog-detail-client";
import { toCatalogDetailPresentation } from "./catalog-detail-presentation";

import type { CatalogDetailTransportResult } from "../../lib/public-api/catalog-detail";
import type {
  CatalogDetailPresentationState,
  CatalogDetailSourceIdentity,
} from "./catalog-detail-presentation";

export type CatalogDetailSource = (
  catalogId: string,
  signal?: AbortSignal,
) => Promise<CatalogDetailTransportResult>;

export type CatalogDetailPresentationLoader = (
  catalogId: string,
  signal?: AbortSignal,
) => Promise<CatalogDetailPresentationState>;

export const loadCatalogDetailPresentation = async (
  catalogId: string,
  signal?: AbortSignal,
  source: CatalogDetailSource = fetchSameOriginCatalogDetail,
  sourceIdentity: CatalogDetailSourceIdentity = "runtime",
): Promise<CatalogDetailPresentationState> => {
  const result = await source(catalogId, signal);

  switch (result.state) {
    case "success":
      return {
        detail: toCatalogDetailPresentation(result.detail, sourceIdentity),
        state: "loaded",
      };
    case "not-found":
      return { state: "not-found" };
    case "unavailable":
      return { state: "unavailable" };
    case "unexpected-error":
      return { state: "unexpected-error" };
  }
};
