import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import { runCommunityMigrations } from "@moya/community-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  assertSyntheticTestDatabaseUrl,
  requireSyntheticTestDatabaseUrl,
} from "./synthetic-test-database.js";

/**
 * Agent Connections V1 (Issue #141) — one human and one registered client hold
 * ONE connection, however many renders ask for it at once.
 *
 * WHY THIS FILE EXISTS. The Owner walkthrough produced two rows for one
 * (human, client) pair, one millisecond apart:
 *
 *   awaiting-consent  artvenn-cursor-readonly  payload-user-1  ...17:23:30.418Z
 *   authorized        artvenn-cursor-readonly  payload-user-1  ...17:23:30.419Z
 *
 * `resolveConnection` is read-then-create with nothing between the read and
 * the write, and the consent REVIEW PAGE calls it during a server render — a
 * shape Next will happily perform twice, because it prefetches links. Two
 * renders both read "no connection" and both insert one.
 *
 * WHY IT IS NOT COSMETIC. `findForClient` refuses an ambiguous pair rather
 * than picking the newest — deliberately, because silently choosing is how a
 * revoked connection gets bypassed by a duplicate nobody noticed. So the
 * second row does not merely add a card to the Owner's page: it WEDGES that
 * pair. Every later consent for it reads two rows and refuses, and no
 * disconnect in the UI can clear the row the page is not showing.
 *
 * It is its own file because it needs its own concurrency, and because
 * `community-postgres.test.ts` belongs to another session.
 */

const adminUrl = requireSyntheticTestDatabaseUrl();
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const disposableTarget = (await import(
  new URL("../../../scripts/disposable-test-target.mjs", import.meta.url).href
)) as {
  disposableTestTargetProbeSql: string;
  assertDisposableTestTarget: (rows: unknown, database: string) => string;
  isTargetCategory: (message: unknown) => boolean;
  remedyFor: (category: string) => string;
};
const migrationsDirectory = path.join(
  repositoryRoot,
  "database",
  "community-migrations",
);

/**
 * A DATABASE OF ITS OWN, following `work-publishing-upgrade.test.ts`.
 *
 * This file is the one place that deliberately races two writers, and the
 * agent-connection suites registered by `community-postgres.test.ts` clean up
 * with unqualified `DELETE FROM community.agent_connections`. `vitest run
 * integration/postgres` runs FILES in parallel, so sharing one database makes
 * the two interfere in both directions -- measured: three runs of the pair,
 * the third failed an authorization-flow case in the other file. Isolation is
 * therefore a correctness requirement here, not tidiness.
 */
const DEDICATED = /^agentconn_dup_[0-9a-f]{12}_synthetic_test$/;
const dedicatedName = `agentconn_dup_${randomBytes(6).toString("hex")}_synthetic_test`;
if (!DEDICATED.test(dedicatedName)) throw new Error("Unexpected name");
const targetUrl = (() => {
  const url = new URL(adminUrl);
  url.pathname = `/${dedicatedName}`;
  // Asserted for its refusal, not its return: it answers the database NAME.
  assertSyntheticTestDatabaseUrl(url.toString());
  return url.toString();
})();

const administration = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: adminUrl }),
);
let pool: ReturnType<typeof createPostgresPool>;

/**
 * CREATE DATABASE is authority the other suites never use, so it is refused
 * unless the connected database carries the disposable marker and the role may
 * create databases there. Fail closed, with the remedy.
 */
const createDedicatedDatabase = async () => {
  const probe = await administration.query(
    disposableTarget.disposableTestTargetProbeSql,
  );
  try {
    disposableTarget.assertDisposableTestTarget(
      probe.rows,
      assertSyntheticTestDatabaseUrl(adminUrl),
    );
  } catch (error) {
    const category = error instanceof Error ? error.message : "";
    throw new Error(
      `The duplicate-connection regression creates a temporary database, and only beside a marked disposable test database. ${
        disposableTarget.isTargetCategory(category)
          ? disposableTarget.remedyFor(category)
          : "The disposable target probe failed."
      }`,
      { cause: error },
    );
  }
  const role = await administration.query<{ allowed: boolean }>(
    "SELECT rolcreatedb OR rolsuper AS allowed FROM pg_roles WHERE rolname = current_user",
  );
  if (role.rows[0]?.allowed !== true)
    throw new Error(
      "The duplicate-connection regression creates and drops one temporary database, so the TEST_DATABASE_URL role needs CREATEDB on the disposable test server.",
    );
  await administration.query(`CREATE DATABASE ${dedicatedName}`);
  pool = createPostgresPool(parsePostgresConfig({ DATABASE_URL: targetUrl }));
};

/** A fresh human per case: two cases sharing one would share a connection. */
const human = () => `payload-user-dup-${randomBytes(6).toString("hex")}`;
const CLIENT_ID = "artvenn-duplicate-regression";
/**
 * A SECOND registered client, present only so the two isolation properties
 * can be asserted directly. The index is on the PAIR; a guard that drifted to
 * one-connection-per-human, or to matching on the descriptive family both of
 * these share, would still satisfy every case above and break a real Owner who
 * runs two integrations.
 */
const SECOND_CLIENT_ID = "artvenn-duplicate-regression-b";
const clients = JSON.stringify([
  {
    clientId: CLIENT_ID,
    family: "cursor",
    label: "Duplicate regression client",
    redirectUris: ["http://127.0.0.1:34742/callback"],
  },
  {
    clientId: SECOND_CLIENT_ID,
    // Deliberately the SAME family as the first: family is a descriptive slug
    // and must never be part of the uniqueness key.
    family: "cursor",
    label: "Duplicate regression client B",
    redirectUris: ["http://127.0.0.1:34743/callback"],
  },
]);
const environment = {
  NODE_ENV: "development",
  AGENT_CONNECTIONS_ENABLED: "true",
  AGENT_CONSENT_DATABASE_URL: targetUrl,
  AGENT_AUTHORIZATION_ISSUER: "http://127.0.0.1:34741",
  AGENT_AUTHORIZATION_RESOURCE: "http://admin.localhost:3442/api/mcp",
  AGENT_AUTHORIZATION_CLIENTS: clients,
  CMS_ENVIRONMENT: "development",
} as unknown as NodeJS.ProcessEnv;

type Runtime = NonNullable<
  ReturnType<typeof import("admin/agent-connections").createConsentRuntime>
>;
let runtime: Runtime;
let resolveConnection: typeof import("admin/agent-connections").resolveConnection;

const rowsFor = async (humanAccountId: string, oauthClientId = CLIENT_ID) =>
  (
    await pool.query<{
      id: string;
      status: string;
      generation: number;
      revoked_at: string | null;
      current_grant_id: string | null;
    }>(
      `SELECT id, status, generation, revoked_at, current_grant_id
         FROM community.agent_connections
        WHERE human_account_id=$1 AND oauth_client_id=$2
        ORDER BY created_at, id`,
      [humanAccountId, oauthClientId],
    )
  ).rows;

beforeAll(async () => {
  await createDedicatedDatabase();
  await runCommunityMigrations(pool, migrationsDirectory);
  const admin = await import("admin/agent-connections");
  const built = admin.createConsentRuntime(environment);
  expect(built).not.toBeNull();
  runtime = built as Runtime;
  resolveConnection = admin.resolveConnection;
}, 60000);

afterAll(async () => {
  await runtime?.close();
  if (pool !== undefined) await closePostgresPool(pool);
  // The whole database goes, so there is nothing to clean up inside it.
  if (DEDICATED.test(dedicatedName))
    await administration.query(
      `DROP DATABASE IF EXISTS ${dedicatedName} WITH (FORCE)`,
    );
  await closePostgresPool(administration);
});

describe("one human, one client, one connection", () => {
  it("converges on a single row when two renders resolve at once", async () => {
    const owner = human();

    // The two concurrent renders. A prefetch of the review link plus the real
    // navigation is the production shape; this is that shape with the
    // framework taken out, so the assertion is about `resolveConnection` and
    // not about Next.
    const [first, second] = await Promise.all([
      resolveConnection(runtime, owner, CLIENT_ID),
      resolveConnection(runtime, owner, CLIENT_ID),
    ]);

    const rows = await rowsFor(owner);
    expect(rows).toHaveLength(1);
    // Both callers must hold the row that exists. A guard that created one row
    // but handed the loser a phantom id would move the defect rather than fix
    // it: the loser is what arms the interaction the human then approves.
    expect(first.id).toBe(second.id);
    expect(rows[0]?.id).toBe(first.id);
  });

  it("refuses a second row for the pair in the database itself", async () => {
    const owner = human();
    const connection = await resolveConnection(runtime, owner, CLIENT_ID);

    // Not through the store: through raw SQL, because a guard that lives only
    // in application code is a guard two processes can still step around.
    await expect(
      pool.query(
        `INSERT INTO community.agent_connections
           (id, human_account_id, client_family, oauth_client_id, environment,
            principal_label, preset, status)
         VALUES ($1,$2,'cursor',$3,'development',$4,'read-only','awaiting-consent')`,
        [
          `conn-${randomBytes(16).toString("hex")}`,
          owner,
          CLIENT_ID,
          `agent-cursor-${randomBytes(6).toString("hex")}`,
        ],
      ),
    ).rejects.toMatchObject({ code: "23505" });

    expect(await rowsFor(owner)).toHaveLength(1);
    expect((await rowsFor(owner))[0]?.id).toBe(connection.id);
  });

  it("reuses the same row when a revoked connection reconnects", async () => {
    const owner = human();
    const opened = await resolveConnection(runtime, owner, CLIENT_ID);
    await runtime.authority.revoke(opened.id, new Date().toISOString());
    // The state to preserve is the one AFTER the revoke, not after the open:
    // revoking legitimately bumps the generation, and it is the RESOLVE that
    // must leave everything alone.
    const revoked = (await rowsFor(owner))[0];
    expect(revoked?.status).toBe("revoked");

    // The reconnect path keeps the revoked row and resolves back to it. If a
    // uniqueness guard ever forced a SECOND row here, reconnect would be the
    // thing it broke, so this is the case that says it does not.
    const again = await resolveConnection(runtime, owner, CLIENT_ID);
    expect(again.id).toBe(opened.id);
    const rows = await rowsFor(owner);
    expect(rows).toHaveLength(1);

    // AND IT IS STILL REVOKED. Reusing the row is only half the property:
    // resolving is opening, not authorizing, so a revoked connection that came
    // back from here with its status, generation or grant restored would be an
    // access grant nobody consented to. Asserting only the id would pass for a
    // guard that quietly reactivated the row.
    expect(again.status).toBe("revoked");
    expect(rows[0]?.status).toBe("revoked");
    expect(rows[0]?.revoked_at).toEqual(revoked?.revoked_at);
    expect(String(rows[0]?.generation)).toBe(String(revoked?.generation));
    expect(rows[0]?.current_grant_id).toBe(revoked?.current_grant_id ?? null);
  });

  it("hands back a revoked row on conflict without reviving it", async () => {
    // `resolveConnection` normally returns a revoked row from its EARLY path,
    // so the case above never reaches the conflict branch. This one calls the
    // store directly, which is the only way to exercise what `createForClient`
    // does when the pair is already taken -- the path a second render takes if
    // the row was revoked between its read and its insert.
    //
    // It is also the assertion that fails if `ON CONFLICT DO NOTHING` is ever
    // "improved" into a `DO UPDATE`: that would hand an opener a reactivated
    // connection, which is access nobody consented to.
    const owner = human();
    const opened = await resolveConnection(runtime, owner, CLIENT_ID);
    await runtime.authority.revoke(opened.id, new Date().toISOString());
    const revoked = (await rowsFor(owner))[0];
    expect(revoked?.status).toBe("revoked");

    const handedBack = await runtime.connections.createForClient({
      id: `conn-${randomBytes(16).toString("hex")}`,
      principalLabel: `agent-cursor-${randomBytes(6).toString("hex")}`,
      humanAccountId: owner,
      client: "cursor",
      oauthClientId: CLIENT_ID,
      environment: "development",
      preset: "read-only",
      status: "awaiting-consent",
      generation: 0,
      revokedAt: null,
      consentedAt: null,
    });

    expect(handedBack?.connection.id).toBe(opened.id);
    expect(handedBack?.connection.status).toBe("revoked");
    const after = await rowsFor(owner);
    expect(after).toHaveLength(1);
    expect(after[0]?.status).toBe("revoked");
    expect(after[0]?.revoked_at).toEqual(revoked?.revoked_at);
    expect(String(after[0]?.generation)).toBe(String(revoked?.generation));
  });

  it("keeps one human's two registered clients independent", async () => {
    // Property A. The pair is the key, so the same human running two
    // integrations holds two connections, and each resolves back to its own.
    const owner = human();
    const first = await resolveConnection(runtime, owner, CLIENT_ID);
    const second = await resolveConnection(runtime, owner, SECOND_CLIENT_ID);

    expect(second.id).not.toBe(first.id);
    expect(await rowsFor(owner)).toHaveLength(1);
    expect(await rowsFor(owner, SECOND_CLIENT_ID)).toHaveLength(1);
    expect((await resolveConnection(runtime, owner, CLIENT_ID)).id).toBe(
      first.id,
    );
    expect((await resolveConnection(runtime, owner, SECOND_CLIENT_ID)).id).toBe(
      second.id,
    );
  });

  it("refuses a duplicate-bearing database and destroys nothing", async () => {
    // The migration's own guard, run against a database that already carries
    // the pair it forbids -- the shape an operator upgrading from before this
    // index actually has. Choosing which of two rows to keep is not a
    // migration's decision, because one of them may hold the live grant.
    //
    // This drops the index to BUILD that state and restores it in `finally`,
    // so a failure here cannot leave the target without its guard.
    const owner = human();
    const sql = await readFile(
      path.join(
        migrationsDirectory,
        "20260921010000_agent_connection_one_per_client.sql",
      ),
      "utf8",
    );
    const insert = async (id: string) =>
      pool.query(
        `INSERT INTO community.agent_connections
           (id, human_account_id, client_family, oauth_client_id, environment,
            principal_label, preset, status)
         VALUES ($1,$2,'cursor',$3,'development',$4,'read-only','awaiting-consent')`,
        [
          id,
          owner,
          CLIENT_ID,
          `agent-cursor-${randomBytes(6).toString("hex")}`,
        ],
      );
    const first = `conn-${randomBytes(16).toString("hex")}`;
    const second = `conn-${randomBytes(16).toString("hex")}`;

    try {
      await pool.query(
        "DROP INDEX community.agent_connections_human_client_unique",
      );
      await insert(first);
      await insert(second);
      expect(await rowsFor(owner)).toHaveLength(2);

      await expect(pool.query(sql)).rejects.toMatchObject({
        message: expect.stringContaining("more than one row"),
      });

      // NOTHING WAS TOUCHED. Both rows are still there, and the operator still
      // has the choice the migration refused to make for them.
      const survivors = await rowsFor(owner);
      expect(survivors).toHaveLength(2);
      expect(survivors.map((row) => row.id).sort()).toEqual(
        [first, second].sort(),
      );
    } finally {
      await pool.query(
        "DELETE FROM community.agent_connections WHERE id = ANY($1)",
        [[first, second]],
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS agent_connections_human_client_unique
           ON community.agent_connections (human_account_id, oauth_client_id)`,
      );
    }

    // And the same migration succeeds once the duplicate is gone, which is the
    // supported upgrade path an operator reaches after resolving it.
    await pool.query(
      "DROP INDEX community.agent_connections_human_client_unique",
    );
    await pool.query(sql);
    expect(
      (
        await pool.query(
          `SELECT 1 FROM pg_indexes
            WHERE schemaname='community'
              AND indexname='agent_connections_human_client_unique'`,
        )
      ).rowCount,
    ).toBe(1);
  });

  it("keeps two humans on one registered client independent", async () => {
    // Property B, the other direction of the same key.
    const one = human();
    const other = human();
    const mine = await resolveConnection(runtime, one, CLIENT_ID);
    const theirs = await resolveConnection(runtime, other, CLIENT_ID);

    expect(theirs.id).not.toBe(mine.id);
    expect(await rowsFor(one)).toHaveLength(1);
    expect(await rowsFor(other)).toHaveLength(1);
    expect((await rowsFor(one))[0]?.id).toBe(mine.id);
    expect((await rowsFor(other))[0]?.id).toBe(theirs.id);
  });
});
