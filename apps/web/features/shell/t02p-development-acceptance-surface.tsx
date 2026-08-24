"use client";

import { useEffect, useState } from "react";

import {
  detectDeviceClass,
  resolvePresentationPlatform,
} from "./device-platform";
import { CatalogBrowseScreen } from "../home/catalog-screen";
import { HomeScreen } from "../home/home-screen";
import { PrimaryNavigationPager } from "./primary-navigation-pager";

import type { CatalogFeedLayout } from "../home/catalog-screen";
import type { HomeCatalogState } from "../home/catalog-state";
import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";

type PresentationPlatformMode = "auto" | PresentationPlatform;

const presentationPlatformLabels = {
  pc: "PC",
  phone: "Phone",
  tablet: "Tablet",
} as const satisfies Record<PresentationPlatform, string>;

const presentationPlatformModes = [
  ["auto", "Auto"],
  ["phone", presentationPlatformLabels.phone],
  ["tablet", presentationPlatformLabels.tablet],
  ["pc", presentationPlatformLabels.pc],
] as const satisfies readonly (readonly [PresentationPlatformMode, string])[];

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

export interface T02pDevelopmentAcceptanceSurfaceProps {
  readonly scenarios: T02pDevelopmentCatalogScenarios;
}

const catalogScenarios = [
  ["visual", "Visual"],
  ["small-populated", "Small populated"],
  ["empty", "Empty"],
  ["unavailable", "Unavailable"],
  ["unexpected-error", "Unexpected error"],
] as const satisfies readonly (readonly [
  T02pDevelopmentCatalogScenario,
  string,
])[];

const feedLayouts = [
  ["single", "Single"],
  ["double", "Double"],
] as const satisfies readonly (readonly [CatalogFeedLayout, string])[];

type NavigatorWithUserAgentData = Navigator & {
  readonly userAgentData?: { readonly mobile?: boolean | null } | null;
};

const readRuntimePresentationPlatform = (): PresentationPlatform => {
  const runtimeNavigator = navigator as NavigatorWithUserAgentData;
  const userAgentData = runtimeNavigator.userAgentData;
  const deviceClass = detectDeviceClass({
    maxTouchPoints: runtimeNavigator.maxTouchPoints,
    userAgent: runtimeNavigator.userAgent,
    ...(userAgentData === undefined ? {} : { userAgentData }),
  });

  return resolvePresentationPlatform(deviceClass, window.innerWidth);
};

export const T02pDevelopmentAcceptanceSurface = ({
  scenarios,
}: T02pDevelopmentAcceptanceSurfaceProps) => {
  const [activeDestination, setActiveDestination] =
    useState<PrimaryDestination>("home");
  const [platformMode, setPlatformMode] =
    useState<PresentationPlatformMode>("auto");
  const [runtimePlatform, setRuntimePlatform] =
    useState<PresentationPlatform>("pc");
  const [catalogScenario, setCatalogScenario] =
    useState<T02pDevelopmentCatalogScenario>("visual");
  const [feedLayout, setFeedLayout] = useState<CatalogFeedLayout>("double");
  const platform = platformMode === "auto" ? runtimePlatform : platformMode;
  const catalogStates = scenarios[catalogScenario];

  useEffect(() => {
    const synchronizeRuntimePlatform = () => {
      setRuntimePlatform(readRuntimePresentationPlatform());
    };

    synchronizeRuntimePlatform();
    window.addEventListener("orientationchange", synchronizeRuntimePlatform);
    window.addEventListener("resize", synchronizeRuntimePlatform);

    return () => {
      window.removeEventListener(
        "orientationchange",
        synchronizeRuntimePlatform,
      );
      window.removeEventListener("resize", synchronizeRuntimePlatform);
    };
  }, []);

  return (
    <main
      data-t02p-development-acceptance=""
      data-active-destination={activeDestination}
      data-catalog-scenario={catalogScenario}
      data-feed-layout={feedLayout}
      data-platform={platform}
    >
      <h1>T02P Development acceptance</h1>
      <p>QA-only structural shell acceptance surface.</p>

      <label htmlFor="t02p-qa-platform">QA presentation platform</label>
      <select
        id="t02p-qa-platform"
        data-qa-platform-selector=""
        value={platformMode}
        onChange={(event) => {
          const nextMode = presentationPlatformModes.find(
            ([candidate]) => candidate === event.currentTarget.value,
          )?.[0];

          if (nextMode !== undefined) {
            if (nextMode === "auto") {
              setRuntimePlatform(readRuntimePresentationPlatform());
            }
            setPlatformMode(nextMode);
          }
        }}
      >
        {presentationPlatformModes.map(([candidate, label]) => (
          <option key={candidate} value={candidate}>
            {label}
          </option>
        ))}
      </select>

      <p>
        Effective presentation platform:{" "}
        <output aria-live="polite" data-qa-effective-platform="">
          {presentationPlatformLabels[platform]}
        </output>
      </p>

      <label htmlFor="t02p-qa-catalog-scenario">QA Catalog scenario</label>
      <select
        id="t02p-qa-catalog-scenario"
        data-qa-catalog-scenario-selector=""
        value={catalogScenario}
        onChange={(event) => {
          const nextScenario = catalogScenarios.find(
            ([candidate]) => candidate === event.currentTarget.value,
          )?.[0];

          if (nextScenario !== undefined) {
            setCatalogScenario(nextScenario);
          }
        }}
      >
        {catalogScenarios.map(([candidate, label]) => (
          <option key={candidate} value={candidate}>
            {label}
          </option>
        ))}
      </select>

      <label htmlFor="t02p-qa-feed-layout">QA phone/tablet feed layout</label>
      <select
        id="t02p-qa-feed-layout"
        data-qa-feed-layout-selector=""
        disabled={platform === "pc"}
        value={feedLayout}
        onChange={(event) => {
          const nextLayout = feedLayouts.find(
            ([candidate]) => candidate === event.currentTarget.value,
          )?.[0];

          if (nextLayout !== undefined) {
            setFeedLayout(nextLayout);
          }
        }}
      >
        {feedLayouts.map(([candidate, label]) => (
          <option key={candidate} value={candidate}>
            {label}
          </option>
        ))}
      </select>
      {platform === "pc" ? (
        <p data-qa-feed-layout-note="">PC uses responsive multi-column.</p>
      ) : null}

      <PrimaryNavigationPager
        activeDestination={activeDestination}
        platform={platform}
        onDestinationChange={setActiveDestination}
        home={
          <div data-qa-panel="home">
            <HomeScreen feedLayout={feedLayout} state={catalogStates.home} />
          </div>
        }
        inscriptions={
          <div data-qa-panel="inscriptions">
            <CatalogBrowseScreen
              feedLayout={feedLayout}
              kind="inscription"
              state={catalogStates.inscriptions}
            />
          </div>
        }
        calligraphy={
          <div data-qa-panel="calligraphy">
            <CatalogBrowseScreen
              feedLayout={feedLayout}
              kind="calligraphy"
              state={catalogStates.calligraphy}
            />
          </div>
        }
      />
    </main>
  );
};
