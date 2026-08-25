import { notFound } from "next/navigation";

import { T02pQaHarness } from "../../../../features/qa/t02p-qa-harness";
import { readDevelopmentRequestContext } from "../development-context";
import { loadQaScenarios } from "../development-data";

export default async function T02pQaPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const { initialPlatform, mediaOrigin } =
    await readDevelopmentRequestContext();
  const scenarios = await loadQaScenarios(mediaOrigin);

  return (
    <T02pQaHarness initialPlatform={initialPlatform} scenarios={scenarios} />
  );
}
