import { Pool } from "pg";

import type { PostgresConfig } from "./config.js";

export interface PostgresPoolOptions {
  readonly onUnexpectedIdleError?: () => void;
}

export const createPostgresPool = (
  config: PostgresConfig,
  { onUnexpectedIdleError }: PostgresPoolOptions = {},
): Pool => {
  const pool = new Pool({
    connectionString: config.connectionString,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
  });
  pool.on("error", () => {
    onUnexpectedIdleError?.();
  });
  return pool;
};

export const closePostgresPool = async (pool: Pool): Promise<void> => {
  await pool.end();
};
