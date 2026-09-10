import path from "node:path";

import { parsePostgresConfig } from "../config.js";
import { closePostgresPool, createPostgresPool } from "../pool.js";
import { runMigrations } from "./runner.js";

const safeMessage = (): string => "Migration configuration or execution failed";

const main = async (): Promise<void> => {
  if (process.env.MOYA_CONTENT_SOURCE !== "legacy")
    throw new Error("Legacy migrations require MOYA_CONTENT_SOURCE=legacy");
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

main().catch(() => {
  console.error(`[catalog-postgres] migration failed: ${safeMessage()}`);
  process.exitCode = 1;
});
