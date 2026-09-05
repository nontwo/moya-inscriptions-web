import { notFound } from "next/navigation";

import { T02pQaHarness } from "../../../../features/qa/t02p-qa-harness";
import { homeScenarioNames } from "../../../../features/qa/home-scenario-contract";
import { parseHomeFeed } from "../../../../features/home/home-feed";
import { readDevelopmentRequestContext } from "../development-context";
import { loadQaScenarios } from "../development-data";

export default async function T02pQaPage({
  searchParams,
}: {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const { initialPlatform, mediaOrigin } =
    await readDevelopmentRequestContext();
  const scenarios = await loadQaScenarios(mediaOrigin);
  const query = (await searchParams) ?? {};
  const initialHomeScenario =
    typeof query.scenario === "string" &&
    homeScenarioNames.includes(
      query.scenario as (typeof homeScenarioNames)[number],
    )
      ? (query.scenario as (typeof homeScenarioNames)[number])
      : "discover-visual";
  const initialHomeFeed =
    typeof query.feed === "string" ? parseHomeFeed(query.feed) : undefined;
  const initialTopicId =
    typeof query.topic === "string" && query.topic.length <= 160
      ? query.topic
      : null;
  const initialPlatformMode =
    query.platform === "phone" ||
    query.platform === "tablet" ||
    query.platform === "pc"
      ? query.platform
      : "auto";

  return (
    <T02pQaHarness
      catalogScenarios={scenarios.catalog}
      detailRecords={scenarios.detail}
      homeScenarios={scenarios.home}
      {...(initialHomeFeed === undefined ? {} : { initialHomeFeed })}
      initialHomeScenario={initialHomeScenario}
      initialPlatform={initialPlatform}
      initialPlatformMode={initialPlatformMode}
      initialTopicId={initialTopicId}
    />
  );
}
