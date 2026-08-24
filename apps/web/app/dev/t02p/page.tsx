import { notFound } from "next/navigation";

import { T02pProductPreview } from "../../../features/product-preview/t02p-product-preview";
import { readDevelopmentRequestContext } from "./development-context";
import { loadCleanPreviewStates } from "./development-data";

export default async function T02pDevelopmentPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const { initialPlatform, mediaOrigin } =
    await readDevelopmentRequestContext();
  const states = await loadCleanPreviewStates(mediaOrigin);

  return (
    <T02pProductPreview initialPlatform={initialPlatform} states={states} />
  );
}
