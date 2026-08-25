import { loadHomeCatalogState } from "../../../features/home/load-home-catalog";
import {
  createSmallPopulatedHomeCatalogSource,
  createVisualHomeCatalogSource,
  homeCatalogScenarioSources,
} from "../../../qa/home-catalog-scenarios";

import type { HomeCatalogSource } from "../../../features/home/load-home-catalog";
import type {
  T02pDevelopmentCatalogDestinationStates,
  T02pDevelopmentCatalogScenarios,
} from "../../../features/product-preview/catalog-scenarios";

export const loadDevelopmentDestinationStates = async (
  source: HomeCatalogSource,
): Promise<T02pDevelopmentCatalogDestinationStates> => {
  const [home, inscriptions, calligraphy] = await Promise.all([
    loadHomeCatalogState({ page: "1", pageSize: "24" }, source),
    loadHomeCatalogState(
      { kind: "inscription", page: "1", pageSize: "24" },
      source,
    ),
    loadHomeCatalogState(
      { kind: "calligraphy", page: "1", pageSize: "24" },
      source,
    ),
  ]);

  return { calligraphy, home, inscriptions };
};

export const loadCleanPreviewStates = (mediaOrigin: string) =>
  loadDevelopmentDestinationStates(createVisualHomeCatalogSource(mediaOrigin));

export const loadQaScenarios = async (
  mediaOrigin: string,
): Promise<T02pDevelopmentCatalogScenarios> => {
  const [visual, smallPopulated, empty, unavailable, unexpectedError] =
    await Promise.all([
      loadDevelopmentDestinationStates(
        createVisualHomeCatalogSource(mediaOrigin),
      ),
      loadDevelopmentDestinationStates(
        createSmallPopulatedHomeCatalogSource(mediaOrigin),
      ),
      loadDevelopmentDestinationStates(homeCatalogScenarioSources.empty),
      loadDevelopmentDestinationStates(homeCatalogScenarioSources.unavailable),
      loadDevelopmentDestinationStates(
        homeCatalogScenarioSources.unexpectedError,
      ),
    ]);

  return {
    empty,
    "small-populated": smallPopulated,
    unavailable,
    "unexpected-error": unexpectedError,
    visual,
  };
};
