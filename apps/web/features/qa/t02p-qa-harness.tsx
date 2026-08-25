"use client";

import { useState } from "react";

import { T02pProductPreview } from "../product-preview/t02p-product-preview";
import { homeScenarioNames } from "./home-scenario-contract";

import type { HomeFeed } from "../home/home-feed";
import type {
  T02pDevelopmentCatalogScenario,
  T02pDevelopmentCatalogScenarios,
} from "../product-preview/catalog-scenarios";
import type { PresentationPlatform } from "../shell/device-platform";
import type {
  DevelopmentHomeScenarios,
  HomeScenarioName,
} from "./home-scenario-contract";

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

export interface T02pQaHarnessProps {
  readonly catalogScenarios: T02pDevelopmentCatalogScenarios;
  readonly homeScenarios: DevelopmentHomeScenarios;
  readonly initialHomeFeed?: HomeFeed;
  readonly initialHomeScenario?: HomeScenarioName;
  readonly initialPlatform: PresentationPlatform;
  readonly initialTopicId?: string | null;
}

export const T02pQaHarness = ({
  catalogScenarios,
  homeScenarios,
  initialHomeFeed,
  initialHomeScenario = "discover-visual",
  initialPlatform,
  initialTopicId,
}: T02pQaHarnessProps) => {
  const [catalogScenario, setCatalogScenario] =
    useState<T02pDevelopmentCatalogScenario>("visual");
  const [homeScenario, setHomeScenario] =
    useState<HomeScenarioName>(initialHomeScenario);
  const [platformMode, setPlatformMode] =
    useState<PresentationPlatformMode>("auto");
  const home = homeScenarios[homeScenario];
  const catalog = catalogScenarios[catalogScenario];
  const states = {
    calligraphy: catalog.calligraphy,
    home: home.data,
    inscriptions: catalog.inscriptions,
  };

  return (
    <main
      data-catalog-scenario={catalogScenario}
      data-home-scenario={homeScenario}
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
      </aside>

      <T02pProductPreview
        key={`${homeScenario}:${catalogScenario}`}
        developmentPlatformOverride={
          platformMode === "auto" ? null : platformMode
        }
        initialHomeFeed={initialHomeFeed ?? home.initialFeed}
        initialPlatform={initialPlatform}
        initialTopicId={initialTopicId ?? home.initialTopicId ?? null}
        showDevelopmentPagerControls
        states={states}
      />
    </main>
  );
};
