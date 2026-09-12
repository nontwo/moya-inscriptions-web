import { notFound } from "next/navigation";

import { parseHomeFeed } from "../../../features/home/home-feed";
import { developmentSignInPath } from "../../../features/product-application/community-comment-surface";
import { ProductApplication } from "../../../features/product-application/product-application";
import { readDevelopmentRequestContext } from "./development-context";
import { loadCleanPreviewStates } from "./development-data";

export default async function T02pDevelopmentPage({
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
  const states = await loadCleanPreviewStates(mediaOrigin);
  const query = (await searchParams) ?? {};
  const initialHomeFeed = parseHomeFeed(query.feed);
  const initialTopicId =
    typeof query.topic === "string" && query.topic.length <= 160
      ? query.topic
      : null;

  // Development only (guarded above): the real comment client is composed
  // with the Development sign-in entry, as on the Formal root in Development.
  return (
    <ProductApplication
      comments={{ signInHref: developmentSignInPath }}
      initialHomeFeed={initialTopicId === null ? initialHomeFeed : "topics"}
      initialPlatform={initialPlatform}
      initialTopicId={initialTopicId}
      states={states}
    />
  );
}
