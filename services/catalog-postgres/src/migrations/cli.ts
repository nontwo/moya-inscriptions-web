import path from "node:path";

import { parsePostgresConfig } from "../config.js";
import { closePostgresPool, createPostgresPool } from "../pool.js";
import { runMigrations } from "./runner.js";

const safeMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Migration failed";

const main = async (): Promise<void> => {
  const migrationDirectoryArgument = process.argv[2];
  if (migrationDirectoryArgument === undefined) {
    throw new Error("A migration directory is required");
  }

  const config = parsePostgresConfig(process.env);
  const pool = createPostgresPool(config);
  try {
    const applied = await runMigrations(
      pool,
      path.resolve(process.cwd(), migrationDirectoryArgument),
    );
    console.info(
      `[catalog-postgres] migrations complete (${applied.length} applied)`,
    );
  } finally {
    await closePostgresPool(pool);
  }
};

main().catch((error: unknown) => {
  console.error(`[catalog-postgres] migration failed: ${safeMessage(error)}`);
  process.exitCode = 1;
});
