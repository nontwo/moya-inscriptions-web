"use client";

import { useProductShell } from "../product-shell/product-shell";
import { QaUserInterface } from "./qa-user-interface";
import { createQaUserScenarios } from "./user-scenarios";

import type { CatalogSummary } from "@moya/contracts";
import type { QaUserScenarioName } from "./user-scenarios";

export const QaUserUtility = ({
  catalogItems,
  onOpenChange,
  open,
  scenarioName,
}: {
  readonly catalogItems: readonly CatalogSummary[];
  readonly onOpenChange?: (open: boolean) => void;
  readonly open?: boolean;
  readonly scenarioName: QaUserScenarioName;
}) => {
  const { platform, requestSettings, settingsOpen } = useProductShell();
  const scenario = createQaUserScenarios(catalogItems)[scenarioName];

  return (
    <QaUserInterface
      history={scenario.history}
      initialTab={scenario.initialTab}
      liked={scenario.liked}
      onSettingsIntent={requestSettings}
      platform={platform}
      published={scenario.published}
      saved={scenario.saved}
      settingsOpen={settingsOpen}
      user={scenario.user}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(open === undefined ? {} : { open })}
    />
  );
};
