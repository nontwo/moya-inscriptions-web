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
  PostgresCommunityCommentAdapter,
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
import type {
  CatalogCommentId,
  CatalogId,
  PublicUserId,
} from "@moya/contracts";

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
    "DELETE FROM community.catalog_comment_replies; DELETE FROM community.catalog_comments; DELETE FROM community.sessions; DELETE FROM community.development_accounts; DELETE FROM community.public_users",
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
  await pool.query("DELETE FROM community.catalog_comment_replies");
  await pool.query("DELETE FROM community.catalog_comments");
  await pool.query("DELETE FROM community.moderation_events");
  await pool.query("DELETE FROM community.sessions");
  await pool.query(
    "UPDATE community.publication_setting SET policy = 'PRE_MODERATION', updated_by = 'platform' WHERE id = 'publication'",
  );
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
    // One dedicated client keeps the uncommitted DELETE visible to the check.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM community.schema_migrations");
      const singleClientPool = {
        connect: async () => ({
          query: client.query.bind(client),
          release: () => undefined,
        }),
      } as unknown as typeof pool;
      await expect(
        verifyCommunityMigrationLedger(singleClientPool),
      ).rejects.toBeInstanceOf(CommunitySchemaNotReadyError);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    await expect(verifyCommunityMigrationLedger(pool)).resolves.toBeUndefined();
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

const seededAuthor = async (handle: string): Promise<PublicUserId> => {
  const rows = await pool.query<{ id: string }>(
    "SELECT id FROM community.public_users WHERE handle = $1",
    [handle],
  );
  const id = rows.rows[0]?.id;
  if (id === undefined) throw new Error("Seeded Development account missing");
  return id as PublicUserId;
};

const commentAdapter = () => new PostgresCommunityCommentAdapter(pool);

const commentId = (suffix: number): CatalogCommentId =>
  `comment-${suffix.toString(16).padStart(32, "0")}` as CatalogCommentId;

const publishedCatalogId = "catalog-integration-01" as CatalogId;

describe("community PostgreSQL comments and moderation", () => {
  it("stores comments and one level of replies with deterministic order", async () => {
    const port = commentAdapter();
    const author = await seededAuthor("dev-user-01");
    const second = await seededAuthor("dev-user-02");
    const base = new Date("2026-09-12T08:00:00.000Z");

    const root = await port.insertComment({
      id: commentId(1),
      catalogId: publishedCatalogId,
      authorId: author,
      text: "第一条评论",
      moderation: "visible",
      createdAt: base,
    });
    const older = await port.insertComment({
      id: commentId(2),
      catalogId: publishedCatalogId,
      authorId: second,
      text: "更早的评论",
      moderation: "visible",
      createdAt: new Date(base.getTime() - 60_000),
    });
    const replyOne = await port.insertReply({
      id: commentId(3),
      rootCommentId: root.id,
      authorId: second,
      text: "第一条回复",
      moderation: "visible",
      createdAt: new Date(base.getTime() + 1_000),
    });
    const replyTwo = await port.insertReply({
      id: commentId(4),
      rootCommentId: root.id,
      authorId: author,
      text: "第二条回复",
      moderation: "visible",
      createdAt: new Date(base.getTime() + 2_000),
      replyToReplyId: replyOne.id,
    });

    const page = await port.readVisibleComments({
      catalogId: publishedCatalogId,
      page: 1,
      pageSize: 20,
      embeddedReplyLimit: 3,
    });
    // Newest root first; replies oldest first inside the thread.
    expect(page.items.map((item) => item.id)).toEqual([root.id, older.id]);
    expect(page.total).toBe(2);
    expect(page.items[0]?.replies.map((reply) => reply.id)).toEqual([
      replyOne.id,
      replyTwo.id,
    ]);
    expect(page.items[0]?.replies[1]?.replyTo?.id).toBe(second);
    expect(replyTwo.replyTo?.displayName).toBe("书法学徒");
  });

  it("enforces depth one, same-thread reply pointers and the text bound in PostgreSQL", async () => {
    const port = commentAdapter();
    const author = await seededAuthor("dev-user-01");
    const at = new Date("2026-09-12T09:00:00.000Z");
    const first = await port.insertComment({
      id: commentId(11),
      catalogId: publishedCatalogId,
      authorId: author,
      text: "根评论",
      moderation: "visible",
      createdAt: at,
    });
    const other = await port.insertComment({
      id: commentId(12),
      catalogId: publishedCatalogId,
      authorId: author,
      text: "另一条根评论",
      moderation: "visible",
      createdAt: at,
    });
    const reply = await port.insertReply({
      id: commentId(13),
      rootCommentId: other.id,
      authorId: author,
      text: "另一线程的回复",
      moderation: "visible",
      createdAt: at,
    });

    // A reply-to-reply pointer may not cross threads.
    await expect(
      port.insertReply({
        id: commentId(14),
        rootCommentId: first.id,
        authorId: author,
        text: "跨线程指针",
        moderation: "visible",
        createdAt: at,
        replyToReplyId: reply.id,
      }),
    ).rejects.toThrow();

    // A reply can never become a root, so no tree can form.
    await expect(
      port.insertReply({
        id: commentId(15),
        rootCommentId: reply.id,
        authorId: author,
        text: "回复的回复",
        moderation: "visible",
        createdAt: at,
      }),
    ).rejects.toThrow();

    for (const [text, label] of [
      ["", "empty"],
      [" 前导空白", "untrimmed"],
      ["x".repeat(1_001), "too long"],
    ] as const) {
      await expect(
        pool.query(
          `INSERT INTO community.catalog_comments
             (id, catalog_id, author_id, text, moderation)
           VALUES ($1, $2, $3, $4, 'visible')`,
          [commentId(20), publishedCatalogId, author, text],
        ),
        label,
      ).rejects.toThrow();
    }
    await expect(
      pool.query(
        `INSERT INTO community.catalog_comments
           (id, catalog_id, author_id, text, moderation)
         VALUES ('not-opaque', $1, $2, '文本', 'visible')`,
        [publishedCatalogId, author],
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO community.catalog_comments
           (id, catalog_id, author_id, text, moderation)
         VALUES ($1, $2, $3, '文本', 'approved')`,
        [commentId(21), publishedCatalogId, author],
      ),
    ).rejects.toThrow();
  });

  it("moderates a comment or a reply and keeps hidden threads out of public reads", async () => {
    const port = commentAdapter();
    const author = await seededAuthor("dev-user-01");
    const at = new Date("2026-09-12T10:00:00.000Z");
    const root = await port.insertComment({
      id: commentId(31),
      catalogId: publishedCatalogId,
      authorId: author,
      text: "待审核的根评论",
      moderation: "pending",
      createdAt: at,
    });
    const reply = await port.insertReply({
      id: commentId(32),
      rootCommentId: root.id,
      authorId: author,
      text: "待审核的回复",
      moderation: "pending",
      createdAt: at,
    });

    expect(
      (
        await port.readVisibleComments({
          catalogId: publishedCatalogId,
          page: 1,
          pageSize: 20,
          embeddedReplyLimit: 3,
        })
      ).items,
    ).toEqual([]);

    expect(
      await port.applyCommentModeration(root.id, "visible", "owner", at),
    ).toEqual({ id: root.id, kind: "comment", moderation: "visible" });
    expect(
      await port.applyCommentModeration(reply.id, "visible", "owner", at),
    ).toEqual({ id: reply.id, kind: "reply", moderation: "visible" });
    expect(
      await port.applyCommentModeration(commentId(99), "visible", "owner", at),
    ).toBeNull();

    const visible = await port.readVisibleComments({
      catalogId: publishedCatalogId,
      page: 1,
      pageSize: 20,
      embeddedReplyLimit: 3,
    });
    expect(visible.items[0]?.replies).toHaveLength(1);

    // Hiding the root removes the thread; the reply row keeps its own state.
    await port.applyCommentModeration(root.id, "hidden", "owner", at);
    expect(
      (
        await port.readVisibleComments({
          catalogId: publishedCatalogId,
          page: 1,
          pageSize: 20,
          embeddedReplyLimit: 3,
        })
      ).items,
    ).toEqual([]);
    const stored = await pool.query<{
      moderation: string;
      moderated_by: string;
    }>(
      "SELECT moderation, moderated_by FROM community.catalog_comments WHERE id = $1",
      [root.id],
    );
    expect(stored.rows[0]).toMatchObject({
      moderation: "hidden",
      moderated_by: "owner",
    });
  });

  it("keeps the publication setting a single row and appends every moderation event", async () => {
    const port = commentAdapter();
    const at = new Date("2026-09-12T11:00:00.000Z");
    expect(await port.readPublicationPolicy()).toMatchObject({
      policy: "PRE_MODERATION",
    });
    await port.writePublicationPolicy("DIRECT_PUBLICATION", "owner", at);
    expect(await port.readPublicationPolicy()).toMatchObject({
      policy: "DIRECT_PUBLICATION",
      updatedBy: "owner",
    });

    await expect(
      pool.query(
        "INSERT INTO community.publication_setting (id, policy, updated_by) VALUES ('second', 'PRE_MODERATION', 'owner')",
      ),
    ).rejects.toThrow();
    await expect(
      pool.query(
        "UPDATE community.publication_setting SET policy = 'SOMETHING' WHERE id = 'publication'",
      ),
    ).rejects.toThrow();

    await port.recordModerationEvent({
      id: `moderation-${"0".repeat(31)}1`,
      occurredAt: at,
      operatorLabel: "owner",
      action: "approve",
      subjectKind: "comment",
      subjectId: commentId(41),
    });
    const events = await pool.query<{ action: string; operator_label: string }>(
      "SELECT action, operator_label FROM community.moderation_events",
    );
    expect(events.rows).toEqual([
      { action: "approve", operator_label: "owner" },
    ]);
    await expect(
      port.recordModerationEvent({
        id: `moderation-${"0".repeat(31)}2`,
        occurredAt: at,
        operatorLabel: "owner",
        action: "approve" as never,
        subjectKind: "planet" as never,
        subjectId: commentId(41),
      }),
    ).rejects.toThrow();
  });

  it("pages root comments and replies without repeating or dropping a row", async () => {
    const port = commentAdapter();
    const author = await seededAuthor("dev-user-01");
    const base = new Date("2026-09-12T12:00:00.000Z");
    for (let index = 0; index < 5; index += 1) {
      await port.insertComment({
        id: commentId(50 + index),
        catalogId: publishedCatalogId,
        authorId: author,
        text: `评论 ${index}`,
        moderation: "visible",
        createdAt: new Date(base.getTime() + index * 1_000),
      });
    }
    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await port.readVisibleComments({
        catalogId: publishedCatalogId,
        page,
        pageSize: 2,
        embeddedReplyLimit: 3,
      });
      expect(result.total).toBe(5);
      seen.push(...result.items.map((item) => item.id));
    }
    expect(new Set(seen).size).toBe(5);

    const root = commentId(50);
    for (let index = 0; index < 4; index += 1) {
      await port.insertReply({
        id: commentId(60 + index),
        rootCommentId: root,
        authorId: author,
        text: `回复 ${index}`,
        moderation: "visible",
        createdAt: new Date(base.getTime() + index * 1_000),
      });
    }
    const replySeen: string[] = [];
    for (const page of [1, 2]) {
      const result = await port.readVisibleReplies({
        rootCommentId: root,
        page,
        pageSize: 3,
      });
      expect(result.total).toBe(4);
      replySeen.push(...result.items.map((item) => item.id));
    }
    expect(new Set(replySeen).size).toBe(4);
  });

  it("lists the operator queue with author status and moderation state", async () => {
    const port = commentAdapter();
    const author = await seededAuthor("dev-user-03");
    const at = new Date("2026-09-12T13:00:00.000Z");
    await port.insertComment({
      id: commentId(71),
      catalogId: publishedCatalogId,
      authorId: author,
      text: "待审核",
      moderation: "pending",
      createdAt: at,
    });
    await port.insertComment({
      id: commentId(72),
      catalogId: publishedCatalogId,
      authorId: author,
      text: "已公开",
      moderation: "visible",
      createdAt: at,
    });

    const pending = await port.readOperatorComments({
      moderation: "pending",
      page: 1,
      pageSize: 20,
    });
    expect(pending.total).toBe(1);
    expect(pending.items[0]).toMatchObject({
      id: commentId(71),
      kind: "comment",
      moderation: "pending",
      author: { handle: "dev-user-03", status: "active" },
    });

    const all = await port.readOperatorComments({ page: 1, pageSize: 20 });
    expect(all.total).toBe(2);
  });
});
