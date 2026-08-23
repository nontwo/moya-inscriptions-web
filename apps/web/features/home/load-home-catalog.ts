import { fetchServerCatalogPage } from "../../lib/public-api/server";
import { toHomeCatalogState } from "./catalog-state";

import type { CatalogListTransportQuery } from "@moya/contracts";
import type { CatalogPageTransportResult } from "../../lib/public-api/catalog-list";
import type { HomeCatalogState } from "./catalog-state";

export type HomeCatalogSource = (
  query?: CatalogListTransportQuery,
) => Promise<CatalogPageTransportResult>;

export const loadHomeCatalogState = async (
  query?: CatalogListTransportQuery,
  source: HomeCatalogSource = fetchServerCatalogPage,
): Promise<HomeCatalogState> =>
  toHomeCatalogState(
    query === undefined ? await source() : await source(query),
  );
