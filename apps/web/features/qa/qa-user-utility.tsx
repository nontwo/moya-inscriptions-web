"use client";

import { useProductShell } from "../product-shell/product-shell";
import { QaUserInterface } from "./qa-user-interface";
import { createQaUserScenarios, toQaUserContentItem } from "./user-scenarios";

import type { CatalogSummary } from "@moya/contracts";
import type { QaUserContentItem } from "./qa-user-interface";
import type { QaUserScenarioName } from "./user-scenarios";

const mergeSelectedItems = (
  selectedItems: readonly CatalogSummary[],
  scenarioItems: readonly QaUserContentItem[],
) => {
  const selected = selectedItems.map((item) => toQaUserContentItem(item));
  const selectedIds = new Set(selected.map(({ id }) => id));
  return [
    ...selected,
    ...scenarioItems.filter(({ id }) => !selectedIds.has(id)),
  ];
};

export const QaUserUtility = ({
  catalogItems,
  favoriteItems = [],
  likedItems = [],
  onOpenChange,
  open,
  scenarioName,
}: {
  readonly catalogItems: readonly CatalogSummary[];
  readonly favoriteItems?: readonly CatalogSummary[];
  readonly likedItems?: readonly CatalogSummary[];
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
      liked={mergeSelectedItems(likedItems, scenario.liked)}
      onSettingsIntent={requestSettings}
      platform={platform}
      published={scenario.published}
      saved={mergeSelectedItems(favoriteItems, scenario.saved)}
      settingsOpen={settingsOpen}
      user={scenario.user}
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(open === undefined ? {} : { open })}
    />
  );
};
