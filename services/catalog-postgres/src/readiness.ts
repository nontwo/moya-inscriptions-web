import { asPostgresOperationError } from "./availability.js";
import { verifyRequiredMigrationLedger } from "./migrations/runner.js";

import type { Pool, PoolClient, QueryResultRow } from "pg";

interface ServerVersionRow extends QueryResultRow {
  readonly server_version_num: unknown;
}

export class PostgresStartupError extends Error {
  override readonly name = "PostgresStartupError";

  constructor(
    message = "PostgreSQL startup validation failed",
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}

const acquireClient = async (pool: Pool): Promise<PoolClient> => {
  try {
    return await pool.connect();
  } catch (error) {
    throw asPostgresOperationError(error, "connect");
  }
};

export const checkPostgresReadiness = async (pool: Pool): Promise<void> => {
  const client = await acquireClient(pool);
  try {
    await client.query("SELECT 1");
  } catch (error) {
    throw asPostgresOperationError(error, "query");
  } finally {
    client.release();
  }
};

export const assertPostgresStartupReady = async (pool: Pool): Promise<void> => {
  try {
    const client = await acquireClient(pool);
    try {
      const result = await client.query<ServerVersionRow>(
        "SHOW server_version_num",
      );
      const value = result.rows[0]?.server_version_num;
      const versionNumber =
        typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
      if (
        !Number.isSafeInteger(versionNumber) ||
        versionNumber < 180_000 ||
        versionNumber >= 190_000
      ) {
        throw new PostgresStartupError(
          "PostgreSQL major version 18 is required",
        );
      }
    } finally {
      client.release();
    }
    await verifyRequiredMigrationLedger(pool);
  } catch (error) {
    if (error instanceof PostgresStartupError) throw error;
    throw new PostgresStartupError(
      "PostgreSQL startup validation failed",
      error,
    );
  }
};
