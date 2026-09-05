"use client";

import { useCallback, useState } from "react";

import { T02pProductPreview } from "../product-preview/t02p-product-preview";
import { homeScenarioNames } from "./home-scenario-contract";
import { loadCatalogDetailPresentation } from "../detail/load-catalog-detail";
import { QaProductUtilities } from "./inscription-filter-presentation";
import { QaUserUtility } from "./qa-user-utility";
import {
  defaultQaUserScenarioName,
  qaUserScenarioLabels,
  qaUserScenarioNames,
} from "./user-scenarios";
import { qaSearchScenarioNames, qaSearchScenarios } from "./search-scenarios";
import { useMockContentActionStore } from "./mock-content-action-store";

import type { HomeFeed } from "../home/home-feed";
import type { CatalogDetail } from "@moya/contracts";
import type {
  T02pDevelopmentCatalogScenario,
  T02pDevelopmentCatalogScenarios,
} from "../product-preview/catalog-scenarios";
import type { PresentationPlatform } from "../shell/device-platform";
import type {
  DevelopmentHomeScenarios,
  HomeScenarioName,
} from "./home-scenario-contract";
import type { QaSearchScenarioName } from "./search-scenarios";
import type { QaUserScenarioName } from "./user-scenarios";

type PresentationPlatformMode = "auto" | PresentationPlatform;

const catalogScenarioOptions = [
  ["visual", "Visual"],
  ["small-populated", "Small populated"],
  ["empty", "Empty"],
  ["unavailable", "Unavailable"],
  ["unexpected-error", "Unexpected error"],
] as const satisfies readonly (readonly [
  T02pDevelopmentCatalogScenario,
  string,
])[];

const homeScenarioLabels = {
  "discover-empty": "Discover empty",
  "discover-visual": "Discover visual",
  "nearby-demo": "Nearby demo",
  "nearby-unavailable": "Nearby unavailable",
  "topic-long-blocks": "Topic long blocks",
  "topics-catalog-collection": "Topics catalog collection",
  "topics-editorial": "Topics editorial",
  "topics-empty": "Topics empty",
} as const satisfies Record<HomeScenarioName, string>;

const platformOptions = [
  ["auto", "Auto"],
  ["phone", "Phone"],
  ["tablet", "Tablet"],
  ["pc", "PC"],
] as const satisfies readonly (readonly [PresentationPlatformMode, string])[];

const searchScenarioLabels = {
  "search-default": "Search default",
  "search-open": "Search open",
  "search-typing": "Search typing",
  "search-empty": "Search empty",
} as const satisfies Record<QaSearchScenarioName, string>;

export interface T02pQaHarnessProps {
  readonly catalogScenarios: T02pDevelopmentCatalogScenarios;
  readonly homeScenarios: DevelopmentHomeScenarios;
  readonly initialHomeFeed?: HomeFeed;
  readonly initialHomeScenario?: HomeScenarioName;
  readonly initialPlatform: PresentationPlatform;
  readonly initialPlatformMode?: PresentationPlatformMode;
  readonly initialTopicId?: string | null;
  readonly detailRecords: readonly CatalogDetail[];
}

export const T02pQaHarness = ({
  catalogScenarios,
  detailRecords,
  homeScenarios,
  initialHomeFeed,
  initialHomeScenario = "discover-visual",
  initialPlatform,
  initialPlatformMode = "auto",
  initialTopicId,
}: T02pQaHarnessProps) => {
  const [catalogScenario, setCatalogScenario] =
    useState<T02pDevelopmentCatalogScenario>("visual");
  const [homeScenario, setHomeScenario] =
    useState<HomeScenarioName>(initialHomeScenario);
  const [platformMode, setPlatformMode] =
    useState<PresentationPlatformMode>(initialPlatformMode);
  const [searchScenario, setSearchScenario] =
    useState<QaSearchScenarioName>("search-default");
  const [userScenario, setUserScenario] = useState<QaUserScenarioName>(
    defaultQaUserScenarioName,
  );
  const quickActionStore = useMockContentActionStore();
  const home = homeScenarios[homeScenario];
  const catalog = catalogScenarios[catalogScenario];
  const search = qaSearchScenarios[searchScenario];
  const visualCatalogItems = [
    ...(catalogScenarios.visual.inscriptions.state === "populated"
      ? catalogScenarios.visual.inscriptions.page.items
      : []),
    ...(catalogScenarios.visual.calligraphy.categories.all.state === "populated"
      ? catalogScenarios.visual.calligraphy.categories.all.page.items
      : []),
  ];
  const states = {
    calligraphy: catalog.calligraphy,
    home: home.data,
    inscriptions: catalog.inscriptions,
  };
  const loadQaDetail = useCallback(
    (catalogId: string, signal?: AbortSignal) =>
      loadCatalogDetailPresentation(
        catalogId,
        signal,
        async (requestedId, requestSignal) => {
          if (requestSignal?.aborted === true) {
            throw new DOMException("Aborted", "AbortError");
          }
          const detail = detailRecords.find(({ id }) => id === requestedId);
          return detail === undefined
            ? { state: "not-found" as const }
            : { detail, state: "success" as const };
        },
        "qa",
      ),
    [detailRecords],
  );

  return (
    <main
      data-catalog-scenario={catalogScenario}
      data-home-scenario={homeScenario}
      data-search-scenario={searchScenario}
      data-t02p-qa-harness=""
    >
      <aside aria-label="T02P QA controls" data-qa-controls="">
        <h1>T02P QA Harness</h1>
        <label htmlFor="t02p-qa-platform">QA presentation platform</label>
        <select
          id="t02p-qa-platform"
          data-qa-platform-selector=""
          value={platformMode}
          onChange={(event) => {
            const next = platformOptions.find(
              ([candidate]) => candidate === event.currentTarget.value,
            )?.[0];
            if (next !== undefined) setPlatformMode(next);
          }}
        >
          {platformOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <label htmlFor="t02p-qa-search-scenario">QA Search scenario</label>
        <select
          id="t02p-qa-search-scenario"
          data-qa-search-scenario-selector=""
          value={searchScenario}
          onChange={(event) => {
            const next = qaSearchScenarioNames.find(
              (candidate) => candidate === event.currentTarget.value,
            );
            if (next !== undefined) setSearchScenario(next);
          }}
        >
          {qaSearchScenarioNames.map((value) => (
            <option key={value} value={value}>
              {searchScenarioLabels[value]}
            </option>
          ))}
        </select>

        <label htmlFor="t02p-qa-home-scenario">QA Home scenario</label>
        <select
          id="t02p-qa-home-scenario"
          data-qa-home-scenario-selector=""
          value={homeScenario}
          onChange={(event) => {
            const next = homeScenarioNames.find(
              (candidate) => candidate === event.currentTarget.value,
            );
            if (next !== undefined) setHomeScenario(next);
          }}
        >
          {homeScenarioNames.map((value) => (
            <option key={value} value={value}>
              {homeScenarioLabels[value]}
            </option>
          ))}
        </select>

        <label htmlFor="t02p-qa-user-scenario">QA User scenario</label>
        <select
          id="t02p-qa-user-scenario"
          data-qa-user-scenario-selector=""
          value={userScenario}
          onChange={(event) => {
            const next = qaUserScenarioNames.find(
              (candidate) => candidate === event.currentTarget.value,
            );
            if (next !== undefined) setUserScenario(next);
          }}
        >
          {qaUserScenarioNames.map((value) => (
            <option key={value} value={value}>
              {qaUserScenarioLabels[value]}
            </option>
          ))}
        </select>

        <label htmlFor="t02p-qa-catalog-scenario">QA Catalog scenario</label>
        <select
          id="t02p-qa-catalog-scenario"
          data-qa-catalog-scenario-selector=""
          value={catalogScenario}
          onChange={(event) => {
            const next = catalogScenarioOptions.find(
              ([candidate]) => candidate === event.currentTarget.value,
            )?.[0];
            if (next !== undefined) setCatalogScenario(next);
          }}
        >
          {catalogScenarioOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <section aria-label="Quick action QA log" data-quick-action-qa-log="">
          <strong>Quick action log</strong>
          {quickActionStore.state.qaLog.length === 0 ? (
            <span data-quick-action-qa-empty="">No interactions</span>
          ) : (
            <ol>
              {quickActionStore.state.qaLog.map((entry, index) => (
                <li key={`${entry}:${index}`}>{entry}</li>
              ))}
            </ol>
          )}
        </section>
      </aside>

      <T02pProductPreview
        catalogDetailLoader={loadQaDetail}
        key={`${homeScenario}:${catalogScenario}`}
        developmentPlatformOverride={
          platformMode === "auto" ? null : platformMode
        }
        initialHomeFeed={initialHomeFeed ?? home.initialFeed}
        initialPlatform={initialPlatform}
        initialTopicId={initialTopicId ?? home.initialTopicId ?? null}
        productUtility={
          <>
            <QaProductUtilities
              initialKeyword={search.initialKeyword}
              initialSearchOpen={search.initialOpen}
              key={searchScenario}
              showEmptyState={search.showEmptyState}
            />
            <QaUserUtility
              catalogItems={visualCatalogItems}
              favoriteItems={quickActionStore.state.favoriteItems}
              key={userScenario}
              likedItems={quickActionStore.state.likedItems}
              scenarioName={userScenario}
            />
          </>
        }
        quickActions={quickActionStore.environment}
        showDevelopmentPagerControls
        showSettingsEntry={false}
        states={states}
      />
    </main>
  );
};
