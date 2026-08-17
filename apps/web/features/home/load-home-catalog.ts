import { fetchServerCatalogPage } from "../../lib/public-api/server";
import { toHomeCatalogState } from "./catalog-state";

import type { HomeCatalogState } from "./catalog-state";

export const loadHomeCatalogState = async (): Promise<HomeCatalogState> =>
  toHomeCatalogState(await fetchServerCatalogPage());
