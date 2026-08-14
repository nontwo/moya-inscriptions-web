import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyCatalogImport,
  createCatalogImportDryRun,
  parseCatalogImportCsvBundle,
} from "@moya/catalog-importer";
import {
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
  runMigrations,
} from "@moya/catalog-postgres";
import { catalogIdSchema } from "@moya/contracts/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

beforeAll(async () => {
  await administrationPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await administrationPool.query(`CREATE SCHEMA ${schema}`);
  await runMigrations(pool, migrationsDirectory);
  bundleDirectory = await mkdtemp(path.join(tmpdir(), "moya-p5-import-"));
  await Promise.all([
    writeFile(
      path.join(bundleDirectory, "00_manifest.csv"),
      "importContractVersion\ncatalog-import/v1\n",
    ),
    writeFile(
      path.join(bundleDirectory, "catalog.csv"),
      [
        "catalogImportId,sourceId,catalogId,title,catalogKind,dynasty,dynastyState,dateText,dateTextState,province,provinceState,prefecture,prefectureState,county,countyState,currentLocation,currentLocationState,currentCustodian,currentCustodianState,description,descriptionState,ownerNote",
        "item-000001,src_test_p5_001,,测试碑刻,inscription,唐,VALUE,,,,,,,,,,,,,测试说明,VALUE,",
      ].join("\n") + "\n",
    ),
    writeFile(
      path.join(bundleDirectory, "aliases.csv"),
      "catalogImportId,alias,aliasType\nitem-000001,测试旧称,historical\n",
    ),
    writeFile(
      path.join(bundleDirectory, "provenance.csv"),
      "catalogImportId,sourceId,sourceTitle,sourceTypeRaw,sourceUrl,sourceNote\nitem-000001,src_test_p5_001,测试碑刻,official-test,https://example.invalid/source,\n",
    ),
  ]);
});

afterAll(async () => {
  await closePostgresPool(pool);
  await administrationPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await closePostgresPool(administrationPool);
  await rm(bundleDirectory, { recursive: true, force: true });
});

describe.sequential("catalog-import/v1 PostgreSQL apply", () => {
  it("parses, rolls back atomically, applies once, and replays idempotently", async () => {
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const decidedAt = "2026-08-14T13:35:16.371Z";
    const dryRun = await createCatalogImportDryRun(pool, parsed, decidedAt);
    expect(dryRun).toMatchObject({
      state: "PASSED",
      applyReady: true,
      findings: [],
      resultCounts: { add: 1, update: 0, conflict: 0, error: 0 },
    });
    const approval = {
      importContractVersion: "catalog-import/v1" as const,
      canonicalInputSha256: dryRun.canonicalInputSha256,
      dryRunResultSha256: dryRun.dryRunResultSha256,
      state: "APPROVED" as const,
      approvedFindingIds: [],
      decidedBy: "OWNER / owner — validation only",
      decidedAt,
    };
    const common = {
      parsed,
      dryRun,
      approval,
      validationContext: {
        validationOnly: true as const,
        nonProduction: true as const,
        disposableDatabase: true as const,
        publicationApproval: false as const,
        reusableForProduction: false as const,
        ownerInstructionReference: "test validation authorization",
      },
      appliedAt: decidedAt,
    };

    await expect(
      applyCatalogImport(pool, {
        ...common,
        operationId: "p5-test-failed",
        failureAfterCatalogRows: 1,
      }),
    ).rejects.toThrow("Synthetic mid-transaction failure");
    await expect(
      pool.query("SELECT COUNT(*)::integer AS count FROM catalog_entries"),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });

    const first = await applyCatalogImport(pool, {
      ...common,
      operationId: "p5-test-applied",
    });
    const replay = await applyCatalogImport(pool, {
      ...common,
      operationId: "p5-test-applied",
    });
    expect(first).toMatchObject({ status: "APPLIED", created: 1, updated: 0 });
    expect(replay).toMatchObject({
      status: "ALREADY_APPLIED",
      created: 1,
      updated: 0,
    });
    const state = await pool.query(
      `SELECT
        (SELECT COUNT(*)::integer FROM catalog_entries) AS entries,
        (SELECT COUNT(*)::integer FROM catalog_aliases) AS aliases,
        (SELECT COUNT(*)::integer FROM catalog_import_sources) AS sources,
        (SELECT COUNT(*)::integer FROM catalog_import_operations) AS operations,
        (SELECT COUNT(*)::integer FROM catalog_import_operation_items) AS items`,
    );
    expect(state.rows).toEqual([
      { entries: 1, aliases: 1, sources: 1, operations: 1, items: 1 },
    ]);
  });

  it("fails closed on an existing SourceId rebound", async () => {
    const parsed = await parseCatalogImportCsvBundle(bundleDirectory);
    const conflictParsed = {
      ...parsed,
      envelope: {
        ...parsed.envelope,
        catalogRows: parsed.envelope.catalogRows.map((row) => ({
          ...row,
          catalogId: catalogIdSchema.parse("validation-catalog-conflict"),
        })),
      },
    };
    const dryRun = await createCatalogImportDryRun(
      pool,
      conflictParsed,
      "2026-08-14T13:35:17.371Z",
    );
    expect(dryRun).toMatchObject({
      state: "FAILED",
      applyReady: false,
      resultCounts: { identityConflict: 1 },
      applyBlockers: ["IDENTITY_CONFLICT"],
    });
  });
});
