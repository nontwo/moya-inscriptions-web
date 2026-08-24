import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { T02pDevelopmentAcceptanceSurface } from "../../../features/shell/t02p-development-acceptance-surface";
import { loadHomeCatalogState } from "../../../features/home/load-home-catalog";
import {
  createVisualHomeCatalogSource,
  homeCatalogScenarioSources,
} from "../../../qa/home-catalog-scenarios";

import type { HomeCatalogSource } from "../../../features/home/load-home-catalog";
import type {
  T02pDevelopmentCatalogDestinationStates,
  T02pDevelopmentCatalogScenarios,
} from "../../../features/shell/t02p-development-acceptance-surface";

const readSingleHeaderValue = (value: string | null, name: string): string => {
  if (value === null) throw new TypeError(`Missing ${name} header`);
  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (values.length !== 1) throw new TypeError(`Invalid ${name} header`);
  return values[0]!;
};

const readDevelopmentRequestOrigin = async (): Promise<string> => {
  const requestHeaders = await headers();
  const host = readSingleHeaderValue(requestHeaders.get("host"), "Host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol === null
      ? "http"
      : readSingleHeaderValue(forwardedProtocol, "X-Forwarded-Proto");
  if (protocol !== "http" && protocol !== "https") {
    throw new TypeError("Invalid X-Forwarded-Proto header");
  }

  const origin = new URL(`${protocol}://${host}`);
  if (origin.host !== host || origin.pathname !== "/") {
    throw new TypeError("Invalid Host header");
  }

  return origin.origin;
};

const loadDestinationStates = async (
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

export default async function T02pDevelopmentPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const mediaOrigin = await readDevelopmentRequestOrigin();
  const visualSource = createVisualHomeCatalogSource(mediaOrigin);
  const [visual, smallPopulated, empty, unavailable, unexpectedError] =
    await Promise.all([
      loadDestinationStates(visualSource),
      loadDestinationStates(homeCatalogScenarioSources.populated),
      loadDestinationStates(homeCatalogScenarioSources.empty),
      loadDestinationStates(homeCatalogScenarioSources.unavailable),
      loadDestinationStates(homeCatalogScenarioSources.unexpectedError),
    ]);
  const scenarios = {
    empty,
    "small-populated": smallPopulated,
    unavailable,
    "unexpected-error": unexpectedError,
    visual,
  } satisfies T02pDevelopmentCatalogScenarios;

  return <T02pDevelopmentAcceptanceSurface scenarios={scenarios} />;
}
