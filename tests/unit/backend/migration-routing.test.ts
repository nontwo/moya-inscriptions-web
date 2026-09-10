import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertMigrationTarget,
  migrationTargetProbeSql,
  runMigrations,
} from "@moya/catalog-postgres";
import { guardCmsMigrationAdapter } from "admin/migration-guard";
import { postgresAdapter } from "@payloadcms/db-postgres";
import { afterEach, describe, expect, it, vi } from "vitest";

const scriptURL = new URL("../../../scripts/migrate.mjs", import.meta.url);
const { migrationPlan } = (await import(scriptURL.href)) as {
  migrationPlan: (
    environment: Record<string, string | undefined>,
    args?: string[],
  ) => { source: string; variable: string; args: string[] };
};
const environment = {
  DATABASE_URL: "postgresql://synthetic_reader@127.0.0.1:54330/yoyi_dev",
  CMS_DATABASE_URL: "postgresql://synthetic_cms@127.0.0.1:54330/yoyi_dev",
};
afterEach(() => vi.unstubAllEnvs());

describe("migration source routing", () => {
  it("selects only one migration family and its own runtime connection", () => {
    expect(
      migrationPlan({ ...environment, MOYA_CONTENT_SOURCE: "legacy" }),
    ).toEqual({
      source: "legacy",
      variable: "DATABASE_URL",
      command: "pnpm",
      args: ["--filter", "@moya/catalog-postgres", "migrate"],
    });
    expect(
      migrationPlan({ ...environment, MOYA_CONTENT_SOURCE: "payload" }),
    ).toEqual({
      source: "payload",
      variable: "CMS_DATABASE_URL",
      command: "pnpm",
      args: ["--filter", "admin", "exec", "payload", "migrate"],
    });
    for (const source of [undefined, "", "unknown"])
      expect(() =>
        migrationPlan({ ...environment, MOYA_CONTENT_SOURCE: source }),
      ).toThrow("explicitly");
  });
  it("the actual cms:migrate CLI rejects a legacy source before importing or connecting a driver", () => {
    const adminDirectory = fileURLToPath(
      new URL("../../../apps/admin/", import.meta.url),
    );
    const command = (
      JSON.parse(
        readFileSync(
          new URL("../../../apps/admin/package.json", import.meta.url),
          "utf8",
        ),
      ) as { scripts: Record<string, string> }
    ).scripts["cms:migrate"]!;
    const [executable, ...args] = command.split(" ");
    expect(executable).toBe("node");
    const result = spawnSync(process.execPath, args, {
      cwd: adminDirectory,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        MOYA_CONTENT_SOURCE: "legacy",
        ...environment,
      },
      encoding: "utf8",
      timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe(
      "Migration configuration, target check or execution failed\n",
    );
    expect(result.stdout).toBe("");
    expect(result.stderr).not.toContain(environment.DATABASE_URL);
  });
  it("constrains development migrations to the isolated local database with distinct roles", () => {
    const dev = { ...environment, MOYA_CONTENT_SOURCE: "payload" };
    expect(() => migrationPlan(dev, ["--development"])).not.toThrow();
    for (const CMS_DATABASE_URL of [
      environment.DATABASE_URL,
      "postgresql://synthetic_cms@synthetic.invalid/yoyi_dev",
      "postgresql://synthetic_cms@127.0.0.1:54330/stage_a",
      `${environment.CMS_DATABASE_URL}?host=synthetic.invalid`,
    ])
      expect(() =>
        migrationPlan({ ...dev, CMS_DATABASE_URL }, ["--development"]),
      ).toThrow();
    expect(() =>
      migrationPlan({ ...dev, MOYA_CONTENT_SOURCE: "legacy" }, [
        "--development",
      ]),
    ).toThrow();
  });
  it("fails closed on missing target metadata and either schema collision", () => {
    for (const source of ["legacy", "payload"] as const) {
      expect(() => assertMigrationTarget([], source)).toThrow();
      expect(() =>
        assertMigrationTarget(
          [{ legacy_present: true, payload_present: true }],
          source,
        ),
      ).toThrow("other content source");
      expect(() =>
        assertMigrationTarget(
          [{ legacy_present: false, payload_present: false }],
          source,
        ),
      ).not.toThrow();
    }
    expect(() =>
      assertMigrationTarget(
        [{ legacy_present: false, payload_present: true }],
        "legacy",
      ),
    ).toThrow();
    expect(() =>
      assertMigrationTarget(
        [{ legacy_present: true, payload_present: false }],
        "payload",
      ),
    ).toThrow();
  });
  it("the legacy runner blocks a Payload target before any DDL", async () => {
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (statement: string) => {
        statements.push(statement);
        return {
          rows:
            statement === migrationTargetProbeSql
              ? [{ legacy_present: false, payload_present: true }]
              : [],
        };
      }),
      release: vi.fn(),
    };
    const pool = { connect: async () => client } as unknown as Parameters<
      typeof runMigrations
    >[0];
    await expect(
      runMigrations(
        pool,
        fileURLToPath(new URL("../../../database/migrations", import.meta.url)),
      ),
    ).rejects.toThrow("other content source");
    expect(statements.join("\n")).not.toMatch(
      /\b(?:CREATE|ALTER|DROP|INSERT)\b/,
    );
    expect(client.release).toHaveBeenCalledOnce();
  });
  it("guards the adapter method that the official Payload CLI actually calls, before ledger DDL", async () => {
    const original = vi.fn(async () => {});
    const query = vi.fn(async () => ({
      rows: [{ legacy_present: true, payload_present: false }],
    }));
    const db = {
      pool: { query },
      migrate: original,
      migrateDown: original,
      migrateFresh: original,
      migrateRefresh: original,
      migrateReset: original,
    };
    const adapter = guardCmsMigrationAdapter({
      init: () => db,
    } as unknown as ReturnType<typeof postgresAdapter>);
    const guarded = adapter.init({} as Parameters<typeof adapter.init>[0]);
    vi.stubEnv("MOYA_CONTENT_SOURCE", "legacy");
    await expect(guarded.migrate()).rejects.toThrow(
      "MOYA_CONTENT_SOURCE=payload",
    );
    expect(query).not.toHaveBeenCalled();
    vi.stubEnv("MOYA_CONTENT_SOURCE", "payload");
    await expect(guarded.migrate()).rejects.toThrow("other content source");
    expect(original).not.toHaveBeenCalled();
    query.mockResolvedValue({
      rows: [{ legacy_present: false, payload_present: true }],
    });
    await guarded.migrate();
    expect(original).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(migrationTargetProbeSql);
  });
  it("protects the installed official adapter without replacing its native migration implementation", async () => {
    const adapter = guardCmsMigrationAdapter(
      postgresAdapter({
        pool: { connectionString: environment.CMS_DATABASE_URL },
        push: false,
        disableCreateDatabase: true,
      }),
    );
    const db = adapter.init({ payload: {} } as Parameters<
      typeof adapter.init
    >[0]);
    vi.stubEnv("MOYA_CONTENT_SOURCE", "legacy");
    await expect(db.migrate()).rejects.toThrow("MOYA_CONTENT_SOURCE=payload");
    const query = vi.fn(async () => ({
      rows: [{ legacy_present: true, payload_present: false }],
    }));
    db.pool = { query } as unknown as typeof db.pool;
    vi.stubEnv("MOYA_CONTENT_SOURCE", "payload");
    await expect(db.migrate()).rejects.toThrow("other content source");
    expect(query).toHaveBeenCalledExactlyOnceWith(migrationTargetProbeSql);
  });
});
