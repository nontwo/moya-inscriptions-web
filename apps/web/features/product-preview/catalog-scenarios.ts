import type { HomeCatalogState } from "../home/catalog-state";
import type { HomeSurfaceData } from "../home/home-feed";
import type { CalligraphyCategorySurfaceData } from "../calligraphy/calligraphy-category";

export type T02pDevelopmentCatalogScenario =
  "visual" | "small-populated" | "empty" | "unavailable" | "unexpected-error";

export interface T02pDevelopmentCatalogDestinationStates {
  readonly calligraphy: CalligraphyCategorySurfaceData;
  readonly home: HomeSurfaceData;
  readonly inscriptions: HomeCatalogState;
}

export type T02pDevelopmentCatalogScenarios = Readonly<
  Record<
    T02pDevelopmentCatalogScenario,
    T02pDevelopmentCatalogDestinationStates
  >
>;
