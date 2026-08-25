"use client";

import { useState } from "react";

import { T02pProductPreview } from "../product-preview/t02p-product-preview";

import type {
  T02pDevelopmentCatalogScenario,
  T02pDevelopmentCatalogScenarios,
} from "../product-preview/catalog-scenarios";
import type { PresentationPlatform } from "../shell/device-platform";

type PresentationPlatformMode = "auto" | PresentationPlatform;

const scenarioOptions = [
  ["visual", "Visual"],
  ["small-populated", "Small populated"],
  ["empty", "Empty"],
  ["unavailable", "Unavailable"],
  ["unexpected-error", "Unexpected error"],
] as const satisfies readonly (readonly [
  T02pDevelopmentCatalogScenario,
  string,
])[];

const platformOptions = [
  ["auto", "Auto"],
  ["phone", "Phone"],
  ["tablet", "Tablet"],
  ["pc", "PC"],
] as const satisfies readonly (readonly [PresentationPlatformMode, string])[];

export interface T02pQaHarnessProps {
  readonly initialPlatform: PresentationPlatform;
  readonly scenarios: T02pDevelopmentCatalogScenarios;
}

export const T02pQaHarness = ({
  initialPlatform,
  scenarios,
}: T02pQaHarnessProps) => {
  const [scenario, setScenario] =
    useState<T02pDevelopmentCatalogScenario>("visual");
  const [platformMode, setPlatformMode] =
    useState<PresentationPlatformMode>("auto");

  return (
    <main data-catalog-scenario={scenario} data-t02p-qa-harness="">
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

        <label htmlFor="t02p-qa-catalog-scenario">QA Catalog scenario</label>
        <select
          id="t02p-qa-catalog-scenario"
          data-qa-catalog-scenario-selector=""
          value={scenario}
          onChange={(event) => {
            const next = scenarioOptions.find(
              ([candidate]) => candidate === event.currentTarget.value,
            )?.[0];
            if (next !== undefined) setScenario(next);
          }}
        >
          {scenarioOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </aside>

      <T02pProductPreview
        developmentPlatformOverride={
          platformMode === "auto" ? null : platformMode
        }
        initialPlatform={initialPlatform}
        showDevelopmentPagerControls
        states={scenarios[scenario]}
      />
    </main>
  );
};
