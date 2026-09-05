"use client";

import { useProductShell } from "../product-shell/product-shell";
import { QaUserInterface } from "./qa-user-interface";
import { createQaUserScenarios, toQaUserContentItem } from "./user-scenarios";

import type { CatalogSummary } from "@moya/contracts";
import type { QaUserScenarioName } from "./user-scenarios";

export const QaUserUtility = ({
  catalogItems,
  favoriteItems = [],
  likedItems = [],
  scenarioName,
}: {
  readonly catalogItems: readonly CatalogSummary[];
  readonly favoriteItems?: readonly CatalogSummary[];
  readonly likedItems?: readonly CatalogSummary[];
  readonly scenarioName: QaUserScenarioName;
}) => {
  const { requestSettings } = useProductShell();
  const scenario = createQaUserScenarios(catalogItems)[scenarioName];

  return (
    <QaUserInterface
      history={scenario.history}
      initialTab={scenario.initialTab}
      liked={[
        ...likedItems.map((item) => toQaUserContentItem(item)),
        ...scenario.liked,
      ]}
      onSettingsIntent={requestSettings}
      published={scenario.published}
      saved={[
        ...favoriteItems.map((item) => toQaUserContentItem(item)),
        ...scenario.saved,
      ]}
      user={scenario.user}
    />
  );
};
