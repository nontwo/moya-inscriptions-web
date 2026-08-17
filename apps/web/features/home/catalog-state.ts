import type { CatalogPage } from "@moya/contracts";
import type { CatalogPageTransportResult } from "../../lib/public-api/catalog-list.js";

export type HomeCatalogState =
  | { state: "populated"; page: CatalogPage }
  | { state: "empty"; page: CatalogPage }
  | { state: "unavailable" }
  | { state: "unexpected-error" };

export const toHomeCatalogState = (
  result: CatalogPageTransportResult,
): HomeCatalogState => {
  if (result.state !== "success") return result;

  return result.page.total === 0
    ? { state: "empty", page: result.page }
    : { state: "populated", page: result.page };
};
