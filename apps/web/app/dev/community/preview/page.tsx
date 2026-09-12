import { notFound } from "next/navigation";

import { readDevelopmentRequestContext } from "../../t02p/development-context";
import { loadCleanPreviewStates } from "../../t02p/development-data";
import { CommunityAcceptancePreview } from "./preview-shell";

/**
 * Owner acceptance entry for Community comments (scope amendment 2026-09-12,
 * section 12.3): the accepted Detail and comment presentation over the real
 * Development Backend and database. `?catalogId=` opens a record directly:
 * the product shell reads it from the browser URL on the client, as on the
 * Formal root. Composed only under NODE_ENV=development; never a Production
 * surface.
 */
export default async function CommunityAcceptancePreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const { initialPlatform, mediaOrigin } =
    await readDevelopmentRequestContext();
  const states = await loadCleanPreviewStates(mediaOrigin);

  return (
    <CommunityAcceptancePreview
      initialPlatform={initialPlatform}
      states={states}
    />
  );
}
