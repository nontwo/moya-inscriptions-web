import { connection } from "next/server";

import type { HomeCatalogState } from "../features/home/catalog-state";
import { loadHomeCatalogState } from "../features/home/load-home-catalog";
import { methodNotAllowed, readT02Document } from "../lib/t02-static-files";

import type { BrowseItem } from "../lib/t02-static-files";

export const runtime = "nodejs";

const toVisibleItems = (state: HomeCatalogState): BrowseItem[] =>
  state.state === "populated"
    ? state.page.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        ...(item.periodLabel === undefined
          ? {}
          : { periodLabel: item.periodLabel }),
        ...(item.representativeMedia === undefined
          ? {}
          : { representativeMedia: item.representativeMedia }),
      }))
    : [];

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
      calligraphy: toVisibleItems(calligraphyState),
      discover: toVisibleItems(discoverState),
      inscriptions: toVisibleItems(inscriptionState),
    },
    "formal-root",
  );
};
export const HEAD = () => readT02Document("HEAD", {}, "formal-root");
export const POST = methodNotAllowed;
