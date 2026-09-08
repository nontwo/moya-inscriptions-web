import { parsePostgresConfig } from "./config.js";
import { closePostgresPool, createPostgresPool } from "./pool.js";
import { assertPostgresStartupReady } from "./readiness.js";
import { rebuildCatalogSearchDocuments } from "./search-documents.js";

const main = async (): Promise<void> => {
  if (process.argv.length !== 2)
    throw new Error("Unexpected rebuild arguments");
  const pool = createPostgresPool(parsePostgresConfig(process.env));
  try {
    await assertPostgresStartupReady(pool);
    const count = await rebuildCatalogSearchDocuments(pool);
    console.info(
      `[catalog-postgres] search rebuild complete (${count} records)`,
    );
  } finally {
    await closePostgresPool(pool);
  }
};

main().catch(() => {
  // Raw database errors can carry source text or connection details.
  console.error("[catalog-postgres] search rebuild failed");
  process.exitCode = 1;
});
