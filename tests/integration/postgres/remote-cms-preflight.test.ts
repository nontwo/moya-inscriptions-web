import { randomBytes } from "node:crypto";
import {
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import { expect, it } from "vitest";

import { assertSyntheticTestDatabaseUrl } from "./synthetic-test-database.js";

const runner = (await import(
  new URL("../../../scripts/editorial/verify-cms.mjs", import.meta.url).href
)) as {
  syntheticDatabase(value: string, environment: NodeJS.ProcessEnv): string;
  verifyRemoteSyntheticDatabase(
    environment: NodeJS.ProcessEnv,
  ): Promise<unknown>;
};

// Opt-in only, before CMS migrations, on the freshly approved disposable target.
it.skipIf(process.env.CMS_TEST_PREFLIGHT_REGRESSION !== "1")(
  "rejects actual non-extension collations and large-object bytes in the otherwise empty CMS test database",
  async () => {
    const database = runner.syntheticDatabase(
      process.env.CMS_TEST_DATABASE_URL ?? "",
      process.env,
    );
    // The shared guard refuses yoyi_dev or any unmarked database before the
    // first database access: the remote preflight below connects and queries.
    assertSyntheticTestDatabaseUrl(database, "CMS_TEST_DATABASE_URL");
    await runner.verifyRemoteSyntheticDatabase(process.env);
    const pool = createPostgresPool(
      parsePostgresConfig({
        DATABASE_URL: database,
        DATABASE_SSL_CA_FILE: process.env.CMS_DATABASE_SSL_CA_FILE,
      }),
    );
    pool.options.statement_timeout = 10000;
    pool.options.query_timeout = 15000;
    const collation = `p2r2b_empty_${randomBytes(8).toString("hex")}`;
    let createdCollation = false;
    let objectOid: number | undefined;
    const query = async (sql: string, values?: unknown[]) => {
      try {
        return await pool.query(sql, values);
      } catch {
        throw new Error("PREFLIGHT_REGRESSION_SQL_FAILED");
      }
    };
    try {
      await query(`CREATE COLLATION public."${collation}" FROM pg_catalog."C"`);
      createdCollation = true;
      await expect(
        runner.verifyRemoteSyntheticDatabase(process.env),
      ).rejects.toThrow("REMOTE_SYNTHETIC_PREFLIGHT_FAILED");
      await query(`DROP COLLATION public."${collation}"`);
      createdCollation = false;
      await runner.verifyRemoteSyntheticDatabase(process.env);

      const created = await query(
        "SELECT lo_from_bytea(0, convert_to('synthetic preflight regression', 'UTF8')) AS oid",
      );
      objectOid = created.rows[0]?.oid;
      if (!Number.isSafeInteger(objectOid) || Number(objectOid) < 1)
        throw new Error("PREFLIGHT_REGRESSION_OBJECT_UNVERIFIED");
      await expect(
        runner.verifyRemoteSyntheticDatabase(process.env),
      ).rejects.toThrow("REMOTE_SYNTHETIC_PREFLIGHT_FAILED");
      await query("SELECT lo_unlink($1)", [objectOid]);
      objectOid = undefined;
      await runner.verifyRemoteSyntheticDatabase(process.env);
    } finally {
      try {
        if (createdCollation)
          await query(`DROP COLLATION public."${collation}"`);
        if (objectOid !== undefined)
          await query("SELECT lo_unlink($1)", [objectOid]);
      } finally {
        await pool.end();
      }
    }
  },
  60000,
);
