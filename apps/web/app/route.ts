import { connection } from "next/server";

import { loadHomeCatalogState } from "../features/home/load-home-catalog";
import { methodNotAllowed, readT02Document } from "../lib/t02-static-files";

export const runtime = "nodejs";

export const GET = async () => {
  await connection();
  const state = await loadHomeCatalogState();
  const discoverTitles =
    state.state === "populated"
      ? state.page.items.map(({ id, title }) => ({ id, title }))
      : [];

  return readT02Document("GET", discoverTitles);
};
export const HEAD = () => readT02Document("HEAD");
export const POST = methodNotAllowed;
