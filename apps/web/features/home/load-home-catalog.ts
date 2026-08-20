import { fetchServerCatalogPage } from "../../lib/public-api/server";
import { toHomeCatalogState } from "./catalog-state";

import type { CatalogListTransportQuery } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

export const loadHomeCatalogState = async (
  query?: CatalogListTransportQuery,
): Promise<HomeCatalogState> =>
  toHomeCatalogState(
    query === undefined
      ? await fetchServerCatalogPage()
      : await fetchServerCatalogPage(query),
  );
