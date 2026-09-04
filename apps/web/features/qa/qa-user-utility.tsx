"use client";

import { useProductShell } from "../product-shell/product-shell";
import { QaUserInterface } from "./qa-user-interface";
import { createQaUserScenarios } from "./user-scenarios";

import type { CatalogSummary } from "@moya/contracts";
import type { QaUserScenarioName } from "./user-scenarios";

export const QaUserUtility = ({
  catalogItems,
  scenarioName,
}: {
  readonly catalogItems: readonly CatalogSummary[];
  readonly scenarioName: QaUserScenarioName;
}) => {
  const { requestSettings } = useProductShell();
  const scenario = createQaUserScenarios(catalogItems)[scenarioName];

  return (
    <QaUserInterface
      history={scenario.history}
      initialTab={scenario.initialTab}
      liked={scenario.liked}
      onSettingsIntent={requestSettings}
      published={scenario.published}
      saved={scenario.saved}
      user={scenario.user}
    />
  );
};
