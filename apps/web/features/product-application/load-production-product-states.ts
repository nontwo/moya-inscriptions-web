import { createRuntimeCalligraphyCategorySurface } from "../calligraphy/calligraphy-category";
import { loadHomeCatalogState } from "../home/load-home-catalog";
import {
  loadDiscoverFeed,
  unavailableNearbySource,
  unavailableTopicsSource,
} from "../../sources/home/home-sources";

import type { T02pDevelopmentCatalogDestinationStates } from "../product-preview/catalog-scenarios";

export const loadProductionProductStates =
  async (): Promise<T02pDevelopmentCatalogDestinationStates> => {
    const [discover, nearby, topics, inscriptions, calligraphy] =
      await Promise.all([
        loadDiscoverFeed(),
        unavailableNearbySource(),
        unavailableTopicsSource(),
        loadHomeCatalogState({
          kind: "inscription",
          page: "1",
          pageSize: "24",
        }),
        loadHomeCatalogState({
          kind: "calligraphy",
          page: "1",
          pageSize: "24",
        }),
      ]);

    return {
      calligraphy: createRuntimeCalligraphyCategorySurface(calligraphy),
      home: { discover, nearby, topics },
      inscriptions,
    };
  };
