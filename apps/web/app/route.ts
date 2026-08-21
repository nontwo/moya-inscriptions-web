import { connection } from "next/server";

import type { HomeCatalogState } from "../features/home/catalog-state";
import { loadHomeCatalogState } from "../features/home/load-home-catalog";
import { methodNotAllowed, readT02Document } from "../lib/t02-static-files";

import type { CatalogSummary } from "@moya/contracts";

export const runtime = "nodejs";

type CatalogCardSummary = Pick<
  CatalogSummary,
  "id" | "kind" | "title" | "periodLabel" | "representativeMedia"
>;

const toVisibleCards = (state: HomeCatalogState): CatalogCardSummary[] =>
  state.state === "populated"
    ? state.page.items.map(
        ({ id, kind, periodLabel, representativeMedia, title }) => ({
          id,
          kind,
          periodLabel,
          representativeMedia,
          title,
        }),
      )
    : [];

const catalogDetailQaEnabled = (): boolean =>
  process.env.NODE_ENV !== "production" &&
  process.env.MOYA_CATALOG_DETAIL_QA === "1";

export const GET = async () => {
  await connection();
  const [discoverState, inscriptionState, calligraphyState] = await Promise.all(
    [
      loadHomeCatalogState(),
      loadHomeCatalogState({ kind: "inscription" }),
      loadHomeCatalogState({ kind: "calligraphy" }),
    ],
  );

  return readT02Document(
    "GET",
    {
      calligraphy: toVisibleCards(calligraphyState),
      discover: toVisibleCards(discoverState),
      inscriptions: toVisibleCards(inscriptionState),
    },
    { catalogDetailQa: catalogDetailQaEnabled() },
  );
};
export const HEAD = () => readT02Document("HEAD");
export const POST = methodNotAllowed;
