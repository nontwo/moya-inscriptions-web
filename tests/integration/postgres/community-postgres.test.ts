import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CommunitySessionService } from "@moya/api";
import {
  createBackendApplication,
  createDevelopmentCatalogFixtureQueryPort,
  startBackendProcess,
} from "@moya/backend-runtime";
import {
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import {
  CommunitySchemaNotReadyError,
  PostgresCommunityIdentityAdapter,
  runCommunityMigrations,
  verifyCommunityMigrationLedger,
} from "@moya/community-postgres";
import {
  developmentSessionSchema,
  publicUserProfileSchema,
} from "@moya/contracts/schemas";
import { UnconfiguredStorageUrlResolver } from "@moya/image";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { BackendProcessHandle } from "@moya/backend-runtime";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl === undefined) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests");
}

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationsDirectory = path.join(
  repositoryRoot,
  "database",
  "community-migrations",
);
const seedFile = path.join(
  repositoryRoot,
  "infra",
  "development",
  "community-development-accounts.sql",
);
const pool = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: testDatabaseUrl }),
);
const processes = new Set<BackendProcessHandle>();
const hour = 60 * 60 * 1_000;

const createService = (
  options: { readonly ttlMs?: number; readonly start?: Date } = {},
) => {
  let now = options.start ?? new Date();
  const service = new CommunitySessionService(
    new PostgresCommunityIdentityAdapter(pool),
    { clock: () => now, sessionTtlMs: options.ttlMs ?? 24 * hour },
  );
  return {
    service,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
};

const startHttp = async (
  nodeEnv: "development" | "production",
): Promise<string> => {
  const handle = await startBackendProcess({
    listen: { host: "127.0.0.1", port: 0 },
    requestListener: createBackendApplication({
      nodeEnv,
      communityIdentityPort: new PostgresCommunityIdentityAdapter(pool),
      ...(nodeEnv === "production"
        ? {
            catalogQueryPort: createDevelopmentCatalogFixtureQueryPort(),
            storageUrlResolver: new UnconfiguredStorageUrlResolver(),
          }
        : {}),
    }),
  });
  processes.add(handle);
  return `http://${handle.address.address}:${handle.address.port}`;
};

beforeAll(async () => {
  // Other suites in this synthetic database only verify the community ledger,
  // so the family is applied idempotently here (never dropped) and the rows
  // are reset before the Development accounts are seeded.
  await runCommunityMigrations(pool, migrationsDirectory);
  expect(await runCommunityMigrations(pool, migrationsDirectory)).toEqual([]);
  await pool.query(
    "DELETE FROM community.sessions; DELETE FROM community.development_accounts; DELETE FROM community.public_users",
  );
  await pool.query(await readFile(seedFile, "utf8"));
});

afterEach(async () => {
  await Promise.all(
    [...processes].map(async (handle) => {
      await handle.shutdown();
      processes.delete(handle);
    }),
  );
  await pool.query("DELETE FROM community.sessions");
  await pool.query(
    "UPDATE community.public_users SET status = 'active', updated_at = CURRENT_TIMESTAMP",
  );
});

afterAll(async () => {
  await pool.end();
});

describe("community PostgreSQL identity and sessions", () => {
  it("seeds the Development accounts as real public users with Chinese display names", async () => {
    const users = await pool.query<{
      handle: string;
      display_name: string;
      status: string;
    }>(
      `SELECT u.handle, u.display_name, u.status
       FROM community.public_users u
       JOIN community.development_accounts d ON d.user_id = u.id
       ORDER BY u.handle`,
    );
    expect(users.rows).toEqual([
      { handle: "dev-user-01", display_name: "拓片爱好者", status: "active" },
      { handle: "dev-user-02", display_name: "书法学徒", status: "active" },
      { handle: "dev-user-03", display_name: "石刻研究者", status: "active" },
    ]);
    // Re-seeding is idempotent.
    await pool.query(await readFile(seedFile, "utf8"));
    expect(
      (
        await pool.query(
          "SELECT COUNT(*)::int AS n FROM community.public_users",
        )
      ).rows[0],
    ).toEqual({ n: 3 });
  });

  it("verifies the ledger read-only and fails closed when it is missing", async () => {
    await expect(verifyCommunityMigrationLedger(pool)).resolves.toBeUndefined();
    await pool.query("BEGIN");
    try {
      await pool.query("DELETE FROM community.schema_migrations");
      await expect(verifyCommunityMigrationLedger(pool)).rejects.toBeInstanceOf(
        CommunitySchemaNotReadyError,
      );
    } finally {
      await pool.query("ROLLBACK");
    }
  });

  it("issues, validates, expires and revokes sessions against real rows", async () => {
    const { service, advance } = createService({ ttlMs: 2 * hour });
    const session = await service.signInDevelopmentAccount("dev-user-01");
    expect(developmentSessionSchema.parse(session)).toEqual(session);
    expect(session?.profile.displayName).toBe("拓片爱好者");

    const stored = await pool.query<{
      token_hash: string;
      user_id: string;
      revoked_at: Date | null;
    }>("SELECT token_hash, user_id, revoked_at FROM community.sessions");
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.rows[0]?.token_hash).not.toBe(session?.token);
    expect(stored.rows[0]?.user_id).toBe(session?.profile.id);

    expect(await service.identify(session!.token)).toEqual(session?.profile);
    advance(2 * hour);
    expect(await service.identify(session!.token)).toBeNull();

    const fresh = await service.signInDevelopmentAccount("dev-user-02");
    expect(await service.signOut(fresh!.token)).toBe(true);
    expect(await service.identify(fresh!.token)).toBeNull();
    expect(await service.signOut(fresh!.token)).toBe(false);
    const revoked = await pool.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM community.sessions WHERE user_id = $1",
      [fresh?.profile.id],
    );
    expect(revoked.rows[0]?.revoked_at).toBeInstanceOf(Date);
  });

  it("isolates accounts and refuses suspended or non-Development users", async () => {
    const { service } = createService();
    const first = await service.signInDevelopmentAccount("dev-user-01");
    const second = await service.signInDevelopmentAccount("dev-user-02");
    expect((await service.identify(first!.token))?.handle).toBe("dev-user-01");
    expect((await service.identify(second!.token))?.handle).toBe("dev-user-02");
    expect(await service.signOut(first!.token)).toBe(true);
    expect((await service.identify(second!.token))?.handle).toBe("dev-user-02");

    await pool.query(
      "UPDATE community.public_users SET status = 'suspended' WHERE handle = 'dev-user-02'",
    );
    expect(await service.identify(second!.token)).toBeNull();
    expect(await service.signInDevelopmentAccount("dev-user-02")).toBeNull();

    await pool.query(
      `INSERT INTO community.public_users (id, handle, display_name)
       VALUES ('user-ffffffffffffffffffffffffffffffff', 'member-99', '拓片爱好者')`,
    );
    expect(await service.signInDevelopmentAccount("member-99")).toBeNull();
    await pool.query(
      "DELETE FROM community.public_users WHERE handle = 'member-99'",
    );
  });

  it("enforces the identity constraints in PostgreSQL", async () => {
    for (const values of [
      ["user-not-opaque", "dev-user-09", "名字"],
      ["user-0123456789abcdef0123456789abcdef", "Dev-User-09", "名字"],
      ["user-0123456789abcdef0123456789abcdef", "dev-user-09", " 名字"],
      ["user-0123456789abcdef0123456789abcdef", "dev-user-01", "重复 handle"],
    ])
      await expect(
        pool.query(
          "INSERT INTO community.public_users (id, handle, display_name) VALUES ($1, $2, $3)",
          values,
        ),
      ).rejects.toThrow();
  });

  it("serves the Development lifecycle over HTTP and excludes it from production composition", async () => {
    const development = await startHttp("development");
    const signedIn = await fetch(`${development}/v1/development/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handle: "dev-user-03" }),
    });
    expect(signedIn.status).toBe(201);
    const session = developmentSessionSchema.parse(await signedIn.json());
    const me = await fetch(`${development}/v1/me`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(me.status).toBe(200);
    expect(publicUserProfileSchema.parse(await me.json())).toEqual(
      session.profile,
    );

    const production = await startHttp("production");
    expect(
      (
        await fetch(`${production}/v1/development/sign-in`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle: "dev-user-03" }),
        })
      ).status,
    ).toBe(404);
    // A session issued elsewhere still identifies through the shared store.
    const productionMe = await fetch(`${production}/v1/me`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(productionMe.status).toBe(200);
    expect(
      (
        await fetch(`${development}/v1/development/sign-out`, {
          method: "POST",
          headers: { authorization: `Bearer ${session.token}` },
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await fetch(`${production}/v1/me`, {
          headers: { authorization: `Bearer ${session.token}` },
        })
      ).status,
    ).toBe(401);
  });
});
