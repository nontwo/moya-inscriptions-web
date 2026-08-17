import { connection } from "next/server";

import { HomeScreen } from "../features/home/home-screen";
import { loadHomeCatalogState } from "../features/home/load-home-catalog";

export default async function HomePage() {
  await connection();
  const state = await loadHomeCatalogState();

  return <HomeScreen state={state} />;
}
