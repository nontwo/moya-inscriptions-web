import type { postgresAdapter } from "@payloadcms/db-postgres";
import {
  assertMigrationTarget,
  migrationTargetProbeSql,
} from "@moya/catalog-postgres";

/** Guard the adapter methods used by the official CLI, before its ledger DDL. */
export const guardCmsMigrationAdapter = (
  adapter: ReturnType<typeof postgresAdapter>,
): ReturnType<typeof postgresAdapter> => ({
  ...adapter,
  init(args) {
    const db = adapter.init(args);
    const check = async () => {
      if (process.env.MOYA_CONTENT_SOURCE !== "payload")
        throw new Error(
          "Payload migrations require MOYA_CONTENT_SOURCE=payload",
        );
      const result = await db.pool.query(migrationTargetProbeSql);
      assertMigrationTarget(result.rows, "payload");
    };
    const migrate = db.migrate;
    db.migrate = async (options) => {
      await check();
      await migrate.call(db, options);
    };
    for (const method of [
      "migrateDown",
      "migrateRefresh",
      "migrateReset",
    ] as const) {
      const original = db[method];
      db[method] = async () => {
        await check();
        await original.call(db);
      };
    }
    const fresh = db.migrateFresh;
    db.migrateFresh = async (options) => {
      await check();
      await fresh.call(db, options);
    };
    return db;
  },
});
