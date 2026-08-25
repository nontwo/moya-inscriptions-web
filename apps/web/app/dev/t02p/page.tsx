import { notFound } from "next/navigation";

import { T02pProductPreview } from "../../../features/product-preview/t02p-product-preview";
import { parseHomeFeed } from "../../../features/home/home-feed";
import { readDevelopmentRequestContext } from "./development-context";
import { loadCleanPreviewStates } from "./development-data";

export default async function T02pDevelopmentPage({
  searchParams,
}: {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
} = {}) {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const { initialPlatform, mediaOrigin } =
    await readDevelopmentRequestContext();
  const states = await loadCleanPreviewStates(mediaOrigin);
  const query = (await searchParams) ?? {};
  const initialHomeFeed = parseHomeFeed(query.feed);
  const initialTopicId =
    typeof query.topic === "string" && query.topic.length <= 160
      ? query.topic
      : null;

  return (
    <T02pProductPreview
      initialHomeFeed={initialTopicId === null ? initialHomeFeed : "topics"}
      initialPlatform={initialPlatform}
      initialTopicId={initialTopicId}
      states={states}
    />
  );
}
