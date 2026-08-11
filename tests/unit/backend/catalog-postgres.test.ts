import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CatalogQueryUnavailableError } from "@moya/api";
import {
  asPostgresOperationError,
  catalogPageOffset,
  mapAliasRows,
  mapCatalogDetailRow,
  mapCatalogEntryRow,
  mapCitationRows,
  parseCatalogCount,
  parsePostgresConfig,
  readMigrationFiles,
  requiredMigrations,
} from "@moya/catalog-postgres";
import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationsDirectory = path.join(repositoryRoot, "database", "migrations");

describe("PostgreSQL configuration and availability", () => {
  it("parses the minimal DATABASE_URL without exposing it in the result shape", () => {
    const connectionString =
      "postgresql://moya:secret@127.0.0.1:5432/moya_test?sslmode=disable";
    expect(parsePostgresConfig({ DATABASE_URL: connectionString })).toEqual({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });
  });

  it.each([
    undefined,
    "",
    "not-a-url",
    "http://moya:secret@private-host/catalog",
    "postgresql://private-host/catalog",
    "postgresql://moya@private-host",
  ])("rejects invalid database config safely", (DATABASE_URL) => {
    let message = "";
    try {
      parsePostgresConfig({ DATABASE_URL });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("private-host");
  });

  it("classifies acquisition and known availability codes without masking programming errors", () => {
    const connectionFailure = new Error("private host");
    expect(
      asPostgresOperationError(connectionFailure, "connect"),
    ).toBeInstanceOf(CatalogQueryUnavailableError);
    expect(
      asPostgresOperationError(
        Object.assign(new Error("shutdown"), { code: "57P01" }),
        "query",
      ),
    ).toBeInstanceOf(CatalogQueryUnavailableError);
    const programmingError = Object.assign(new Error("bad SQL"), {
      code: "42601",
    });
    expect(asPostgresOperationError(programmingError, "query")).toBe(
      programmingError,
    );
  });
});

describe("PostgreSQL Catalog mapping and pagination", () => {
  it("uses exact BigInt arithmetic for the largest frozen safe page", () => {
    expect(catalogPageOffset(Number.MAX_SAFE_INTEGER, 100)).toBe(
      (BigInt(Number.MAX_SAFE_INTEGER) - 1n) * 100n,
    );
  });

  it("maps only explicit projection fields", () => {
    const row = {
      catalog_id: "test-catalog-001",
      kind: "inscription",
      title: "Test inscription",
      summary: "Summary",
      description: "Description",
      period_label: "唐",
      raw_source: "must remain private",
      review_state: "pending",
    };
    const aliases = mapAliasRows([
      { catalog_id: row.catalog_id, position: 0, alias: "Alias" },
    ]);
    const citations = mapCitationRows([
      {
        catalog_id: row.catalog_id,
        position: 0,
        label: "Public citation",
        citation: null,
        url: null,
      },
    ]);

    expect(mapCatalogEntryRow(row, aliases.get(row.catalog_id) ?? [])).toEqual({
      id: row.catalog_id,
      kind: row.kind,
      title: row.title,
      aliases: ["Alias"],
      summary: row.summary,
      periodLabel: row.period_label,
    });
    expect(
      JSON.stringify(
        mapCatalogDetailRow(row, aliases.get(row.catalog_id) ?? [], citations),
      ),
    ).not.toContain("raw_source");
  });

  it("accepts only safe PostgreSQL count strings", () => {
    expect(parseCatalogCount("0")).toBe(0);
    expect(parseCatalogCount("1658")).toBe(1658);
    expect(() => parseCatalogCount(1)).toThrow("Invalid PostgreSQL");
    expect(() =>
      parseCatalogCount((BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString()),
    ).toThrow("exceeds the Public contract");
  });
});

describe("migration manifest", () => {
  it("matches the immutable SQL file and SHA-256 checksum", async () => {
    const files = await readMigrationFiles(migrationsDirectory);
    expect(
      files.map((file) => ({
        migrationId: file.migrationId,
        filename: file.filename,
        checksum: file.checksum,
      })),
    ).toEqual(requiredMigrations);
  });

  it("rejects a changed applied migration source", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "moya-migration-"));
    const required = requiredMigrations[0];
    if (required === undefined) throw new Error("Required migration missing");
    const original = await readFile(
      path.join(migrationsDirectory, required.filename),
      "utf8",
    );
    await writeFile(
      path.join(directory, required.filename),
      `${original}\n-- forbidden mutation\n`,
      "utf8",
    );

    await expect(readMigrationFiles(directory)).rejects.toThrow(
      "manifest mismatch",
    );
  });
});
