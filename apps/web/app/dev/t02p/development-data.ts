import { loadHomeCatalogState } from "../../../features/home/load-home-catalog";
import {
  createDevelopmentHomeData,
  createDevelopmentHomeScenario,
  homeScenarioNames,
} from "../../../qa/home/home-scenarios";
import {
  createSmallPopulatedHomeCatalogSource,
  createVisualCatalogItems,
  createVisualHomeCatalogSource,
  homeCatalogScenarioSources,
} from "../../../qa/home-catalog-scenarios";
import { loadDiscoverFeed } from "../../../sources/home/home-sources";
import { createQaCatalogDetails } from "../../../qa/detail-catalog-scenarios";

import type { HomeCatalogSource } from "../../../features/home/load-home-catalog";
import type {
  T02pDevelopmentCatalogDestinationStates,
  T02pDevelopmentCatalogScenarios,
} from "../../../features/product-preview/catalog-scenarios";
import type { DevelopmentHomeScenarios } from "../../../features/qa/home-scenario-contract";
import type { CatalogDetail } from "@moya/contracts";

const loadBrowseStates = async (source?: HomeCatalogSource) => {
  const [inscriptions, calligraphy] = await Promise.all([
    loadHomeCatalogState(
      { kind: "inscription", page: "1", pageSize: "24" },
      source,
    ),
    loadHomeCatalogState(
      { kind: "calligraphy", page: "1", pageSize: "24" },
      source,
    ),
  ]);
  return { calligraphy, inscriptions };
};

export const loadDevelopmentDestinationStates = async (
  mediaOrigin: string,
  source?: HomeCatalogSource,
): Promise<T02pDevelopmentCatalogDestinationStates> => {
  const [discover, browse] = await Promise.all([
    loadDiscoverFeed(source),
    loadBrowseStates(source),
  ]);
  return {
    ...browse,
    home: createDevelopmentHomeData(mediaOrigin, discover),
  };
};

export const loadCleanPreviewStates = (mediaOrigin: string) =>
  loadDevelopmentDestinationStates(mediaOrigin);

export interface T02pQaScenarios {
  readonly catalog: T02pDevelopmentCatalogScenarios;
  readonly detail: readonly CatalogDetail[];
  readonly home: DevelopmentHomeScenarios;
}

export const loadQaScenarios = async (
  mediaOrigin: string,
): Promise<T02pQaScenarios> => {
  const [visual, smallPopulated, empty, unavailable, unexpectedError] =
    await Promise.all([
      loadDevelopmentDestinationStates(
        mediaOrigin,
        createVisualHomeCatalogSource(mediaOrigin),
      ),
      loadDevelopmentDestinationStates(
        mediaOrigin,
        createSmallPopulatedHomeCatalogSource(mediaOrigin),
      ),
      loadDevelopmentDestinationStates(
        mediaOrigin,
        homeCatalogScenarioSources.empty,
      ),
      loadDevelopmentDestinationStates(
        mediaOrigin,
        homeCatalogScenarioSources.unavailable,
      ),
      loadDevelopmentDestinationStates(
        mediaOrigin,
        homeCatalogScenarioSources.unexpectedError,
      ),
    ]);
  const catalog = {
    empty,
    "small-populated": smallPopulated,
    unavailable,
    "unexpected-error": unexpectedError,
    visual,
  } satisfies T02pDevelopmentCatalogScenarios;
  const visualRecords = createVisualCatalogItems(mediaOrigin);
  const home = Object.fromEntries(
    homeScenarioNames.map((scenario) => {
      const configured = createDevelopmentHomeScenario(
        scenario,
        mediaOrigin,
        visualRecords,
      );
      return [scenario, configured];
    }),
  ) as DevelopmentHomeScenarios;

  return { catalog, detail: createQaCatalogDetails(mediaOrigin), home };
};
