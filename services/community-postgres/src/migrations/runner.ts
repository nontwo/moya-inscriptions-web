import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { asCommunityOperationError } from "../availability.js";
import { requiredCommunityMigrations } from "./manifest.js";

import type { RequiredCommunityMigration } from "./manifest.js";
import type { Pool, PoolClient, QueryResultRow } from "pg";

interface MigrationLedgerRow extends QueryResultRow {
  readonly migration_id: string;
  readonly filename: string;
  readonly checksum: string;
}

export interface CommunityMigrationFile extends RequiredCommunityMigration {
  readonly sql: string;
}

const migrationFilename = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/;
// Distinct from the legacy family lock so the two commands never serialize.
const migrationLockId = "735052184205";

export class CommunityMigrationStateError extends Error {
  override readonly name = "CommunityMigrationStateError";
}

export class CommunitySchemaNotReadyError extends Error {
  override readonly name = "CommunitySchemaNotReadyError";

  constructor(options: { readonly cause?: unknown } = {}) {
    super("Community PostgreSQL schema is not ready", options);
  }
}

const checksum = (sql: string): string =>
  createHash("sha256").update(sql).digest("hex");

const assertManifestMatches = (
  files: readonly CommunityMigrationFile[],
): void => {
  if (files.length !== requiredCommunityMigrations.length) {
    throw new CommunityMigrationStateError(
      "Community migration manifest does not match the SQL migration set",
    );
  }
  for (const required of requiredCommunityMigrations) {
    const file = files.find(
      ({ migrationId }) => migrationId === required.migrationId,
    );
    if (
      file === undefined ||
      file.filename !== required.filename ||
      file.checksum !== required.checksum
    ) {
      throw new CommunityMigrationStateError(
        `Community migration manifest mismatch for ${required.migrationId}`,
      );
    }
  }
};

export const readCommunityMigrationFiles = async (
  directory: string,
): Promise<readonly CommunityMigrationFile[]> => {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .sort((left, right) => left.name.localeCompare(right.name));
  const seenIds = new Set<string>();
  const files: CommunityMigrationFile[] = [];
  for (const entry of entries) {
    const migrationId = migrationFilename.exec(entry.name)?.[1];
    if (migrationId === undefined) {
      throw new CommunityMigrationStateError(
        `Invalid community migration filename: ${entry.name}`,
      );
    }
    if (seenIds.has(migrationId)) {
      throw new CommunityMigrationStateError(
        `Duplicate community migration ID: ${migrationId}`,
      );
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
  assertManifestMatches(files);
  return files;
};

const acquireClient = async (pool: Pool): Promise<PoolClient> => {
  try {
    return await pool.connect();
  } catch (error) {
    throw asCommunityOperationError(error, "connect");
  }
};

const createLedger = async (client: PoolClient): Promise<void> => {
  await client.query("CREATE SCHEMA IF NOT EXISTS community");
  await client.query(`
    CREATE TABLE IF NOT EXISTS community.schema_migrations (
      migration_id VARCHAR(14) PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT community_schema_migrations_id_valid CHECK (
        migration_id ~ '^[0-9]{14}$'
      ),
      CONSTRAINT community_schema_migrations_checksum_valid CHECK (
        checksum ~ '^[0-9a-f]{64}$'
      )
    )
  `);
};

const readLedger = async (
  client: PoolClient,
): Promise<ReadonlyMap<string, MigrationLedgerRow>> => {
  const result = await client.query<MigrationLedgerRow>(
    "SELECT migration_id, filename, checksum FROM community.schema_migrations",
  );
  return new Map(result.rows.map((row) => [row.migration_id, row]));
};

const assertAppliedMigrationMatches = (
  file: RequiredCommunityMigration,
  applied: MigrationLedgerRow,
): void => {
  if (
    applied.filename !== file.filename ||
    applied.checksum !== file.checksum
  ) {
    throw new CommunityMigrationStateError(
      `Applied community migration ${file.migrationId} is immutable and does not match its checksum`,
    );
  }
};

/** Explicit DDL path for migration-privileged credentials; never called at startup. */
export const runCommunityMigrations = async (
  pool: Pool,
  directory: string,
): Promise<readonly string[]> => {
  const files = await readCommunityMigrationFiles(directory);
  const client = await acquireClient(pool);
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
          `INSERT INTO community.schema_migrations
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
        throw new CommunityMigrationStateError(
          `Community migration ${file.migrationId} failed`,
          { cause: error },
        );
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

// undefined_table, invalid_schema_name, insufficient_privilege: the family or
// its App-role grants are missing, not the database.
const schemaNotReadyCodes = new Set(["42P01", "3F000", "42501"]);

const isSchemaNotReadyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string" &&
  schemaNotReadyCodes.has(error.code);

/** Read-only startup check with the App role: every required migration is applied unchanged. */
export const verifyCommunityMigrationLedger = async (
  pool: Pool,
): Promise<void> => {
  const client = await acquireClient(pool);
  try {
    const ledger = await readLedger(client);
    for (const required of requiredCommunityMigrations) {
      const applied = ledger.get(required.migrationId);
      if (applied === undefined) throw new CommunitySchemaNotReadyError();
      assertAppliedMigrationMatches(required, applied);
    }
  } catch (error) {
    if (
      error instanceof CommunitySchemaNotReadyError ||
      error instanceof CommunityMigrationStateError
    )
      throw error;
    if (isSchemaNotReadyError(error))
      throw new CommunitySchemaNotReadyError({ cause: error });
    throw asCommunityOperationError(error, "query");
  } finally {
    client.release();
  }
};
