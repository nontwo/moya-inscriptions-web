import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { prepareProductionBackend } from "@moya/backend-production";
import {
  createBackendApplication,
  startBackendProcess,
} from "@moya/backend-runtime";
import {
  checkPostgresReadiness,
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
  PostgresCatalogQueryAdapter,
  requiredMigrations,
  runMigrations,
  verifyRequiredMigrationLedger,
} from "@moya/catalog-postgres";
import {
  apiErrorSchema,
  catalogDetailSchema,
  catalogPageSchema,
  healthResponseSchema,
} from "@moya/contracts/schemas";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { BackendProcessHandle } from "@moya/backend-runtime";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests");
}

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationsDirectory = path.join(repositoryRoot, "database", "migrations");
const pool = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: testDatabaseUrl }),
);
const processes = new Set<BackendProcessHandle>();

const resetCatalog = async (): Promise<void> => {
  await pool.query(
    "TRUNCATE catalog_source_citations, catalog_aliases, catalog_entries CASCADE",
  );
};

const startHttp = async (
  queryPool = pool,
): Promise<{
  readonly baseUrl: string;
  readonly handle: BackendProcessHandle;
}> => {
  const handle = await startBackendProcess({
    listen: { host: "127.0.0.1", port: 0 },
    requestListener: createBackendApplication({
      nodeEnv: "production",
      catalogQueryPort: new PostgresCatalogQueryAdapter(queryPool),
      healthReadinessCheck: async () => checkPostgresReadiness(queryPool),
    }),
  });
  processes.add(handle);
  return {
    baseUrl: `http://${handle.address.address}:${handle.address.port}`,
    handle,
  };
};

const insertFixture = async (): Promise<void> => {
  for (const entry of [
    [
      "test-catalog-001",
      "calligraphy",
      "Test Calligraphy",
      "First summary",
      "First description",
      "唐",
    ],
    [
      "test-catalog-002",
      "inscription",
      "Test Inscription",
      null,
      "Second description",
      "汉",
    ],
    [
      "test-catalog-003",
      "inscription",
      "Test Cliff Inscription",
      "Third summary",
      null,
      null,
    ],
  ] as const) {
    await pool.query(
      `INSERT INTO catalog_entries
         (catalog_id, kind, title, summary, description, period_label)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [...entry],
    );
  }
  await pool.query(
    `INSERT INTO catalog_aliases (catalog_id, position, alias)
     VALUES ($1, $2, $3), ($1, $4, $5)`,
    ["test-catalog-001", 1, "Second alias", 0, "First alias"],
  );
  await pool.query(
    `INSERT INTO catalog_source_citations
       (catalog_id, position, label, citation, url)
     VALUES ($1, $2, $3, $4, $5), ($1, $6, $7, $8, $9)`,
    [
      "test-catalog-001",
      1,
      "Second citation",
      null,
      null,
      0,
      "First citation",
      "Test-only public citation",
      "https://example.invalid/catalog-001",
    ],
  );
};

beforeAll(async () => {
  await runMigrations(pool, migrationsDirectory);
  await resetCatalog();
});

afterEach(async () => {
  await Promise.all(
    [...processes].map(async (handle) => {
      await handle.shutdown();
      processes.delete(handle);
    }),
  );
  await resetCatalog();
});

afterAll(async () => {
  await closePostgresPool(pool);
});

describe.sequential("PostgreSQL Catalog HTTP integration", () => {
  it("applies the full migration set once on a fresh schema", async () => {
    const schema = "t043_fresh_catalog_kind";
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${schema}`);
    const isolatedUrl = new URL(testDatabaseUrl);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    const freshPool = createPostgresPool(
      parsePostgresConfig({ DATABASE_URL: isolatedUrl.toString() }),
    );

    try {
      expect(await runMigrations(freshPool, migrationsDirectory)).toEqual(
        requiredMigrations.map(({ migrationId }) => migrationId),
      );
      expect(await runMigrations(freshPool, migrationsDirectory)).toEqual([]);
      await expect(
        verifyRequiredMigrationLedger(freshPool),
      ).resolves.toBeUndefined();

      const constraint = await freshPool.query(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid = 'catalog_entries'::regclass
           AND conname = 'catalog_entries_kind_valid'`,
      );
      expect(constraint.rows).toHaveLength(1);
      expect(String(constraint.rows[0]?.definition)).toContain("inscription");
      expect(String(constraint.rows[0]?.definition)).toContain("calligraphy");
      expect(String(constraint.rows[0]?.definition)).not.toContain(
        "cliff_inscription",
      );
    } finally {
      await closePostgresPool(freshPool);
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });

  it("has an immutable applied migration and an empty first-class database", async () => {
    expect(await runMigrations(pool, migrationsDirectory)).toEqual([]);
    const ledger = await pool.query(
      `SELECT migration_id, filename, checksum
       FROM schema_migrations
       WHERE migration_id = ANY($1::text[])
       ORDER BY migration_id`,
      [requiredMigrations.map(({ migrationId }) => migrationId)],
    );
    const tables = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [["catalog_aliases", "catalog_entries", "catalog_source_citations"]],
    );
    const constraints = await pool.query(
      `SELECT constraint_name
       FROM information_schema.table_constraints
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY constraint_name`,
      [["catalog_aliases", "catalog_entries", "catalog_source_citations"]],
    );
    const indexes = await pool.query(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = ANY($1::text[])
       ORDER BY indexname`,
      [["catalog_aliases", "catalog_entries", "catalog_source_citations"]],
    );
    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*)::integer FROM catalog_entries) AS entries,
         (SELECT COUNT(*)::integer FROM catalog_aliases) AS aliases,
         (SELECT COUNT(*)::integer FROM catalog_source_citations) AS citations`,
    );
    const { baseUrl } = await startHttp();
    const listResponse = await fetch(`${baseUrl}/v1/catalog`);
    const detailResponse = await fetch(
      `${baseUrl}/v1/catalog/test-catalog-missing`,
    );
    const healthResponse = await fetch(`${baseUrl}/health`);

    expect(ledger.rows).toEqual(
      requiredMigrations.map(({ migrationId, filename, checksum }) => ({
        migration_id: migrationId,
        filename,
        checksum,
      })),
    );
    await expect(verifyRequiredMigrationLedger(pool)).resolves.toBeUndefined();
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "catalog_aliases",
      "catalog_entries",
      "catalog_source_citations",
    ]);
    expect(
      constraints.rows.map(({ constraint_name }) => constraint_name),
    ).toEqual(
      expect.arrayContaining([
        "catalog_aliases_catalog_id_fkey",
        "catalog_aliases_pkey",
        "catalog_entries_catalog_id_valid",
        "catalog_entries_kind_valid",
        "catalog_entries_pkey",
        "catalog_source_citations_catalog_id_fkey",
        "catalog_source_citations_pkey",
      ]),
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      "catalog_aliases_pkey",
      "catalog_entries_pkey",
      "catalog_source_citations_pkey",
    ]);
    expect(counts.rows).toEqual([{ aliases: 0, citations: 0, entries: 0 }]);
    expect(listResponse.status).toBe(200);
    expect(catalogPageSchema.parse(await listResponse.json())).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    expect(detailResponse.status).toBe(404);
    expect(apiErrorSchema.parse(await detailResponse.json()).error.code).toBe(
      "ITEM_NOT_FOUND",
    );
    expect(healthResponse.status).toBe(200);
    expect(healthResponseSchema.parse(await healthResponse.json())).toEqual({
      status: "ok",
    });
  });

  it("rejects the retired top-level CatalogKind at the database boundary", async () => {
    await expect(
      pool.query(
        `INSERT INTO catalog_entries (catalog_id, kind, title)
         VALUES ($1, $2, $3)`,
        [
          "test-catalog-retired-kind",
          "cliff_inscription",
          "Retired kind fixture",
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    const result = await pool.query(
      `SELECT COUNT(*)::integer AS count
       FROM catalog_entries
       WHERE catalog_id = $1`,
      ["test-catalog-retired-kind"],
    );
    expect(result.rows).toEqual([{ count: 0 }]);
  });

  it("rolls back the kind evolution before replacing the legacy constraint", async () => {
    const schema = "t043_legacy_catalog_kind";
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${schema}`);
    const isolatedUrl = new URL(testDatabaseUrl);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    const legacyPool = createPostgresPool(
      parsePostgresConfig({ DATABASE_URL: isolatedUrl.toString() }),
    );

    try {
      const legacyMigration = requiredMigrations[0];
      const evolutionMigration = requiredMigrations[1];
      if (legacyMigration === undefined || evolutionMigration === undefined) {
        throw new Error("T05.2 and T04.3 migrations are required");
      }
      const legacySql = await readFile(
        path.join(migrationsDirectory, legacyMigration.filename),
        "utf8",
      );
      await legacyPool.query(legacySql);
      await legacyPool.query(`
        CREATE TABLE schema_migrations (
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
      await legacyPool.query(
        `INSERT INTO schema_migrations (migration_id, filename, checksum)
         VALUES ($1, $2, $3)`,
        [
          legacyMigration.migrationId,
          legacyMigration.filename,
          legacyMigration.checksum,
        ],
      );
      const legacyRow = {
        catalog_id: "legacy-cliff-inscription",
        kind: "cliff_inscription",
        title: "Legacy row must remain unchanged",
        summary: "Legacy summary",
        description: "Legacy description",
        period_label: "Legacy period",
      };
      await legacyPool.query(
        `INSERT INTO catalog_entries
           (catalog_id, kind, title, summary, description, period_label)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        Object.values(legacyRow),
      );
      const constraintBefore = await legacyPool.query(
        `SELECT pg_get_constraintdef(oid) AS definition
         FROM pg_constraint
         WHERE conrelid = 'catalog_entries'::regclass
           AND conname = 'catalog_entries_kind_valid'`,
      );

      await expect(
        runMigrations(legacyPool, migrationsDirectory),
      ).rejects.toThrow(`Migration ${evolutionMigration.migrationId} failed`);

      const [row, constraint, ledger] = await Promise.all([
        legacyPool.query(
          `SELECT catalog_id, kind, title, summary, description, period_label
           FROM catalog_entries
           WHERE catalog_id = $1`,
          [legacyRow.catalog_id],
        ),
        legacyPool.query(
          `SELECT pg_get_constraintdef(oid) AS definition
           FROM pg_constraint
           WHERE conrelid = 'catalog_entries'::regclass
             AND conname = 'catalog_entries_kind_valid'`,
        ),
        legacyPool.query(
          `SELECT migration_id, filename, checksum
           FROM schema_migrations
           ORDER BY migration_id`,
        ),
      ]);

      expect(row.rows).toEqual([legacyRow]);
      expect(constraint.rows).toEqual(constraintBefore.rows);
      expect(String(constraint.rows[0]?.definition)).toContain(
        "cliff_inscription",
      );
      expect(ledger.rows).toEqual([
        {
          migration_id: legacyMigration.migrationId,
          filename: legacyMigration.filename,
          checksum: legacyMigration.checksum,
        },
      ]);
    } finally {
      await closePostgresPool(legacyPool);
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });

  it("serves seeded list, detail, ordering and frozen pagination semantics", async () => {
    await insertFixture();
    const { baseUrl } = await startHttp();
    const first = await fetch(`${baseUrl}/v1/catalog?page=1&pageSize=2`);
    const second = await fetch(`${baseUrl}/v1/catalog?page=2&pageSize=2`);
    const beyond = await fetch(`${baseUrl}/v1/catalog?page=100&pageSize=2`);
    const inscriptions = await fetch(
      `${baseUrl}/v1/catalog?kind=inscription&page=1&pageSize=1`,
    );
    const secondInscription = await fetch(
      `${baseUrl}/v1/catalog?kind=inscription&page=2&pageSize=1`,
    );
    const calligraphy = await fetch(`${baseUrl}/v1/catalog?kind=calligraphy`);
    const retiredKind = await fetch(
      `${baseUrl}/v1/catalog?kind=cliff_inscription`,
    );
    const detail = await fetch(`${baseUrl}/v1/catalog/test-catalog-001`);

    expect(catalogPageSchema.parse(await first.json())).toMatchObject({
      items: [
        { id: "test-catalog-001", aliases: ["First alias", "Second alias"] },
        { id: "test-catalog-002", aliases: [] },
      ],
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(
      catalogPageSchema.parse(await second.json()).items.map(({ id }) => id),
    ).toEqual(["test-catalog-003"]);
    expect(catalogPageSchema.parse(await beyond.json())).toMatchObject({
      items: [],
      page: 100,
      total: 3,
      totalPages: 2,
    });
    expect(catalogPageSchema.parse(await inscriptions.json())).toMatchObject({
      items: [{ id: "test-catalog-002", kind: "inscription" }],
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(
      catalogPageSchema
        .parse(await secondInscription.json())
        .items.map(({ id }) => id),
    ).toEqual(["test-catalog-003"]);
    expect(catalogPageSchema.parse(await calligraphy.json())).toMatchObject({
      items: [{ id: "test-catalog-001", kind: "calligraphy" }],
      total: 1,
      totalPages: 1,
    });
    expect(retiredKind.status).toBe(400);
    expect(apiErrorSchema.parse(await retiredKind.json()).error.code).toBe(
      "INVALID_QUERY",
    );
    expect(catalogDetailSchema.parse(await detail.json())).toMatchObject({
      id: "test-catalog-001",
      aliases: ["First alias", "Second alias"],
      sourceCitations: [
        {
          label: "First citation",
          citation: "Test-only public citation",
          url: "https://example.invalid/catalog-001",
        },
        { label: "Second citation" },
      ],
    });
  });

  it("does not serialize an adapter-private database column", async () => {
    await pool.query(
      "ALTER TABLE catalog_entries ADD COLUMN IF NOT EXISTS test_private_metadata TEXT",
    );
    await insertFixture();
    await pool.query(
      `UPDATE catalog_entries
       SET test_private_metadata = $1
       WHERE catalog_id = $2`,
      ["raw evidence review objectKey /private/path", "test-catalog-001"],
    );
    const { baseUrl } = await startHttp();
    const response = await fetch(`${baseUrl}/v1/catalog/test-catalog-001`);
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("test_private_metadata");
    expect(serialized).not.toContain("raw evidence");
    expect(serialized).not.toContain("objectKey");
    expect(serialized).not.toContain("/private/path");
  });

  it("accepts newer unknown ledger rows without claiming rollback safety", async () => {
    await pool.query(
      `INSERT INTO schema_migrations
         (migration_id, filename, checksum)
       VALUES ($1, $2, $3)`,
      ["99991231235959", "99991231235959_future_expand.sql", "0".repeat(64)],
    );

    await expect(verifyRequiredMigrationLedger(pool)).resolves.toBeUndefined();
  });

  it("fails production startup on an unmigrated schema without creating its ledger", async () => {
    const schema = "t052_startup_read_only";
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.query(`CREATE SCHEMA ${schema}`);
    const isolatedUrl = new URL(testDatabaseUrl);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);

    try {
      await expect(
        prepareProductionBackend({
          DATABASE_URL: isolatedUrl.toString(),
          HOST: "127.0.0.1",
          NODE_ENV: "production",
          PORT: "3001",
        }),
      ).rejects.toThrow("PostgreSQL startup validation failed");
      const ledger = await pool.query("SELECT to_regclass($1) AS relation", [
        `${schema}.schema_migrations`,
      ]);
      expect(ledger.rows).toEqual([{ relation: null }]);
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    }
  });

  it("maps a real unavailable PostgreSQL connection to safe Catalog and health 503", async () => {
    const unavailablePool = createPostgresPool({
      connectionString:
        "postgresql://moya:secret@127.0.0.1:1/unavailable_catalog",
      connectionTimeoutMillis: 100,
    });
    const { baseUrl } = await startHttp(unavailablePool);
    const [catalogResponse, healthResponse] = await Promise.all([
      fetch(`${baseUrl}/v1/catalog`),
      fetch(`${baseUrl}/health`),
    ]);
    const catalogError = apiErrorSchema.parse(await catalogResponse.json());
    const healthError = apiErrorSchema.parse(await healthResponse.json());

    expect(catalogResponse.status).toBe(503);
    expect(catalogError.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(healthResponse.status).toBe(503);
    expect(healthError.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify([catalogError, healthError])).not.toContain("secret");
    await closePostgresPool(unavailablePool);
  });

  it("composes production only after read-only migration validation and closes its pool", async () => {
    const prepared = await prepareProductionBackend({
      DATABASE_URL: testDatabaseUrl,
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      PORT: "3001",
    });
    const handle = await startBackendProcess({
      closeResources: prepared.closeResources,
      listen: { host: "127.0.0.1", port: 0 },
      requestListener: prepared.requestListener,
    });
    processes.add(handle);
    const response = await fetch(
      `http://${handle.address.address}:${handle.address.port}/health`,
    );

    expect(response.status).toBe(200);
    await handle.shutdown();
    processes.delete(handle);
    await expect(prepared.readinessCheck()).rejects.toThrow();
  });
});
