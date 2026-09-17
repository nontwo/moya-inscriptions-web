import { randomUUID } from "node:crypto";

import {
  AgentAdministrationService,
  CommunityModerationService,
} from "@moya/api";
import {
  PostgresAgentAdministrationAdapter,
  PostgresCommunityCommentAdapter,
  PostgresCommunityContentOperatorAdapter,
  PostgresCommunityIdentityAdapter,
} from "@moya/community-postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { createPostgresPool } from "@moya/catalog-postgres";

const id = (prefix: string) => `${prefix}-${randomUUID().replaceAll("-", "")}`;
const PRINCIPAL = "agent-pg-reviewer";

/**
 * Agent Administration V1 on the real adapter: fenced lifecycle writes,
 * idempotent preparation, lease take-over, cancellation, and an end-to-end
 * execution whose audit rows carry the principal's label.
 */
export const registerAgentAdministrationTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Agent administration on PostgreSQL", () => {
    const agent = new PostgresAgentAdministrationAdapter(pool);
    const comments = new PostgresCommunityCommentAdapter(pool);
    const identity = new PostgresCommunityIdentityAdapter(pool);
    const content = new PostgresCommunityContentOperatorAdapter(pool);
    let author: string;
    let now = new Date();
    const service = new AgentAdministrationService(agent, {
      commentPort: comments,
      identityPort: identity,
      catalogPort: {
        isPublished: async () => true,
        readTitle: async () => null,
      },
      contentOperatorPort: content,
      clock: () => now,
      leaseMs: 60_000,
      chunksPerCall: 1,
    });
    const seedComments = async (count: number) => {
      const ids: string[] = [];
      for (let n = 0; n < count; n += 1) {
        const commentId = id("comment");
        await pool.query(
          "INSERT INTO community.catalog_comments(id,catalog_id,author_id,text,moderation) VALUES($1,'catalog-agent-01',$2,$3,'visible')",
          [commentId, author, `评论 ${n}`],
        );
        ids.push(commentId);
      }
      return ids;
    };
    beforeEach(async () => {
      now = new Date();
      author = id("user");
      await pool.query(
        "INSERT INTO community.public_users(id,handle,display_name,status) VALUES($1,$2,'代理测试作者','active')",
        [author, `agent-${randomUUID().slice(0, 8)}`],
      );
      await service.writePrincipal({
        requestId: randomUUID(),
        label: PRINCIPAL,
        displayName: "PG 评审代理",
        scopes: [
          "users:read",
          "comments:read",
          "comments:moderate",
          "operations:execute",
          "operations:undo",
        ],
        enabled: true,
        expectedVersion: 0,
      });
    });
    afterEach(async () => {
      await pool.query("DELETE FROM community.discussion_command_receipts");
      await pool.query("DELETE FROM community.agent_operations");
      await pool.query("DELETE FROM community.agent_delegations");
      await pool.query("DELETE FROM community.agent_principals");
      await pool.query("DELETE FROM community.moderation_events");
      await pool.query(
        "DELETE FROM community.catalog_comment_replies WHERE author_id=$1",
        [author],
      );
      await pool.query(
        "DELETE FROM community.catalog_comments WHERE author_id=$1",
        [author],
      );
      await pool.query("DELETE FROM community.public_users WHERE id=$1", [
        author,
      ]);
    });

    /** Seeds one comment and returns its id. */
    const seedComment = async (
      text: string,
      options: {
        readonly author?: string;
        readonly target?: string;
        readonly targetType?: "catalog" | "work";
        readonly moderation?: "pending" | "visible" | "hidden";
        readonly createdAt?: string;
      } = {},
    ) => {
      const commentId = id("comment");
      await pool.query(
        `INSERT INTO community.catalog_comments
           (id,catalog_id,author_id,text,moderation,target_type,created_at)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,CURRENT_TIMESTAMP))`,
        [
          commentId,
          options.target ?? "catalog-agent-01",
          options.author ?? author,
          text,
          options.moderation ?? "visible",
          options.targetType ?? "catalog",
          options.createdAt ?? null,
        ],
      );
      return commentId;
    };
    const seedReply = async (root: string, text: string) => {
      const replyId = id("comment");
      await pool.query(
        `INSERT INTO community.catalog_comment_replies
           (id,root_comment_id,author_id,text,moderation)
         VALUES ($1,$2,$3,$4,'visible')`,
        [replyId, root, author, text],
      );
      return replyId;
    };
    const prepareByQuery = (selector: Record<string, unknown>) =>
      service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        selector,
      });

    it("matches comment bodies literally: never the author's name, and %, _ and backslash are ordinary characters", async () => {
      // The term appears only in the author's display name, never in a body.
      const named = id("user");
      await pool.query(
        "INSERT INTO community.public_users(id,handle,display_name,status) VALUES($1,$2,'代购小铺','active')",
        [named, `named-${randomUUID().slice(0, 8)}`],
      );
      await pool.query(
        "INSERT INTO community.catalog_comments(id,catalog_id,author_id,text,moderation) VALUES($1,'catalog-agent-01',$2,'完全无关的正文','visible')",
        [id("comment"), named],
      );
      await expect(prepareByQuery({ terms: ["代购"] })).rejects.toThrow(
        "MANIFEST_NO_MATCH",
      );

      const chinese = await seedComment("这是代购广告，请删除");
      const english = await seedComment("Please remove this SPAM listing");
      const emoji = await seedComment("垃圾内容 🚫🚫 需要处理");
      const percent = await seedComment("优惠 100% 保真，私聊");
      const underscore = await seedComment("联系 a_b_c 下单");
      const backslash = await seedComment("路径 C:\\temp\\ad 广告");

      const byChinese = await prepareByQuery({ terms: ["代购"] });
      expect(byChinese.targets.map((t) => (t as { id: string }).id)).toEqual([
        chinese,
      ]);
      expect(byChinese.criteria?.matchCount).toBe(1);

      // Case-insensitive literal substring, not a pattern.
      expect(
        (await prepareByQuery({ terms: ["spam"] })).targets.map(
          (t) => (t as { id: string }).id,
        ),
      ).toEqual([english]);
      expect(
        (await prepareByQuery({ terms: ["🚫🚫"] })).targets.map(
          (t) => (t as { id: string }).id,
        ),
      ).toEqual([emoji]);
      // "100%" matches only the literal text; % never becomes a wildcard.
      expect(
        (await prepareByQuery({ terms: ["100%"] })).targets.map(
          (t) => (t as { id: string }).id,
        ),
      ).toEqual([percent]);
      await expect(prepareByQuery({ terms: ["%保真%"] })).rejects.toThrow(
        "MANIFEST_NO_MATCH",
      );
      expect(
        (await prepareByQuery({ terms: ["a_b_c"] })).targets.map(
          (t) => (t as { id: string }).id,
        ),
      ).toEqual([underscore]);
      // "_" is literal too: "a_b" must not match "axb".
      await seedComment("联系 axbxc 下单");
      expect(
        (await prepareByQuery({ terms: ["a_b"] })).targets.map(
          (t) => (t as { id: string }).id,
        ),
      ).toEqual([underscore]);
      expect(
        (await prepareByQuery({ terms: ["C:\\temp"] })).targets.map(
          (t) => (t as { id: string }).id,
        ),
      ).toEqual([backslash]);

      // any vs all over the same two terms.
      const anyMatch = await prepareByQuery({
        terms: ["代购", "SPAM"],
        match: "any",
      });
      expect(anyMatch.targets).toHaveLength(2);
      await expect(
        prepareByQuery({ terms: ["代购", "SPAM"], match: "all" }),
      ).rejects.toThrow("MANIFEST_NO_MATCH");
      const both = await seedComment("代购 SPAM 同时出现");
      const allMatch = await prepareByQuery({
        terms: ["代购", "SPAM"],
        match: "all",
      });
      expect(allMatch.targets.map((t) => (t as { id: string }).id)).toEqual([
        both,
      ]);
      await pool.query(
        "DELETE FROM community.catalog_comments WHERE author_id=$1",
        [named],
      );
      await pool.query("DELETE FROM community.public_users WHERE id=$1", [
        named,
      ]);
    });

    it("scopes a manifest by target, author, roots/replies, state and date, and never widens through counts", async () => {
      const other = id("user");
      await pool.query(
        "INSERT INTO community.public_users(id,handle,display_name,status) VALUES($1,$2,'另一位作者','active')",
        [other, `other-${randomUUID().slice(0, 8)}`],
      );
      const onCatalog = await seedComment("范围词 catalog");
      const onWork = await seedComment("范围词 work", {
        target: "work-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
        targetType: "work",
      });
      const byOther = await seedComment("范围词 other", { author: other });
      const hidden = await seedComment("范围词 hidden", {
        moderation: "hidden",
      });
      const old = await seedComment("范围词 old", {
        createdAt: "2020-01-01T00:00:00.000Z",
      });
      const root = await seedComment("范围词 root");
      const reply = await seedReply(root, "范围词 reply");

      const ids = (operation: { targets: readonly unknown[] }) =>
        operation.targets.map((t) => (t as { id: string }).id).sort();
      expect(
        ids(
          await prepareByQuery({
            terms: ["范围词"],
            target: {
              type: "work",
              id: "work-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
            },
          }),
        ),
      ).toEqual([onWork]);
      expect(
        ids(await prepareByQuery({ terms: ["范围词"], authorId: other })),
      ).toEqual([byOther]);
      expect(
        ids(await prepareByQuery({ terms: ["范围词"], moderation: "hidden" })),
      ).toEqual([hidden]);
      expect(
        ids(
          await prepareByQuery({
            terms: ["范围词"],
            createdTo: "2021-01-01T00:00:00.000Z",
          }),
        ),
      ).toEqual([old]);
      expect(
        ids(await prepareByQuery({ terms: ["范围词"], scope: "replies" })),
      ).toEqual([reply]);
      const rootsOnly = ids(
        await prepareByQuery({ terms: ["范围词"], scope: "comments" }),
      );
      expect(rootsOnly).not.toContain(reply);
      expect(rootsOnly).toContain(onCatalog);
      // The recorded criteria state what was assumed, so a preview never hides
      // an invented default.
      const prepared = await prepareByQuery({ terms: ["范围词"] });
      expect(prepared.criteria?.interpretation).toMatchObject({
        field: "body",
        matching: "literal-substring",
        caseSensitive: false,
        timezone: "UTC",
      });
      expect(prepared.criteria?.interpretation.defaults).toContain(
        "date: no interval, all history",
      );
      await pool.query(
        "DELETE FROM community.catalog_comments WHERE author_id=$1",
        [other],
      );
      await pool.query("DELETE FROM community.public_users WHERE id=$1", [
        other,
      ]);
    });

    it("refuses above the documented manifest cap and freezes a complete membership across several persisted chunks", async () => {
      // 501 bodies carrying the same literal term: one past the ceiling.
      await pool.query(
        `INSERT INTO community.catalog_comments(id,catalog_id,author_id,text,moderation)
         SELECT 'comment-' || lpad(to_hex(g), 32, '0'), 'catalog-agent-01', $1,
                'capword ' || g, 'visible'
         FROM generate_series(1, 501) AS g`,
        [author],
      );
      await expect(prepareByQuery({ terms: ["capword"] })).rejects.toThrow(
        "MANIFEST_LIMIT_EXCEEDED",
      );
      // One fewer row is accepted, proving the cap itself is the boundary.
      await pool.query(
        "DELETE FROM community.catalog_comments WHERE id = 'comment-' || lpad(to_hex(501), 32, '0')",
      );
      const atCap = await prepareByQuery({ terms: ["capword"] });
      expect(atCap.targetCount).toBe(500);
      expect(atCap.criteria?.matchCount).toBe(500);
      expect(atCap.criteria?.sample).toHaveLength(10);
      expect(
        new Set(atCap.targets.map((t) => (t as { id: string }).id)).size,
      ).toBe(500);
      // Every frozen target carries its state and content evidence.
      expect(atCap.targets[0]).toMatchObject({
        prior: "visible",
        kind: "comment",
      });
      expect((atCap.targets[0] as { textSha: string }).textSha).toMatch(
        /^[0-9a-f]{16}$/u,
      );
      // The membership is retrievable only in bounded pages.
      const firstPage = await service.getTargets(PRINCIPAL, {
        operationId: atCap.id,
        targetsPage: 1,
        targetsPageSize: 100,
      });
      expect(firstPage.items).toHaveLength(100);
      expect(firstPage.total).toBe(500);

      // A keyword manifest is an Owner decision even with a delegation that
      // would cover an explicit list of the same size.
      await service.createDelegation({
        requestId: randomUUID(),
        principal: PRINCIPAL,
        kind: "comments.moderate",
        maxTargets: 500,
        expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
      });
      const stillPrepared = await prepareByQuery({ terms: ["capword"] });
      expect(stillPrepared.state).toBe("prepared");
      expect(stillPrepared.approval).toBeNull();

      await service.approve({
        requestId: randomUUID(),
        operationId: atCap.id,
      });
      // chunksPerCall is 1 in this suite, so each call persists one 50-target
      // chunk: the membership is executed completely, across many chunks.
      let progress = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: atCap.id,
      });
      expect(progress.nextIndex).toBe(50);
      let rounds = 1;
      while (progress.state === "executing" && rounds < 20) {
        progress = await service.execute(PRINCIPAL, {
          requestId: randomUUID(),
          operationId: atCap.id,
        });
        rounds += 1;
      }
      expect(progress.state).toBe("completed");
      expect(progress.tally.applied).toBe(500);
      expect(rounds).toBe(10);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM community.catalog_comments WHERE text LIKE 'capword %' AND moderation='hidden'",
          )
        ).rows[0].n,
      ).toBe(500);
    });

    it("replays one request key over the canonical question and never absorbs content that arrived after preparation", async () => {
      await seedComment("replaytest 第一条");
      const requestId = randomUUID();
      const command = {
        requestId,
        action: "hide" as const,
        selector: { terms: ["replaytest"] },
      };
      const first = await service.prepareComments(PRINCIPAL, command);
      expect(first.targetCount).toBe(1);
      // New matching content arrives, then the same request key is replayed.
      await seedComment("replaytest 第二条");
      const replay = await service.prepareComments(PRINCIPAL, command);
      expect(replay.id).toBe(first.id);
      expect(replay.targetCount).toBe(1);
      // A different question under the same key is a conflict, not a silent
      // second manifest.
      await expect(
        service.prepareComments(PRINCIPAL, {
          requestId,
          action: "hide",
          selector: { terms: ["replaytest"], scope: "comments" },
        }),
      ).rejects.toThrow("Reused request identity");
      // A fresh key sees the new row: the frozen membership never grew.
      const second = await prepareByQuery({ terms: ["replaytest"] });
      expect(second.targetCount).toBe(2);
    });

    it("resolves identity exact-match-first, before paging, and refuses to guess", async () => {
      const exact = id("user");
      await pool.query(
        "INSERT INTO community.public_users(id,handle,display_name,status,created_at) VALUES($1,'moke','墨客','active',$2)",
        [exact, new Date(now.getTime() - 86_400_000)],
      );
      const duplicates = [id("user"), id("user")];
      for (const [index, duplicate] of duplicates.entries())
        await pool.query(
          "INSERT INTO community.public_users(id,handle,display_name,status) VALUES($1,$2,'墨客',$3)",
          [
            duplicate,
            `moke-copy-${index}-${randomUUID().slice(0, 6)}`,
            "active",
          ],
        );

      // Exact id.
      const byId = await service.usersFind(PRINCIPAL, { userId: exact });
      expect(byId.resolution).toMatchObject({
        status: "exact",
        uniqueIdentity: true,
        matchKind: "id",
        userId: exact,
      });
      // Exact handle, case-normalized, with no display-name fallback.
      const byHandle = await service.usersFind(PRINCIPAL, { handle: "moke" });
      expect(byHandle.resolution).toMatchObject({
        uniqueIdentity: true,
        matchKind: "handle",
        userId: exact,
      });
      expect(
        (await service.usersFind(PRINCIPAL, { handle: "@MOKE" })).resolution
          .userId,
      ).toBe(exact);
      // An explicit handle that misses resolves to nothing; it never falls back
      // to the accounts whose display name matches.
      const missing = await service.usersFind(PRINCIPAL, {
        handle: "moke-does-not-exist",
      });
      expect(missing.resolution).toMatchObject({
        status: "none",
        uniqueIdentity: false,
      });
      expect(missing.items).toHaveLength(0);
      // Free text: the exact handle outranks the three display-name rows even
      // though it is the oldest account, and ranking happens before paging.
      const search = await service.usersFind(PRINCIPAL, {
        search: "MoKe",
        page: 1,
        pageSize: 1,
      });
      expect(search.items[0]?.id).toBe(exact);
      expect(search.items[0]?.matchKind).toBe("handle");
      expect(search.resolution).toMatchObject({
        status: "exact",
        uniqueIdentity: true,
      });
      // Duplicate display names are candidates, never a unique identity.
      const ambiguous = await service.usersFind(PRINCIPAL, { search: "墨客" });
      expect(ambiguous.resolution).toMatchObject({
        status: "candidates",
        uniqueIdentity: false,
        ambiguous: true,
        userId: null,
      });
      expect(ambiguous.total).toBeGreaterThanOrEqual(3);
      // A name-based mutation refuses rather than picking a duplicate.
      await seedComment("identity 关键词", { author: exact });
      await expect(
        prepareByQuery({ terms: ["identity"], authorHandle: "moke-copy" }),
      ).rejects.toThrow("AUTHOR_NOT_RESOLVED");
      const byAuthorHandle = await prepareByQuery({
        terms: ["identity"],
        authorHandle: "MoKe",
      });
      expect(byAuthorHandle.criteria?.authorId).toBe(exact);
      expect(byAuthorHandle.criteria?.authorHandle).toBe("MoKe");
      for (const extra of [exact, ...duplicates]) {
        await pool.query(
          "DELETE FROM community.catalog_comments WHERE author_id=$1",
          [extra],
        );
        await pool.query("DELETE FROM community.public_users WHERE id=$1", [
          extra,
        ]);
      }
    });

    /**
     * The receipt seam. A moderation commits with an execution receipt bound to
     * the exact operation, target, action and canonical command, in the same
     * transaction and on the same connection. Recovery reads that receipt; it
     * never infers ownership from the actor, the clock or the current state.
     */
    const lostProgressWrite = async (operationId: string) => {
      // The mutations and their receipts committed; the chunk's progress write
      // did not. This is the lost response and the lease handoff, reproduced
      // exactly: the operation is back where it started, the effects are not.
      await pool.query(
        `UPDATE community.agent_operations
           SET next_index=0, results='[]'::jsonb, state='approved',
               lease_owner=NULL, lease_expires_at=NULL
         WHERE id=$1`,
        [operationId],
      );
    };

    it("recovers the exact applied result after a lost progress write, without a duplicate effect", async () => {
      const ids = [
        await seedComment("receipt A"),
        await seedComment("receipt B"),
      ];
      const prepared = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids,
      });
      await service.approve({
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      const first = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      expect(first.tally).toMatchObject({ applied: 2, conflicts: 0 });
      const receipts = await pool.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM community.discussion_command_receipts WHERE actor_label=$1",
        [PRINCIPAL],
      );
      expect(receipts.rows[0]!.n).toBe(2);

      await lostProgressWrite(prepared.id);
      const again = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      // The committed transitions are recovered as applied, by receipt.
      expect(again.state).toBe("completed");
      expect(again.tally).toMatchObject({ applied: 2, conflicts: 0 });
      // And nothing was applied twice: one audit row and one receipt per target.
      for (const target of ids)
        expect(
          (
            await pool.query<{ n: number }>(
              "SELECT count(*)::int AS n FROM community.moderation_events WHERE subject_id=$1 AND operator_label=$2",
              [target, PRINCIPAL],
            )
          ).rows[0]!.n,
        ).toBe(1);
      expect(
        (
          await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM community.discussion_command_receipts WHERE actor_label=$1",
            [PRINCIPAL],
          )
        ).rows[0]!.n,
      ).toBe(2);
    });

    it("never lets one operation claim a different operation's transition, even for the same principal, target and action", async () => {
      const target = await seedComment("two operations");
      const first = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids: [target],
      });
      const second = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids: [target],
      });
      await service.approve({ requestId: randomUUID(), operationId: first.id });
      await service.approve({
        requestId: randomUUID(),
        operationId: second.id,
      });
      // The second operation starts FIRST, so every later audit event falls
      // inside its window. The replaced heuristic would have credited it with
      // the first operation's work; the receipt cannot be borrowed.
      await agent.claimExecution(second.id, "second.1", now, 60_000);
      now = new Date(now.getTime() + 1_000);
      const firstRun = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: first.id,
      });
      expect(firstRun.tally).toMatchObject({ applied: 1, conflicts: 0 });
      now = new Date(now.getTime() + 61_000);
      const secondRun = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: second.id,
      });
      expect(secondRun.tally).toMatchObject({ applied: 0, conflicts: 1 });
      // Exactly one transition happened in total.
      expect(
        (
          await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM community.moderation_events WHERE subject_id=$1",
            [target],
          )
        ).rows[0]!.n,
      ).toBe(1);
    });

    it("replays the same command identity and conflicts on a different command under it", async () => {
      const target = await seedComment("identity receipt");
      const requestId = randomUUID();
      const applied = await comments.applyCommentModeration(
        target as never,
        "hidden",
        ["visible"],
        PRINCIPAL,
        now,
        {
          id: id("moderation"),
          occurredAt: now,
          operatorLabel: PRINCIPAL,
          action: "hide",
        },
        { requestId, fingerprint: "fingerprint-a" },
      );
      expect(applied).toMatchObject({ moderation: "hidden" });
      // The identical command replays its stored result and mutates nothing.
      const replay = await comments.applyCommentModeration(
        target as never,
        "hidden",
        ["visible"],
        PRINCIPAL,
        now,
        {
          id: id("moderation"),
          occurredAt: now,
          operatorLabel: PRINCIPAL,
          action: "hide",
        },
        { requestId, fingerprint: "fingerprint-a" },
      );
      expect(replay).toMatchObject({ moderation: "hidden" });
      expect(
        (
          await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM community.moderation_events WHERE subject_id=$1",
            [target],
          )
        ).rows[0]!.n,
      ).toBe(1);
      // A different command under the same identity is a conflict, never a
      // second effect and never a borrowed result.
      await expect(
        comments.applyCommentModeration(
          target as never,
          "visible",
          ["hidden"],
          PRINCIPAL,
          now,
          {
            id: id("moderation"),
            occurredAt: now,
            operatorLabel: PRINCIPAL,
            action: "unhide",
          },
          { requestId, fingerprint: "fingerprint-b" },
        ),
      ).rejects.toThrow("Reused command identity");
      expect(
        (
          await pool.query<{ moderation: string }>(
            "SELECT moderation FROM community.catalog_comments WHERE id=$1",
            [target],
          )
        ).rows[0]!.moderation,
      ).toBe("hidden");
    });

    it("keeps an undo to its own operation's effects and refuses a later incompatible change", async () => {
      const mine = await seedComment("undo scope mine");
      const other = await seedComment("undo scope other");
      const operation = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids: [mine],
      });
      const unrelated = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids: [other],
      });
      for (const one of [operation, unrelated]) {
        await service.approve({ requestId: randomUUID(), operationId: one.id });
        await service.execute(PRINCIPAL, {
          requestId: randomUUID(),
          operationId: one.id,
        });
      }
      const undo = await service.prepareUndo(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      // Only this operation's own target, never the other operation's.
      expect(undo.targetCount).toBe(1);
      expect((undo.targets[0] as { id: string }).id).toBe(mine);
      expect(undo.targets[0]).toMatchObject({ prior: "hidden" });

      // A human restores it before the undo runs: the undo must not overwrite
      // that later, incompatible change.
      await comments.applyCommentModeration(
        mine as never,
        "visible",
        ["hidden"],
        "owner",
        now,
        {
          id: id("moderation"),
          occurredAt: now,
          operatorLabel: "owner",
          action: "unhide",
        },
      );
      await service.approve({ requestId: randomUUID(), operationId: undo.id });
      const ran = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: undo.id,
      });
      expect(ran.tally).toMatchObject({ applied: 0, conflicts: 1 });
      expect(
        (
          await pool.query<{ moderation: string }>(
            "SELECT moderation FROM community.catalog_comments WHERE id=$1",
            [other],
          )
        ).rows[0]!.moderation,
      ).toBe("hidden");
    });

    it("stores principals and delegations with optimistic versions and revocation", async () => {
      const first = (await agent.findPrincipal(PRINCIPAL))!;
      expect(first.version).toBe(1);
      expect(
        await agent.writePrincipal({ ...first, expectedVersion: 5 }, now),
      ).toBeNull();
      const updated = (await agent.writePrincipal(
        { ...first, displayName: "改名", expectedVersion: 1 },
        now,
      ))!;
      expect(updated).toMatchObject({ displayName: "改名", version: 2 });
      const delegation = await agent.createDelegation(
        {
          id: randomUUID(),
          principal: PRINCIPAL,
          kind: "comments.moderate",
          maxTargets: 5,
          expiresAt: new Date(now.getTime() + 3_600_000),
          createdBy: "owner",
        },
        now,
      );
      expect(
        await agent.findActiveDelegation(
          PRINCIPAL,
          "comments.moderate",
          5,
          now,
        ),
      ).toMatchObject({ id: delegation.id });
      expect(
        await agent.findActiveDelegation(
          PRINCIPAL,
          "comments.moderate",
          6,
          now,
        ),
      ).toBeNull();
      expect(
        await agent.findActiveDelegation(PRINCIPAL, "featured.set", 1, now),
      ).toBeNull();
      expect(
        await agent.revokeDelegation(delegation.id, "owner", now),
      ).toMatchObject({ revokedBy: "owner" });
      expect(
        await agent.findActiveDelegation(
          PRINCIPAL,
          "comments.moderate",
          1,
          now,
        ),
      ).toBeNull();
      expect(
        await agent.readDelegations({ includeInactive: false }, now),
      ).toEqual([]);
      expect(
        (await agent.readDelegations({ includeInactive: true }, now)).map(
          (d) => d.id,
        ),
      ).toEqual([delegation.id]);
      const revoked = (await agent.revokePrincipal(PRINCIPAL, 2, now))!;
      expect(revoked.enabled).toBe(false);
      expect(
        await agent.writePrincipal(
          { ...revoked, expectedVersion: revoked.version },
          now,
        ),
      ).toBeNull();
    });

    it("keeps preparation idempotent per request identity and refuses a reused identity with other content", async () => {
      const ids = await seedComments(2);
      const requestId = randomUUID();
      const prepared = await service.prepareComments(PRINCIPAL, {
        requestId,
        action: "hide",
        ids,
      });
      const replay = await service.prepareComments(PRINCIPAL, {
        requestId,
        action: "hide",
        ids,
      });
      expect(replay.id).toBe(prepared.id);
      await expect(
        service.prepareComments(PRINCIPAL, {
          requestId,
          action: "unhide",
          ids,
        }),
      ).rejects.toThrow("Reused request identity with other content");
      expect(
        (await agent.readOperations({ page: 1, pageSize: 10 })).total,
      ).toBe(1);
      // Targets are immutable: the App role holds no UPDATE on them.
      const stored = (await agent.findOperation(prepared.id))!;
      expect(stored.targets).toEqual(
        ids.map((commentId) => ({ id: commentId, prior: "visible" })),
      );
    });

    it("fences the lease: one claim wins, a stale record is refused, an expired lease is taken over", async () => {
      const ids = await seedComments(1);
      const prepared = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids,
      });
      await service.approve({
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      const a = await agent.claimExecution(prepared.id, "a.1", now, 60_000);
      const b = await agent.claimExecution(prepared.id, "b.1", now, 60_000);
      expect(a?.claimed).toBe(true);
      expect(b?.claimed).toBe(false);
      expect(b?.operation.leaseHeld).toBe(true);
      expect(
        await agent.recordChunk(prepared.id, "b.1", [], 0, now, {
          release: false,
          leaseMs: 60_000,
        }),
      ).toBeNull();
      const later = new Date(now.getTime() + 61_000);
      const c = await agent.claimExecution(prepared.id, "c.1", later, 60_000);
      expect(c?.claimed).toBe(true);
      expect(
        await agent.recordChunk(prepared.id, "a.1", [], 0, later, {
          release: false,
          leaseMs: 60_000,
        }),
      ).toBeNull();
      const done = await agent.recordChunk(
        prepared.id,
        "c.1",
        [{ index: 0, id: ids[0]!, outcome: "applied", detail: "hidden" }],
        1,
        later,
        { finalState: "completed", release: true, leaseMs: 60_000 },
      );
      expect(done).toMatchObject({
        state: "completed",
        nextIndex: 1,
        leaseHeld: false,
        tally: { applied: 1 },
      });
      expect(
        await agent.claimExecution(prepared.id, "d.1", later, 60_000),
      ).toBeNull();
    });

    it("executes chunk by chunk through the real moderation adapter with the principal on every audit row, resumes and undoes conditionally", async () => {
      const ids = await seedComments(3);
      const prepared = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids,
      });
      expect(prepared.state).toBe("prepared");
      await service.approve({
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      // The Owner hides one target first: the operation reports a conflict for it.
      await comments.applyCommentModeration(
        ids[1] as never,
        "hidden",
        ["visible"],
        "owner",
        now,
      );
      const done = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      expect(done).toMatchObject({
        state: "completed",
        tally: { applied: 2, conflicts: 1 },
      });
      const events = await pool.query<{
        operator_label: string;
        action: string;
        subject_id: string;
      }>(
        "SELECT operator_label,action,subject_id FROM community.moderation_events WHERE subject_id=ANY($1::text[]) ORDER BY occurred_at,id",
        [ids],
      );
      expect(
        events.rows.filter((row) => row.operator_label === PRINCIPAL),
      ).toHaveLength(2);
      // The Owner's direct port call above passed no audit draft, so only the
      // principal's two applied transitions are recorded.
      const states = await pool.query<{ moderation: string }>(
        "SELECT moderation FROM community.catalog_comments WHERE id=ANY($1::text[])",
        [ids],
      );
      expect(states.rows.every((row) => row.moderation === "hidden")).toBe(
        true,
      );
      // Undo: the Owner restores one by hand first; the undo conflicts on it.
      await comments.applyCommentModeration(
        ids[0] as never,
        "visible",
        ["hidden"],
        "owner",
        now,
      );
      const undo = await service.prepareUndo(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      expect(undo).toMatchObject({
        action: "unhide",
        targetCount: 2,
        undoOf: prepared.id,
        state: "prepared",
      });
      await service.approve({ requestId: randomUUID(), operationId: undo.id });
      const restored = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: undo.id,
      });
      expect(restored.tally).toMatchObject({ applied: 1, conflicts: 1 });
      const after = await pool.query<{ id: string; moderation: string }>(
        "SELECT id,moderation FROM community.catalog_comments WHERE id=ANY($1::text[])",
        [ids],
      );
      expect(new Map(after.rows.map((r) => [r.id, r.moderation]))).toEqual(
        new Map([
          [ids[0]!, "visible"],
          [ids[1]!, "hidden"],
          [ids[2]!, "visible"],
        ]),
      );
    });

    it("cancels a running operation after its current chunk and marks the remainder cancelled", async () => {
      const ids = await seedComments(2);
      const prepared = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids,
      });
      await service.approve({
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      // A stalled executor holds the lease; cancel is requested meanwhile.
      await agent.claimExecution(prepared.id, "stalled.1", now, 60_000);
      const cancelled = await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      expect(cancelled).toMatchObject({ state: "executing" });
      expect(cancelled.cancelRequestedAt).not.toBeNull();
      now = new Date(now.getTime() + 61_000);
      const finished = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      expect(finished).toMatchObject({
        state: "cancelled",
        tally: { applied: 0, cancelled: 2 },
      });
      expect(
        (
          await pool.query(
            "SELECT count(*) AS n FROM community.moderation_events WHERE operator_label=$1",
            [PRINCIPAL],
          )
        ).rows[0].n,
      ).toBe("0");
    });
  });
};
