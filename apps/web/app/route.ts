import { connection } from "next/server";

import type { HomeCatalogState } from "../features/home/catalog-state";
import { loadHomeCatalogState } from "../features/home/load-home-catalog";
import { methodNotAllowed, readT02Document } from "../lib/t02-static-files";

export const runtime = "nodejs";

const toVisibleTitles = (state: HomeCatalogState) =>
  state.state === "populated"
    ? state.page.items.map(({ id, title }) => ({ id, title }))
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

  return readT02Document("GET", {
    calligraphy: toVisibleTitles(calligraphyState),
    discover: toVisibleTitles(discoverState),
    inscriptions: toVisibleTitles(inscriptionState),
  });
};
export const HEAD = () => readT02Document("HEAD");
export const POST = methodNotAllowed;
