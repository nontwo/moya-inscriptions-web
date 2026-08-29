import { parseHomeFeed } from "../features/home/home-feed";
import { loadProductionProductStates } from "../features/product-application/load-production-product-states";
import { T02pProductPreview } from "../features/product-preview/t02p-product-preview";
import { readFormalRequestContext } from "./formal-request-context";

export default async function FormalPage({
  searchParams,
}: {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const [{ initialPlatform }, states] = await Promise.all([
    readFormalRequestContext(),
    loadProductionProductStates(),
  ]);
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
