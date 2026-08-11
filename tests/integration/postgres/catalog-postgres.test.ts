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
      "cliff_inscription",
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
  it("has an immutable applied migration and an empty first-class database", async () => {
    expect(await runMigrations(pool, migrationsDirectory)).toEqual([]);
    const migration = requiredMigrations[0];
    const ledger = await pool.query(
      `SELECT migration_id, filename, checksum
       FROM schema_migrations
       WHERE migration_id = $1`,
      [migration?.migrationId],
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

    expect(ledger.rows).toEqual([
      {
        migration_id: migration?.migrationId,
        filename: migration?.filename,
        checksum: migration?.checksum,
      },
    ]);
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

  it("serves seeded list, detail, ordering and frozen pagination semantics", async () => {
    await insertFixture();
    const { baseUrl } = await startHttp();
    const first = await fetch(`${baseUrl}/v1/catalog?page=1&pageSize=2`);
    const second = await fetch(`${baseUrl}/v1/catalog?page=2&pageSize=2`);
    const beyond = await fetch(`${baseUrl}/v1/catalog?page=100&pageSize=2`);
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
