import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyCatalogImport,
  createCatalogImportDryRun,
  parseCatalogImportCsvBundle,
} from "@moya/catalog-importer";
import { prepareProductionBackend } from "@moya/backend-production";
import { startBackendProcess } from "@moya/backend-runtime";
import {
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
  runMigrations,
} from "@moya/catalog-postgres";
import { catalogIdSchema } from "@moya/contracts/schemas";
import { dryRunFindingIdSchema } from "@moya/contracts/internal/catalog-import";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { CatalogImportDryRun } from "@moya/contracts/internal/catalog-import";
import type {
  CatalogIdAllocator,
  CatalogImportAuthorization,
  ParsedCatalogImportBundle,
} from "@moya/catalog-importer";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests");
}

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationsDirectory = path.join(repositoryRoot, "database", "migrations");
const schema = "p5_catalog_importer";
const isolatedUrl = new URL(testDatabaseUrl);
isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
const administrationPool = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: testDatabaseUrl }),
);
const pool = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: isolatedUrl.toString() }),
);
let bundleDirectory = "";

const catalogHeaders =
  "catalogImportId,sourceId,catalogId,title,catalogKind,dynasty,dynastyState,dateText,dateTextState,province,provinceState,prefecture,prefectureState,county,countyState,currentLocation,currentLocationState,currentCustodian,currentCustodianState,description,descriptionState,ownerNote";

const writeBundle = async (input?: {
  readonly catalogId?: string;
  readonly title?: string;
  readonly description?: string;
  readonly descriptionState?: "VALUE" | "UNSUPPLIED" | "CLEAR";
  readonly alias?: boolean;
}) => {
  const description = input?.description ?? "测试说明";
  const descriptionState = input?.descriptionState ?? "VALUE";
  const catalogRow = [
    "item-000001",
    "src_test_p5_001",
    input?.catalogId ?? "",
    input?.title ?? "测试碑刻",
    "inscription",
    "唐",
    "VALUE",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    description,
    descriptionState,
    "",
  ].join(",");
  await Promise.all([
    writeFile(
      path.join(bundleDirectory, "00_manifest.csv"),
      "importContractVersion\ncatalog-import/v1\n",
    ),
    writeFile(
      path.join(bundleDirectory, "catalog.csv"),
      `${catalogHeaders}\n${catalogRow}\n`,
    ),
    writeFile(
      path.join(bundleDirectory, "aliases.csv"),
      input?.alias === false
        ? "catalogImportId,alias,aliasType\n"
        : "catalogImportId,alias,aliasType\nitem-000001,测试旧称,historical\n",
    ),
    writeFile(
      path.join(bundleDirectory, "provenance.csv"),
      "catalogImportId,sourceId,sourceTitle,sourceTypeRaw,sourceUrl,sourceNote\nitem-000001,src_test_p5_001,测试碑刻,official-test,https://example.invalid/source,\n",
    ),
  ]);
};

const fakeAllocator = (
  catalogId = "catalog-platform-test-001",
): CatalogIdAllocator => ({
  allocateCatalogId: () => catalogIdSchema.parse(catalogId),
});

const authorization = (
  dryRun: CatalogImportDryRun,
  approvedFindingIds: readonly string[] = [],
  runtime: "VALIDATION" | "PRODUCTION" = "VALIDATION",
): CatalogImportAuthorization => {
  const approval = {
    importContractVersion: "catalog-import/v1" as const,
    canonicalInputSha256: dryRun.canonicalInputSha256,
    dryRunResultSha256: dryRun.dryRunResultSha256,
    state: "APPROVED" as const,
    approvedFindingIds: approvedFindingIds.map((id) =>
      dryRunFindingIdSchema.parse(id),
    ),
    decidedBy: "OWNER / owner — supplied test approval",
    decidedAt: "2026-08-15T00:00:00.000Z",
  };
  return runtime === "VALIDATION"
    ? {
        runtime: "VALIDATION",
        purpose: "VALIDATION_ONLY",
        nonProduction: true,
        disposableDatabase: true,
        publicationApproval: false,
        reusableForProduction: false,
        ownerInstructionReference: "test owner authorization",
        approval,
      }
    : {
        runtime: "PRODUCTION",
        purpose: "PRODUCTION_IMPORT",
        publicationApproval: false,
        approval,
      };
};

const applyInput = (
  parsed: ParsedCatalogImportBundle,
  dryRun: CatalogImportDryRun,
  operationId: string,
  overrides: Partial<Parameters<typeof applyCatalogImport>[1]> = {},
) => ({
  operationId,
  parsed,
  dryRun,
  authorization: authorization(dryRun),
  catalogIdAllocator: fakeAllocator(),
  appliedAt: "2026-08-15T00:00:00.000Z",
  ...overrides,
});

const readImporterDatabaseState = async () => {
  const [entries, aliases, sources, operations, operationItems] =
    await Promise.all([
      pool.query("SELECT * FROM catalog_entries ORDER BY catalog_id"),
      pool.query("SELECT * FROM catalog_aliases ORDER BY catalog_id, position"),
      pool.query("SELECT * FROM catalog_import_sources ORDER BY source_id"),
      pool.query(
        "SELECT * FROM catalog_import_operations ORDER BY operation_id",
      ),
      pool.query(
        "SELECT * FROM catalog_import_operation_items ORDER BY operation_id, catalog_import_id",
      ),
    ]);
  return {
    entries: entries.rows,
    aliases: aliases.rows,
    sources: sources.rows,
    operations: operations.rows,
    operationItems: operationItems.rows,
  };
};

beforeAll(async () => {
  await administrationPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await administrationPool.query(`CREATE SCHEMA ${schema}`);
  await runMigrations(pool, migrationsDirectory);
  bundleDirectory = await mkdtemp(path.join(tmpdir(), "moya-p5-import-"));
});

beforeEach(async () => {
  await pool.query(
    "TRUNCATE catalog_import_operations, catalog_entries CASCADE",
  );
  await writeBundle();
});

afterAll(async () => {
  await closePostgresPool(pool);
  await administrationPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await closePostgresPool(administrationPool);
  await rm(bundleDirectory, { recursive: true, force: true });
});

describe.sequential("catalog-import/v1 PostgreSQL apply", () => {
  it("requires a caller allocator, rolls back atomically, applies, and replays", async () => {
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const dryRun = await createCatalogImportDryRun(
      pool,
      parsed,
      "2026-08-15T00:00:00.000Z",
    );
    expect(dryRun).toMatchObject({
      state: "PASSED",
      applyReady: true,
      findings: [],
      resultCounts: { add: 1, update: 0, conflict: 0, error: 0 },
    });

    await expect(
      applyCatalogImport(pool, {
        ...applyInput(parsed, dryRun, "p5-no-allocator"),
        catalogIdAllocator: undefined,
      }),
    ).rejects.toThrow("explicitly supplied platform CatalogIdAllocator");
    await expect(
      pool.query(
        "SELECT COUNT(*)::integer AS count FROM catalog_import_operations",
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });

    await expect(
      applyCatalogImport(pool, {
        ...applyInput(parsed, dryRun, "p5-rollback"),
        failureAfterCatalogRows: 1,
      }),
    ).rejects.toThrow("Synthetic mid-transaction failure");
    await expect(
      pool.query("SELECT COUNT(*)::integer AS count FROM catalog_entries"),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });

    const input = applyInput(parsed, dryRun, "p5-applied");
    const first = await applyCatalogImport(pool, input);
    const replay = await applyCatalogImport(pool, input);
    expect(first).toMatchObject({
      status: "APPLIED",
      created: 1,
      updated: 0,
      catalogIdMap: [{ catalogId: "catalog-platform-test-001" }],
    });
    expect(replay).toMatchObject({ status: "ALREADY_APPLIED", created: 1 });
    expect(first.catalogIdMap[0]?.catalogId).not.toContain("src_test_p5_001");
  });

  it("updates the same CatalogId through the importer and preserves identity", async () => {
    await writeBundle({ alias: false });
    const createParsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const createDryRun = await createCatalogImportDryRun(
      pool,
      createParsed,
      "2026-08-15T00:00:01.000Z",
    );
    await applyCatalogImport(
      pool,
      applyInput(createParsed, createDryRun, "p5-update-seed"),
    );

    await writeBundle({
      catalogId: "catalog-platform-test-001",
      title: "测试碑刻修订",
      alias: false,
    });
    const updateParsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const updateDryRun = await createCatalogImportDryRun(
      pool,
      updateParsed,
      "2026-08-15T00:00:02.000Z",
    );
    expect(updateDryRun).toMatchObject({
      state: "PASSED",
      resultCounts: { add: 0, update: 1, unchanged: 0 },
      findings: [{ field: "title", requiresFieldApproval: true }],
    });
    const findingIds = updateDryRun.findings.map(({ findingId }) =>
      String(findingId),
    );
    const result = await applyCatalogImport(pool, {
      ...applyInput(updateParsed, updateDryRun, "p5-update"),
      authorization: authorization(updateDryRun, findingIds, "PRODUCTION"),
      catalogIdAllocator: undefined,
    });
    expect(result).toMatchObject({ created: 0, updated: 1 });
    const persisted = await pool.query(
      "SELECT catalog_id, title FROM catalog_entries",
    );
    expect(persisted.rows).toEqual([
      { catalog_id: "catalog-platform-test-001", title: "测试碑刻修订" },
    ]);
  });

  it("surfaces CLEAR and requires its exact field approval", async () => {
    await writeBundle({ alias: false });
    const seed = await parseCatalogImportCsvBundle(bundleDirectory);
    const seedDryRun = await createCatalogImportDryRun(
      pool,
      seed,
      "2026-08-15T00:00:03.000Z",
    );
    await applyCatalogImport(
      pool,
      applyInput(seed, seedDryRun, "p5-clear-seed"),
    );
    await writeBundle({
      catalogId: "catalog-platform-test-001",
      description: "",
      descriptionState: "CLEAR",
      alias: false,
    });
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const dryRun = await createCatalogImportDryRun(
      pool,
      parsed,
      "2026-08-15T00:00:04.000Z",
    );
    expect(dryRun.findings).toEqual([
      expect.objectContaining({
        field: "description",
        operation: "CLEAR",
        requiresFieldApproval: true,
      }),
    ]);
    await expect(
      applyCatalogImport(pool, {
        ...applyInput(parsed, dryRun, "p5-clear-unapproved"),
        authorization: authorization(dryRun, [], "PRODUCTION"),
        catalogIdAllocator: undefined,
      }),
    ).rejects.toThrow("required field-level finding");
    const clearFinding = String(dryRun.findings[0]?.findingId);
    await applyCatalogImport(pool, {
      ...applyInput(parsed, dryRun, "p5-clear-approved"),
      authorization: authorization(dryRun, [clearFinding], "PRODUCTION"),
      catalogIdAllocator: undefined,
    });
    await expect(
      pool.query("SELECT description, description_state FROM catalog_entries"),
    ).resolves.toMatchObject({
      rows: [{ description: null, description_state: "CLEAR" }],
    });
  });

  it("rejects envelope, dry-run, and approval tampering before allocation", async () => {
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const dryRun = await createCatalogImportDryRun(
      pool,
      parsed,
      "2026-08-15T00:00:05.000Z",
    );
    let allocations = 0;
    const allocator: CatalogIdAllocator = {
      allocateCatalogId: () => {
        allocations += 1;
        return "catalog-never-allocated";
      },
    };
    const tampered = {
      ...parsed,
      envelope: {
        ...parsed.envelope,
        catalogRows: parsed.envelope.catalogRows.map((row) => ({
          ...row,
          title: "篡改标题",
        })),
      },
    };
    await expect(
      applyCatalogImport(pool, {
        ...applyInput(tampered, dryRun, "p5-tampered-envelope"),
        catalogIdAllocator: allocator,
      }),
    ).rejects.toThrow("metadata does not match its envelope");
    expect(allocations).toBe(0);

    await expect(
      applyCatalogImport(pool, {
        ...applyInput(
          parsed,
          {
            ...dryRun,
            resultCounts: {
              ...dryRun.resultCounts,
              add: 0,
              unchanged: 1,
            },
          },
          "p5-tampered-dry-run",
        ),
        catalogIdAllocator: allocator,
      }),
    ).rejects.toThrow("dry-run result hash is invalid");
    expect(allocations).toBe(0);

    const stateTampered = {
      ...parsed,
      envelope: {
        ...parsed.envelope,
        catalogRows: parsed.envelope.catalogRows.map((row) => ({
          ...row,
          dynasty: { state: "UNKNOWN" as const },
        })),
      },
    };
    await expect(
      applyCatalogImport(pool, {
        ...applyInput(stateTampered, dryRun, "p5-tampered-state"),
        catalogIdAllocator: allocator,
      }),
    ).rejects.toThrow("metadata does not match its envelope");
    expect(allocations).toBe(0);

    await expect(
      applyCatalogImport(pool, {
        ...applyInput(parsed, dryRun, "p5-tampered-approval"),
        authorization: {
          ...authorization(dryRun),
          approval: {
            ...authorization(dryRun).approval,
            canonicalInputSha256:
              "0000000000000000000000000000000000000000000000000000000000000000",
          },
        } as CatalogImportAuthorization,
        catalogIdAllocator: allocator,
      }),
    ).rejects.toThrow("does not bind");
    expect(allocations).toBe(0);

    await expect(
      applyCatalogImport(pool, {
        ...applyInput(parsed, dryRun, "p5-validation-in-production"),
        authorization: {
          ...authorization(dryRun),
          runtime: "PRODUCTION",
        } as unknown as CatalogImportAuthorization,
        catalogIdAllocator: allocator,
      }),
    ).rejects.toThrow("Validation-only authorization is not accepted");
    expect(allocations).toBe(0);
  });

  it("rejects scalar factual VALUE tampering before allocation or mutation", async () => {
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const dryRun = await createCatalogImportDryRun(
      pool,
      parsed,
      "2026-08-15T00:00:05.100Z",
    );
    const before = await readImporterDatabaseState();
    let allocations = 0;
    const allocator: CatalogIdAllocator = {
      allocateCatalogId: () => {
        allocations += 1;
        return "catalog-never-allocated";
      },
    };
    const factualValueTampered = {
      ...parsed,
      envelope: {
        ...parsed.envelope,
        catalogRows: parsed.envelope.catalogRows.map((row) => ({
          ...row,
          description: {
            state: "VALUE" as const,
            value: "篡改后的事实值",
          },
        })),
      },
    };

    await expect(
      applyCatalogImport(pool, {
        ...applyInput(
          factualValueTampered,
          dryRun,
          "p5-tampered-factual-value",
        ),
        authorization: authorization(dryRun, [], "PRODUCTION"),
        catalogIdAllocator: allocator,
      }),
    ).rejects.toThrow("metadata does not match its envelope");
    expect(allocations).toBe(0);
    await expect(readImporterDatabaseState()).resolves.toEqual(before);
  });

  it("rejects a standalone canonical input hash mismatch before allocation or mutation", async () => {
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const dryRun = await createCatalogImportDryRun(
      pool,
      parsed,
      "2026-08-15T00:00:05.200Z",
    );
    const before = await readImporterDatabaseState();
    let allocations = 0;
    const allocator: CatalogIdAllocator = {
      allocateCatalogId: () => {
        allocations += 1;
        return "catalog-never-allocated";
      },
    };
    const canonicalHashMismatched = {
      ...parsed,
      canonicalInputSha256:
        "0000000000000000000000000000000000000000000000000000000000000000",
    };

    await expect(
      applyCatalogImport(pool, {
        ...applyInput(
          canonicalHashMismatched,
          dryRun,
          "p5-canonical-hash-mismatch",
        ),
        authorization: authorization(dryRun, [], "PRODUCTION"),
        catalogIdAllocator: allocator,
      }),
    ).rejects.toThrow("metadata does not match its envelope");
    expect(allocations).toBe(0);
    await expect(readImporterDatabaseState()).resolves.toEqual(before);
  });

  it("rejects an unknown finding approval before allocation or mutation", async () => {
    await writeBundle({ alias: false });
    const seed = await parseCatalogImportCsvBundle(bundleDirectory);
    const seedDryRun = await createCatalogImportDryRun(
      pool,
      seed,
      "2026-08-15T00:00:05.300Z",
    );
    await applyCatalogImport(
      pool,
      applyInput(seed, seedDryRun, "p5-unknown-finding-seed"),
    );
    await writeBundle({
      catalogId: "catalog-platform-test-001",
      description: "",
      descriptionState: "CLEAR",
      alias: false,
    });
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const dryRun = await createCatalogImportDryRun(
      pool,
      parsed,
      "2026-08-15T00:00:05.400Z",
    );
    const legitimateFinding = String(dryRun.findings[0]?.findingId);
    const unknownFinding = "finding-well-formed-but-absent";
    expect(dryRun.findings).toEqual([
      expect.objectContaining({
        findingId: legitimateFinding,
        operation: "CLEAR",
        requiresFieldApproval: true,
      }),
    ]);
    const before = await readImporterDatabaseState();
    let allocations = 0;
    const allocator: CatalogIdAllocator = {
      allocateCatalogId: () => {
        allocations += 1;
        return "catalog-never-allocated";
      },
    };

    await expect(
      applyCatalogImport(pool, {
        ...applyInput(parsed, dryRun, "p5-unknown-finding-approval"),
        authorization: authorization(
          dryRun,
          [legitimateFinding, unknownFinding],
          "PRODUCTION",
        ),
        catalogIdAllocator: allocator,
      }),
    ).rejects.toThrow("unknown or non-approvable finding");
    expect(allocations).toBe(0);
    await expect(readImporterDatabaseState()).resolves.toEqual(before);
  });

  it("rejects malformed CSV and unsupported kinds before dry-run", async () => {
    await writeFile(
      path.join(bundleDirectory, "catalog.csv"),
      `${catalogHeaders}\nitem-000001,src_test_p5_001,,测试碑刻,unsupported-kind,,,,,,,,,,,,,,,,,\n`,
    );
    await expect(
      parseCatalogImportCsvBundle(bundleDirectory),
    ).rejects.toThrow();

    await writeFile(
      path.join(bundleDirectory, "catalog.csv"),
      `${catalogHeaders}\n"unterminated\n`,
    );
    await expect(parseCatalogImportCsvBundle(bundleDirectory)).rejects.toThrow(
      "Unterminated quoted CSV field",
    );
  });

  it("fails closed on an existing SourceId rebound", async () => {
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const dryRun = await createCatalogImportDryRun(
      pool,
      parsed,
      "2026-08-15T00:00:06.000Z",
    );
    await applyCatalogImport(
      pool,
      applyInput(parsed, dryRun, "p5-conflict-seed"),
    );
    await writeBundle({ catalogId: "catalog-other", alias: false });
    const conflictParsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const conflictDryRun = await createCatalogImportDryRun(
      pool,
      conflictParsed,
      "2026-08-15T00:00:07.000Z",
    );
    expect(conflictDryRun).toMatchObject({
      state: "FAILED",
      applyReady: false,
      resultCounts: { identityConflict: 1 },
      applyBlockers: ["IDENTITY_CONFLICT"],
    });
  });

  it.runIf(process.env.P5_RESEARCH_EXPORT_DIR !== undefined)(
    "applies, replays, and reads back the actual 28-record Research bundle",
    async () => {
      const actual = await parseCatalogImportCsvBundle(
        process.env.P5_RESEARCH_EXPORT_DIR!,
      );
      const dryRun = await createCatalogImportDryRun(
        pool,
        actual,
        "2026-08-15T00:00:08.000Z",
      );
      expect(actual.canonicalInputSha256).toBe(
        "adb139588625a9447aadfa242efbd1bfd35de00befa99338ba265b7a9511d3ed",
      );
      expect(dryRun).toMatchObject({
        state: "PASSED",
        applyReady: true,
        findings: [],
        resultCounts: {
          add: 28,
          update: 0,
          unchanged: 0,
          conflict: 0,
          error: 0,
        },
      });
      const result = await applyCatalogImport(pool, {
        ...applyInput(actual, dryRun, "p5-actual-28"),
        catalogIdAllocator: {
          allocateCatalogId: ({ catalogImportId }) =>
            catalogIdSchema.parse(`catalog-platform-${catalogImportId}`),
        },
      });
      const replay = await applyCatalogImport(pool, {
        ...applyInput(actual, dryRun, "p5-actual-28"),
        catalogIdAllocator: {
          allocateCatalogId: ({ catalogImportId }) =>
            catalogIdSchema.parse(`catalog-platform-${catalogImportId}`),
        },
      });
      expect(result).toMatchObject({ status: "APPLIED", created: 28 });
      expect(replay).toMatchObject({ status: "ALREADY_APPLIED", created: 28 });

      const prepared = await prepareProductionBackend({
        DATABASE_URL: isolatedUrl.toString(),
        HOST: "127.0.0.1",
        NODE_ENV: "production",
        PORT: "3001",
      });
      const backend = await startBackendProcess({
        closeResources: prepared.closeResources,
        listen: { host: "127.0.0.1", port: 0 },
        requestListener: prepared.requestListener,
      });
      try {
        const baseUrl = `http://${backend.address.address}:${backend.address.port}`;
        const health = await fetch(`${baseUrl}/health`);
        const pageResponse = await fetch(
          `${baseUrl}/v1/catalog?page=1&pageSize=100`,
        );
        const page = (await pageResponse.json()) as {
          readonly items: readonly { readonly id: string }[];
          readonly total: number;
        };
        expect(health.status).toBe(200);
        expect(pageResponse.status).toBe(200);
        expect(page.total).toBe(28);
        expect(page.items).toHaveLength(28);
        for (const mapping of result.catalogIdMap) {
          const detail = await fetch(
            `${baseUrl}/v1/catalog/${mapping.catalogId}`,
          );
          expect(detail.status).toBe(200);
          const actualDetail = (await detail.json()) as {
            id: string;
            title: string;
            kind: string;
          };
          const expected = actual.envelope.catalogRows.find(
            ({ catalogImportId }) =>
              String(catalogImportId) === mapping.catalogImportId,
          );
          expect(expected).toBeDefined();
          expect(actualDetail).toMatchObject({
            id: mapping.catalogId,
            title: expected!.title,
            kind: expected!.catalogKind,
          });
        }
      } finally {
        await backend.shutdown();
      }
    },
  );
});
