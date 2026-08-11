import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { asPostgresOperationError } from "../availability.js";
import { requiredMigrations } from "./manifest.js";

import type { RequiredMigration } from "./manifest.js";
import type { Pool, PoolClient, QueryResultRow } from "pg";

interface MigrationLedgerRow extends QueryResultRow {
  readonly migration_id: string;
  readonly filename: string;
  readonly checksum: string;
}

export interface MigrationFile extends RequiredMigration {
  readonly sql: string;
}

const migrationFilename = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
const migrationLockId = "735052184204";

export class MigrationStateError extends Error {
  override readonly name = "MigrationStateError";
}

export class DatabaseSchemaNotReadyError extends Error {
  override readonly name = "DatabaseSchemaNotReadyError";

  constructor(options: { readonly cause?: unknown } = {}) {
    super("PostgreSQL schema is not ready", options);
  }
}

const checksum = (sql: string): string =>
  createHash("sha256").update(sql).digest("hex");

const assertManifestMatches = (
  files: readonly MigrationFile[],
  manifest: readonly RequiredMigration[],
): void => {
  if (files.length !== manifest.length) {
    throw new MigrationStateError(
      "Migration manifest does not match the SQL migration set",
    );
  }

  for (const required of manifest) {
    const file = files.find(
      ({ migrationId }) => migrationId === required.migrationId,
    );
    if (
      file === undefined ||
      file.filename !== required.filename ||
      file.checksum !== required.checksum
    ) {
      throw new MigrationStateError(
        `Migration manifest mismatch for ${required.migrationId}`,
      );
    }
  }
};

export const readMigrationFiles = async (
  directory: string,
): Promise<readonly MigrationFile[]> => {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const seenIds = new Set<string>();
  const files: MigrationFile[] = [];

  for (const entry of entries) {
    const match = migrationFilename.exec(entry.name);
    const migrationId = match?.[1];
    if (migrationId === undefined) {
      throw new MigrationStateError(
        `Invalid migration filename: ${entry.name}`,
      );
    }
    if (seenIds.has(migrationId)) {
      throw new MigrationStateError(`Duplicate migration ID: ${migrationId}`);
    }
    seenIds.add(migrationId);

    const sql = await readFile(path.join(directory, entry.name), "utf8");
    files.push({
      migrationId,
      filename: entry.name,
      checksum: checksum(sql),
      sql,
    });
  }

  assertManifestMatches(files, requiredMigrations);
  return files;
};

const createLedger = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_id VARCHAR(14) PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT schema_migrations_id_valid CHECK (
        migration_id ~ '^[0-9]{14}$'
      ),
      CONSTRAINT schema_migrations_checksum_valid CHECK (
        checksum ~ '^[0-9a-f]{64}$'
      )
    )
  `);
};

const readLedger = async (
  client: PoolClient,
): Promise<ReadonlyMap<string, MigrationLedgerRow>> => {
  const result = await client.query<MigrationLedgerRow>(`
    SELECT migration_id, filename, checksum
    FROM schema_migrations
  `);
  return new Map(result.rows.map((row) => [row.migration_id, row]));
};

const assertAppliedMigrationMatches = (
  file: RequiredMigration,
  applied: MigrationLedgerRow,
): void => {
  if (
    applied.filename !== file.filename ||
    applied.checksum !== file.checksum
  ) {
    throw new MigrationStateError(
      `Applied migration ${file.migrationId} is immutable and does not match its checksum`,
    );
  }
};

export const runMigrations = async (
  pool: Pool,
  directory: string,
): Promise<readonly string[]> => {
  const files = await readMigrationFiles(directory);
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw asPostgresOperationError(error, "connect");
  }

  const appliedNow: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1::bigint)", [
      migrationLockId,
    ]);
    await createLedger(client);
    const ledger = await readLedger(client);

    for (const file of files) {
      const applied = ledger.get(file.migrationId);
      if (applied !== undefined) {
        assertAppliedMigrationMatches(file, applied);
        continue;
      }

      try {
        await client.query("BEGIN");
        await client.query(file.sql);
        await client.query(
          `INSERT INTO schema_migrations
             (migration_id, filename, checksum)
           VALUES ($1, $2, $3)`,
          [file.migrationId, file.filename, file.checksum],
        );
        await client.query("COMMIT");
        appliedNow.push(file.migrationId);
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the migration failure.
        }
        throw new MigrationStateError(`Migration ${file.migrationId} failed`, {
          cause: error,
        });
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1::bigint)", [
        migrationLockId,
      ]);
    } finally {
      client.release();
    }
  }

  return appliedNow;
};

export const verifyRequiredMigrationLedger = async (
  pool: Pool,
): Promise<void> => {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw asPostgresOperationError(error, "connect");
  }

  try {
    const result = await client.query<MigrationLedgerRow>(
      `SELECT migration_id, filename, checksum
       FROM schema_migrations
       WHERE migration_id = ANY($1::text[])`,
      [requiredMigrations.map(({ migrationId }) => migrationId)],
    );
    const ledger = new Map(
      result.rows.map((row) => [row.migration_id, row] as const),
    );
    for (const required of requiredMigrations) {
      const applied = ledger.get(required.migrationId);
      if (applied === undefined) {
        throw new DatabaseSchemaNotReadyError();
      }
      assertAppliedMigrationMatches(required, applied);
    }
    // Newer ledger rows are intentionally irrelevant here. Their presence is
    // not evidence that an older binary is rollback-compatible.
  } catch (error) {
    if (
      error instanceof DatabaseSchemaNotReadyError ||
      error instanceof MigrationStateError
    ) {
      throw error;
    }
    throw new DatabaseSchemaNotReadyError({ cause: error });
  } finally {
    client.release();
  }
};
