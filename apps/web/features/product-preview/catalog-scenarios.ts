import type { HomeCatalogState } from "../home/catalog-state";

export type T02pDevelopmentCatalogScenario =
  "visual" | "small-populated" | "empty" | "unavailable" | "unexpected-error";

export interface T02pDevelopmentCatalogDestinationStates {
  readonly calligraphy: HomeCatalogState;
  readonly home: HomeCatalogState;
  readonly inscriptions: HomeCatalogState;
}

export type T02pDevelopmentCatalogScenarios = Readonly<
  Record<
    T02pDevelopmentCatalogScenario,
    T02pDevelopmentCatalogDestinationStates
  >
>;
