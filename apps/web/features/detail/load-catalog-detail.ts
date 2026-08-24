import { fetchServerCatalogDetail } from "../../lib/public-api/server";
import { toRuntimeCatalogDetailPresentation } from "./catalog-detail-presentation";

import type {
  CatalogDetailEnvironment,
  CatalogDetailPresentationState,
} from "./catalog-detail-presentation";

export type CatalogDetailSource = typeof fetchServerCatalogDetail;

export const loadCatalogDetailPresentation = async (
  catalogId: string,
  environment: CatalogDetailEnvironment,
  source: CatalogDetailSource = fetchServerCatalogDetail,
): Promise<CatalogDetailPresentationState> => {
  const result = await source(catalogId);

  switch (result.state) {
    case "success":
      return {
        detail: toRuntimeCatalogDetailPresentation(result.detail, environment),
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
