import { fileURLToPath } from "node:url";

import { CommunityStoreUnavailableError } from "@moya/api";
import {
  CommunitySchemaNotReadyError,
  readCommunityMigrationFiles,
  requiredCommunityMigrations,
  verifyCommunityMigrationLedger,
} from "@moya/community-postgres";
import { describe, expect, it, vi } from "vitest";

type LedgerPool = Parameters<typeof verifyCommunityMigrationLedger>[0];

const poolWith = (query: (sql: string) => Promise<unknown>) => {
  const release = vi.fn();
  return {
    pool: {
      connect: async () => ({ query, release }),
    } as unknown as LedgerPool,
    release,
  };
};

const pgError = (code: string) => Object.assign(new Error(code), { code });

describe("community migration family", () => {
  it("pins the checked-in SQL files to the manifest checksums", async () => {
    const files = await readCommunityMigrationFiles(
      fileURLToPath(
        new URL("../../../database/community-migrations", import.meta.url),
      ),
    );
    expect(
      files.map(({ migrationId, filename, checksum }) => ({
        migrationId,
        filename,
        checksum,
      })),
    ).toEqual(requiredCommunityMigrations);
    expect(files.every((file) => file.sql.includes("community."))).toBe(true);
    expect(files.some((file) => /CREATE SCHEMA/i.test(file.sql))).toBe(false);
  });

  it("verifies the ledger read-only and releases the client", async () => {
    const statements: string[] = [];
    const { pool, release } = poolWith(async (sql) => {
      statements.push(sql);
      return {
        rows: requiredCommunityMigrations.map(
          ({ migrationId, filename, checksum }) => ({
            migration_id: migrationId,
            filename,
            checksum,
          }),
        ),
      };
    });
    await expect(verifyCommunityMigrationLedger(pool)).resolves.toBeUndefined();
    expect(statements).toHaveLength(1);
    expect(statements.join("\n")).not.toMatch(
      /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/,
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it.each(["42P01", "3F000", "42501"])(
    "fails closed as schema-not-ready when the ledger is missing or ungranted (%s)",
    async (code) => {
      const { pool, release } = poolWith(async () => {
        throw pgError(code);
      });
      await expect(verifyCommunityMigrationLedger(pool)).rejects.toBeInstanceOf(
        CommunitySchemaNotReadyError,
      );
      expect(release).toHaveBeenCalledOnce();
    },
  );

  it("reports a changed applied migration and connection loss distinctly", async () => {
    const { pool: tampered } = poolWith(async () => ({
      rows: requiredCommunityMigrations.map(({ migrationId, filename }) => ({
        migration_id: migrationId,
        filename,
        checksum: "0".repeat(64),
      })),
    }));
    await expect(verifyCommunityMigrationLedger(tampered)).rejects.toThrow(
      "immutable",
    );
    const { pool: down } = poolWith(async () => {
      throw pgError("57P01");
    });
    await expect(verifyCommunityMigrationLedger(down)).rejects.toBeInstanceOf(
      CommunityStoreUnavailableError,
    );
  });
});
