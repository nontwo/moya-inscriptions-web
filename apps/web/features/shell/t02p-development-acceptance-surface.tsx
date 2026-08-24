"use client";

import { useEffect, useRef, useState } from "react";

import {
  detectDeviceClass,
  resolvePresentationPlatform,
} from "./device-platform";
import { CatalogDetailExperience } from "../detail/catalog-detail-experience";
import { CatalogBrowseScreen } from "../home/catalog-screen";
import { HomeScreen } from "../home/home-screen";
import { PrimaryNavigationPager } from "./primary-navigation-pager";

import type {
  CatalogDetailPresentation,
  CatalogDetailPresentationState,
} from "../detail/catalog-detail-presentation";
import type { CatalogFeedLayout } from "../home/catalog-screen";
import type { HomeCatalogState } from "../home/catalog-state";
import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";

type PresentationPlatformMode = "auto" | PresentationPlatform;
type DetailQuery =
  | { readonly kind: "qa"; readonly key: string }
  | { readonly kind: "invalid"; readonly raw: string }
  | { readonly catalogId: string; readonly kind: "runtime" };

export interface T02pInitialDetail {
  readonly query: DetailQuery;
  readonly state: CatalogDetailPresentationState;
}

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
  readonly detailScenarios: readonly T02pDevelopmentDetailScenario[];
  readonly initialDetail?: T02pInitialDetail | undefined;
  readonly initialImageId?: string | undefined;
  readonly scenarios: T02pDevelopmentCatalogScenarios;
}

export interface T02pDevelopmentDetailScenario {
  readonly catalogId: string;
  readonly detail: CatalogDetailPresentation;
  readonly key: string;
  readonly label: string;
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

const readOrientation = (): "landscape" | "portrait" =>
  window.innerWidth > window.innerHeight ? "landscape" : "portrait";

const urlForDetail = (query: DetailQuery | null, imageId?: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.delete("catalogId");
  url.searchParams.delete("detail");
  url.searchParams.delete("image");
  if (query?.kind === "qa") url.searchParams.set("detail", query.key);
  if (query?.kind === "invalid") url.searchParams.set("detail", query.raw);
  if (query?.kind === "runtime") {
    url.searchParams.set("catalogId", query.catalogId);
  }
  if (query !== null && imageId !== undefined) {
    url.searchParams.set("image", imageId);
  }
  return `${url.pathname}${url.search}${url.hash}`;
};

const detailScenarioByKey = (
  scenarios: readonly T02pDevelopmentDetailScenario[],
  key: string | undefined,
): T02pDevelopmentDetailScenario | undefined =>
  scenarios.find((scenario) => scenario.key === key);

const detailScenarioForCatalogId = (
  scenarios: readonly T02pDevelopmentDetailScenario[],
  catalogId: string,
): T02pDevelopmentDetailScenario | undefined =>
  scenarios.find((scenario) => scenario.catalogId === catalogId);

export const T02pDevelopmentAcceptanceSurface = ({
  detailScenarios,
  initialDetail,
  initialImageId,
  scenarios,
}: T02pDevelopmentAcceptanceSurfaceProps) => {
  const [activeDestination, setActiveDestination] =
    useState<PrimaryDestination>("home");
  const [platformMode, setPlatformMode] =
    useState<PresentationPlatformMode>("auto");
  const [runtimePlatform, setRuntimePlatform] =
    useState<PresentationPlatform>("pc");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "portrait",
  );
  const [catalogScenario, setCatalogScenario] =
    useState<T02pDevelopmentCatalogScenario>("visual");
  const [detailScenarioKey, setDetailScenarioKey] = useState<string>(
    initialDetail?.query.kind === "qa"
      ? initialDetail.query.key
      : (detailScenarios[0]?.key ?? "single-portrait"),
  );
  const [activeDetail, setActiveDetail] = useState<T02pInitialDetail | null>(
    initialDetail ?? null,
  );
  const [activeInitialImageId, setActiveInitialImageId] =
    useState(initialImageId);
  const [feedLayout, setFeedLayout] = useState<CatalogFeedLayout>("double");
  const detailOpenerRef = useRef<HTMLElement | null>(null);
  const pushedDetailHistoryRef = useRef(false);
  const platform = platformMode === "auto" ? runtimePlatform : platformMode;
  const catalogStates = scenarios[catalogScenario];
  const openableCatalogIds = detailScenarios.map(({ catalogId }) => catalogId);

  useEffect(() => {
    const synchronizeViewport = () => {
      setRuntimePlatform(readRuntimePresentationPlatform());
      setOrientation(readOrientation());
    };

    synchronizeViewport();
    window.addEventListener("orientationchange", synchronizeViewport);
    window.addEventListener("resize", synchronizeViewport);

    return () => {
      window.removeEventListener("orientationchange", synchronizeViewport);
      window.removeEventListener("resize", synchronizeViewport);
    };
  }, []);

  useEffect(() => {
    const backgrounds = document.querySelectorAll<HTMLElement>(
      "[data-primary-shell], [data-t02p-qa-controls]",
    );
    for (const background of backgrounds) {
      background.inert = activeDetail !== null;
      if (activeDetail === null) background.removeAttribute("aria-hidden");
      else background.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const background of backgrounds) {
        background.inert = false;
        background.removeAttribute("aria-hidden");
      }
    };
  }, [activeDetail]);

  useEffect(() => {
    const restoreFromUrl = () => {
      const params = new URL(window.location.href).searchParams;
      const qaScenario = detailScenarioByKey(
        detailScenarios,
        params.get("detail") ?? undefined,
      );
      if (qaScenario !== undefined) {
        setDetailScenarioKey(qaScenario.key);
        setActiveInitialImageId(params.get("image") ?? undefined);
        setActiveDetail({
          query: { key: qaScenario.key, kind: "qa" },
          state: { detail: qaScenario.detail, state: "loaded" },
        });
        return;
      }
      if (initialDetail?.query.kind === "runtime") {
        const catalogId = params.get("catalogId");
        if (catalogId === initialDetail.query.catalogId) {
          setActiveInitialImageId(params.get("image") ?? undefined);
          setActiveDetail(initialDetail);
          return;
        }
      }
      setActiveInitialImageId(undefined);
      setActiveDetail(null);
      pushedDetailHistoryRef.current = false;
      requestAnimationFrame(() => detailOpenerRef.current?.focus());
    };

    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, [detailScenarios, initialDetail]);

  const openQaDetail = (
    scenario: T02pDevelopmentDetailScenario,
    opener: HTMLElement | null = null,
  ) => {
    const query = { key: scenario.key, kind: "qa" } as const;
    setDetailScenarioKey(scenario.key);
    setActiveInitialImageId(undefined);
    setActiveDetail({
      query,
      state: { detail: scenario.detail, state: "loaded" },
    });
    detailOpenerRef.current = opener;
    pushedDetailHistoryRef.current = true;
    window.history.pushState(null, "", urlForDetail(query));
  };

  const openCatalog = (catalogId: string, opener: HTMLElement) => {
    const scenario = detailScenarioForCatalogId(detailScenarios, catalogId);
    if (scenario !== undefined) openQaDetail(scenario, opener);
  };

  const closeDetail = () => {
    if (pushedDetailHistoryRef.current) {
      pushedDetailHistoryRef.current = false;
      window.history.back();
      return;
    }
    setActiveDetail(null);
    setActiveInitialImageId(undefined);
    window.history.replaceState(null, "", urlForDetail(null));
    requestAnimationFrame(() => detailOpenerRef.current?.focus());
  };

  const changeDestination = (destination: PrimaryDestination) => {
    if (activeDetail !== null) {
      pushedDetailHistoryRef.current = false;
      setActiveDetail(null);
      setActiveInitialImageId(undefined);
      window.history.replaceState(null, "", urlForDetail(null));
    }
    setActiveDestination(destination);
  };

  return (
    <main
      data-t02p-development-acceptance=""
      data-active-destination={activeDestination}
      data-catalog-scenario={catalogScenario}
      data-detail-open={activeDetail === null ? "false" : "true"}
      data-detail-qa-scenario={
        activeDetail?.query.kind === "qa" ? activeDetail.query.key : undefined
      }
      data-feed-layout={feedLayout}
      data-platform={platform}
    >
      <div data-t02p-qa-controls="">
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

        <label htmlFor="t02p-qa-detail-scenario">QA Detail scenario</label>
        <select
          id="t02p-qa-detail-scenario"
          data-qa-detail-scenario-selector=""
          value={detailScenarioKey}
          onChange={(event) => {
            const scenario = detailScenarioByKey(
              detailScenarios,
              event.currentTarget.value,
            );
            if (scenario !== undefined) setDetailScenarioKey(scenario.key);
          }}
        >
          {detailScenarios.map((scenario) => (
            <option key={scenario.key} value={scenario.key}>
              {scenario.label}
            </option>
          ))}
        </select>
        <button
          data-open-selected-detail=""
          onClick={() => {
            const scenario = detailScenarioByKey(
              detailScenarios,
              detailScenarioKey,
            );
            if (scenario !== undefined) openQaDetail(scenario);
          }}
          type="button"
        >
          Open Detail scenario
        </button>

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
      </div>

      <PrimaryNavigationPager
        activeDestination={activeDestination}
        platform={platform}
        onDestinationChange={changeDestination}
        home={
          <div data-qa-panel="home">
            <HomeScreen
              feedLayout={feedLayout}
              onOpenCatalog={openCatalog}
              openableCatalogIds={openableCatalogIds}
              state={catalogStates.home}
            />
          </div>
        }
        inscriptions={
          <div data-qa-panel="inscriptions">
            <CatalogBrowseScreen
              feedLayout={feedLayout}
              kind="inscription"
              onOpenCatalog={openCatalog}
              openableCatalogIds={openableCatalogIds}
              state={catalogStates.inscriptions}
            />
          </div>
        }
        calligraphy={
          <div data-qa-panel="calligraphy">
            <CatalogBrowseScreen
              feedLayout={feedLayout}
              kind="calligraphy"
              onOpenCatalog={openCatalog}
              openableCatalogIds={openableCatalogIds}
              state={catalogStates.calligraphy}
            />
          </div>
        }
      />

      {activeDetail === null ? null : (
        <CatalogDetailExperience
          initialImageId={activeInitialImageId}
          onBack={closeDetail}
          onRetry={() => window.location.reload()}
          onViewerStateChange={(imageId) => {
            window.history.replaceState(
              null,
              "",
              urlForDetail(activeDetail.query, imageId ?? undefined),
            );
          }}
          orientation={orientation}
          platform={platform}
          state={activeDetail.state}
        />
      )}
    </main>
  );
};
