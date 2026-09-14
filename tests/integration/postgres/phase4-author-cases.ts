import { randomUUID } from "node:crypto";
import { CommunityConflictError, CommunityNotFoundError } from "@moya/api";
import {
  createBackendApplication,
  createDevelopmentCatalogFixtureQueryPort,
  startBackendProcess,
} from "@moya/backend-runtime";
import {
  PostgresAuthorCommunityAdapter,
  PostgresCommunityIdentityAdapter,
  PostgresCommunityCommentAdapter,
  PostgresWorkPublishingAdapter,
} from "@moya/community-postgres";
import { UnconfiguredStorageUrlResolver } from "@moya/image";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { createPostgresPool } from "@moya/catalog-postgres";
import type {
  AuthorListQuery,
  AuthorMedia,
  CatalogCommentId,
  PublicUserId,
} from "@moya/contracts";
import type { BackendProcessHandle } from "@moya/backend-runtime";

import { cleanupPublishingData } from "./work-publishing-content-cases.js";

const id = (prefix: string) => `${prefix}-${randomUUID().replaceAll("-", "")}`;
const query: AuthorListQuery = {
  page: 1,
  pageSize: 20,
  search: "",
  kind: "all",
};
/** Registered in the existing community suite so its destructive fixtures cannot race these. */
export const registerPhase4AuthorTests = (
  pool: ReturnType<typeof createPostgresPool>,
): void => {
  describe("Phase 4 author foundations with real PostgreSQL and HTTP", () => {
    let a: string, b: string, work: string;
    const adapter = new PostgresAuthorCommunityAdapter(pool);
    const discussion = new PostgresCommunityCommentAdapter(pool);
    const publishing = new PostgresWorkPublishingAdapter(pool);
    let process: BackendProcessHandle | undefined;
    const handles = new Map<string, string>();
    beforeEach(async () => {
      a = id("user");
      b = id("user");
      work = id("work");
      for (const user of [a, b]) {
        const handle = `p4-${user.slice(-24)}`;
        handles.set(user, handle);
        await pool.query(
          "INSERT INTO community.public_users(id,handle,display_name) VALUES($1,$2,'同名作者')",
          [user, handle],
        );
        await pool.query(
          "INSERT INTO community.development_accounts(user_id,label) VALUES($1,'Phase 4 synthetic test')",
          [user],
        );
      }
      await pool.query(
        "INSERT INTO community.works(id,author_id,title,text,first_published_at,synthetic_provenance) VALUES($1,$2,'合成作品','原始已发布内容','2026-01-01T00:00:00Z','phase4-unit-journey')",
        [work, a],
      );
    });
    afterEach(async () => {
      if (process) {
        await process.shutdown();
        process = undefined;
      }
      const users = [a, b];
      await pool.query(
        "DELETE FROM community.comment_likes WHERE user_id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.discussion_command_receipts WHERE actor_label=ANY($1)",
        [[...users, `operator:p4-${a.slice(-20)}`]],
      );
      await pool.query(
        "DELETE FROM community.moderation_events WHERE operator_label=$1",
        [`p4-${a.slice(-20)}`],
      );
      await pool.query(
        "DELETE FROM community.catalog_comment_replies WHERE author_id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.catalog_comments WHERE author_id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.author_command_receipts WHERE actor_id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.author_events WHERE actor_id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.content_relations WHERE user_id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.follows WHERE follower_id=ANY($1) OR followed_id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.blocks WHERE blocker_id=ANY($1) OR blocked_id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.work_edit_drafts WHERE author_id=ANY($1)",
        [users],
      );
      // Work publishing rows reference works, user media and accounts.
      await cleanupPublishingData(pool, users);
      await pool.query("DELETE FROM community.works WHERE author_id=ANY($1)", [
        users,
      ]);
      await pool.query(
        "UPDATE community.public_users SET avatar_media_id=NULL WHERE id=ANY($1)",
        [users],
      );
      await pool.query(
        "DELETE FROM community.user_media WHERE owner_id=ANY($1)",
        [users],
      );
      await pool.query("DELETE FROM community.sessions WHERE user_id=ANY($1)", [
        users,
      ]);
      await pool.query(
        "DELETE FROM community.development_accounts WHERE user_id=ANY($1)",
        [users],
      );
      await pool.query("DELETE FROM community.public_users WHERE id=ANY($1)", [
        users,
      ]);
    });
    const server = async (
      nodeEnv: "development" | "production" = "development",
    ) => {
      process = await startBackendProcess({
        listen: { host: "127.0.0.1", port: 0 },
        requestListener: createBackendApplication({
          nodeEnv,
          communityIdentityPort: new PostgresCommunityIdentityAdapter(pool),
          authorCommunityPort: adapter,
          discussionPort: discussion,
          communityCommentPort: discussion,
          catalogQueryPort: createDevelopmentCatalogFixtureQueryPort(),
          storageUrlResolver: new UnconfiguredStorageUrlResolver(),
        }),
      });
      return `http://${process.address.address}:${process.address.port}`;
    };
    const signIn = async (base: string, user: string) => {
      const response = await fetch(`${base}/v1/development/sign-in`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: handles.get(user) }),
      });
      expect(response.status).toBe(201);
      const session = (await response.json()) as { token: string };
      return session.token;
    };
    const png = () =>
      sharp({
        create: {
          width: 8,
          height: 8,
          channels: 4,
          background: { r: 20, g: 40, b: 60, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
    const upload = async (base: string, token: string) => {
      const response = await fetch(`${base}/v1/community/media`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "image/png",
          "x-request-id": randomUUID(),
        },
        body: new Uint8Array(await png()),
      });
      expect(response.status).toBe(201);
      return response.json() as Promise<AuthorMedia>;
    };
    it("preserves suspended authors' visible Catalog threads while revoking auth and refusing their new writes", async () => {
      await pool.query(
        "UPDATE community.publication_setting SET policy='DIRECT_PUBLICATION' WHERE id='publication'",
      );
      const target = { type: "catalog" as const, id: "fixture-catalog-001" };
      const workTarget = { type: "work" as const, id: work };
      const root = await discussion.submitDiscussion(
        target,
        a,
        "停用后仍公开的历史根",
      );
      const authoredReply = await discussion.submitDiscussion(
        target,
        a,
        "停用后仍公开的历史回复",
        root.id,
      );
      const otherReply = await discussion.submitDiscussion(
        target,
        b,
        "另一作者的历史回复",
        root.id,
        authoredReply.id,
      );
      const otherRoot = await discussion.submitDiscussion(
        target,
        b,
        "仍活跃作者的根",
      );
      const suspendedReply = await discussion.submitDiscussion(
        target,
        a,
        "活跃根下的历史回复",
        otherRoot.id,
      );
      await discussion.setDiscussionLike(b, root.id, true, randomUUID());
      await discussion.submitDiscussion(
        workTarget,
        a,
        "作品范围的评论仍受作品可用性约束",
      );
      const base = await server();
      const oldToken = await signIn(base, a);
      const memberToken = await signIn(base, b);
      const identity = new PostgresCommunityIdentityAdapter(pool);
      const suspended = await identity.setUserStatus(
        a as PublicUserId,
        "suspended",
        new Date(),
      );
      expect(suspended?.user.status).toBe("suspended");
      expect(suspended?.revokedSessions).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT moderation FROM community.catalog_comments WHERE id=ANY($1::text[])",
            [[root.id, otherRoot.id]],
          )
        ).rows.every((row) => row.moderation === "visible"),
      ).toBe(true);

      // Actual public HTTP and authenticated reads keep historical public text,
      // reply attribution, counters and active-account likes intact.
      for (const viewerToken of [null, memberToken]) {
        const response = await fetch(
          `${base}/v1/community/discussion/catalog/${target.id}`,
          {
            headers: viewerToken
              ? { authorization: `Bearer ${viewerToken}` }
              : {},
          },
        );
        expect(response.status).toBe(200);
        const page = (await response.json()) as Awaited<
          ReturnType<typeof discussion.readDiscussion>
        >;
        expect(page.visibleTotal).toBe(2);
        expect(page.hot.map((item) => item.id)).toEqual([root.id]);
        expect(page.hot[0]).toMatchObject({
          text: "停用后仍公开的历史根",
          likeCount: 1,
          replyTotal: 2,
        });
        expect(page.hot[0]?.replies).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: authoredReply.id,
              text: "停用后仍公开的历史回复",
            }),
            expect.objectContaining({
              id: otherReply.id,
              text: "另一作者的历史回复",
              replyTo: expect.objectContaining({ id: a }),
            }),
          ]),
        );
        expect(
          page.items.find((item) => item.id === otherRoot.id)?.replies,
        ).toEqual([
          expect.objectContaining({
            id: suspendedReply.id,
            text: "活跃根下的历史回复",
          }),
        ]);
      }
      const replies = await discussion.readDiscussionReplies(
        target,
        root.id,
        b,
        query,
      );
      expect(replies.visibleTotal).toBe(2);
      expect(replies.items.map((item) => item.id)).toEqual(
        expect.arrayContaining([authoredReply.id, otherReply.id]),
      );
      expect(
        (await discussion.ownComments(b, query)).items.find(
          (item) => item.id === otherReply.id,
        )?.target,
      ).toEqual(target);
      expect(
        await discussion.locateDiscussion(target, otherReply.id, b, query),
      ).toMatchObject({ rootId: root.id, replyPage: 1 });

      // Suspension is still authoritative for authentication and writes.
      expect(
        (
          await fetch(`${base}/v1/community/me/profile`, {
            headers: { authorization: `Bearer ${oldToken}` },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(`${base}/v1/development/sign-in`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ handle: handles.get(a) }),
          })
        ).status,
      ).toBe(404);
      await expect(
        discussion.submitDiscussion(target, a, "不得新增根"),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      await expect(
        discussion.submitDiscussion(target, a, "不得新增回复", otherRoot.id),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      await expect(
        discussion.setDiscussionLike(a, otherRoot.id, true, randomUUID()),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      await expect(
        discussion.readDiscussion(workTarget, null, query),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      await expect(
        discussion.readDiscussion(workTarget, b, query),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);

      // An explicit hide still removes this historical root and its context.
      const operator = `p4-${a.slice(-20)}`;
      const at = new Date();
      expect(
        await discussion.applyCommentModeration(
          root.id as CatalogCommentId,
          "hidden",
          ["visible"],
          operator,
          at,
          {
            id: id("moderation"),
            occurredAt: at,
            operatorLabel: operator,
            action: "hide",
          },
        ),
      ).toMatchObject({ id: root.id, moderation: "hidden" });
      const hidden = await discussion.readDiscussion(target, null, query);
      expect([...hidden.hot, ...hidden.items].map((item) => item.id)).toEqual([
        otherRoot.id,
      ]);
      expect(
        (await discussion.ownComments(b, query)).items.find(
          (item) => item.id === otherReply.id,
        ),
      ).toMatchObject({
        text: "另一作者的历史回复",
        target: null,
      });
    });

    it("keeps an audited hidden original private, excludes its heat and preserves unavailable own records", async () => {
      await pool.query(
        "UPDATE community.publication_setting SET policy='DIRECT_PUBLICATION' WHERE id='publication'",
      );
      const target = { type: "work" as const, id: work };
      const operator = `p4-${a.slice(-20)}`;
      const root = await discussion.submitDiscussion(
        target,
        a,
        "隐藏后仍属于作者的原文",
      );
      const ownReply = await discussion.submitDiscussion(
        target,
        a,
        "作者自己的完整回复",
        root.id,
      );
      const otherReply = await discussion.submitDiscussion(
        target,
        b,
        "第三方保留的私人记录",
        root.id,
      );
      await discussion.setDiscussionLike(b, root.id, true, randomUUID());
      expect(
        (await discussion.readDiscussion(target, null, query)).hot.map(
          (r) => r.id,
        ),
      ).toEqual([root.id]);
      const at = new Date("2026-09-13T12:00:00.000Z");
      expect(
        await discussion.applyCommentModeration(
          root.id as CatalogCommentId,
          "hidden",
          ["visible"],
          operator,
          at,
          {
            id: id("moderation"),
            occurredAt: at,
            operatorLabel: operator,
            action: "hide",
          },
        ),
      ).toEqual({ id: root.id, kind: "comment", moderation: "hidden" });

      for (const viewer of [null, b]) {
        const page = await discussion.readDiscussion(target, viewer, query);
        expect(page.hot).toEqual([]);
        expect(page.items).toEqual([]);
        expect(page.total).toBe(0);
        expect(page.visibleTotal).toBe(0);
        await expect(
          discussion.readDiscussionReplies(target, root.id, viewer, query),
        ).rejects.toBeInstanceOf(CommunityNotFoundError);
      }
      const own = await discussion.readDiscussion(target, a, query);
      expect(own.hot).toEqual([]);
      expect(own.visibleTotal).toBe(0);
      expect(own.items).toHaveLength(1);
      expect(own.items[0]).toMatchObject({
        id: root.id,
        text: "隐藏后仍属于作者的原文",
        likeCount: 0,
        liked: false,
        replyTotal: 0,
        replyPageTotal: 1,
      });
      expect(
        own.items[0]?.replies.map((r) => ({
          id: r.id,
          text: r.text,
          likeCount: r.likeCount,
        })),
      ).toEqual([
        { id: ownReply.id, text: "作者自己的完整回复", likeCount: 0 },
      ]);
      expect(JSON.stringify(own)).not.toMatch(/pending|hidden/);
      await expect(
        discussion.setDiscussionLike(a, root.id, true, randomUUID()),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      const authorRecords = await discussion.ownComments(a, query);
      expect(authorRecords.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: root.id,
            text: "隐藏后仍属于作者的原文",
            target,
          }),
          expect.objectContaining({
            id: ownReply.id,
            text: "作者自己的完整回复",
            target,
          }),
        ]),
      );
      expect((await discussion.ownComments(b, query)).items).toEqual([
        expect.objectContaining({
          id: otherReply.id,
          text: "第三方保留的私人记录",
          target: null,
        }),
      ]);
      expect(
        Number(
          (
            await pool.query(
              "SELECT count(*) AS n FROM community.moderation_events WHERE operator_label=$1 AND subject_id=$2 AND action='hide'",
              [operator, root.id],
            )
          ).rows[0]?.n,
        ),
      ).toBe(1);

      expect(
        await discussion.applyCommentModeration(
          root.id as CatalogCommentId,
          "visible",
          ["hidden"],
          operator,
          at,
          {
            id: id("moderation"),
            occurredAt: at,
            operatorLabel: operator,
            action: "unhide",
          },
        ),
      ).toEqual({ id: root.id, kind: "comment", moderation: "visible" });
      expect((await discussion.ownComments(b, query)).items[0]?.target).toEqual(
        target,
      );
      await adapter.block(a, {
        targetId: b,
        enabled: true,
        requestId: randomUUID(),
      });
      expect((await discussion.ownComments(b, query)).items).toEqual([
        expect.objectContaining({
          id: otherReply.id,
          text: "第三方保留的私人记录",
          target: null,
        }),
      ]);
      const anonymous = await discussion.readDiscussion(target, null, query);
      const publicRoot = [...anonymous.hot, ...anonymous.items].find(
        (r) => r.id === root.id,
      );
      expect(publicRoot?.replies.map((r) => r.id)).toContain(otherReply.id);
      const blockedView = await discussion.readDiscussion(target, a, query);
      const ownVisibleRoot = [...blockedView.hot, ...blockedView.items].find(
        (r) => r.id === root.id,
      );
      expect(ownVisibleRoot?.replies.map((r) => r.id)).not.toContain(
        otherReply.id,
      );
      expect(ownVisibleRoot?.likeCount).toBe(0);
    });

    it("caps root-like heat at three, orders score/time/id ties and leaves remaining roots latest without duplicates", async () => {
      await pool.query(
        "UPDATE community.publication_setting SET policy='DIRECT_PUBLICATION' WHERE id='publication'",
      );
      const target = { type: "work" as const, id: work };
      const older = await discussion.submitDiscussion(
        target,
        a,
        "最早的正分根",
      );
      const newer = await discussion.submitDiscussion(
        target,
        a,
        "次新的正分根",
      );
      const tieA = await discussion.submitDiscussion(target, a, "同刻正分根甲");
      const tieB = await discussion.submitDiscussion(target, a, "同刻正分根乙");
      const zero = await discussion.submitDiscussion(target, a, "最新零分根");
      await pool.query(
        "UPDATE community.catalog_comments SET created_at=CASE WHEN id=$1 THEN '2026-09-13T10:00:00Z'::timestamptz WHEN id=$2 THEN '2026-09-13T11:00:00Z'::timestamptz ELSE '2026-09-13T12:00:00Z'::timestamptz END WHERE id=ANY($3::text[])",
        [older.id, newer.id, [older.id, newer.id, tieA.id, tieB.id]],
      );
      await pool.query(
        "UPDATE community.catalog_comments SET created_at='2026-09-13T13:00:00Z'::timestamptz WHERE id=$1",
        [zero.id],
      );
      for (const root of [older, newer, tieA, tieB])
        await discussion.setDiscussionLike(b, root.id, true, randomUUID());
      const likedReply = await discussion.submitDiscussion(
        target,
        b,
        "只有回复受赞",
        zero.id,
      );
      await discussion.setDiscussionLike(a, likedReply.id, true, randomUUID());
      const tied = [tieA.id, tieB.id].sort().reverse();
      const expectedHot = [...tied, newer.id];
      const first = await discussion.readDiscussion(target, null, {
        ...query,
        pageSize: 1,
      });
      expect(first.hot.map((r) => r.id)).toEqual(expectedHot);
      expect(first.hot.map((r) => r.likeCount)).toEqual([1, 1, 1]);
      expect(first.items.map((r) => r.id)).toEqual([zero.id]);
      expect(first.total).toBe(2);
      expect(first.visibleTotal).toBe(5);
      expect(first.items[0]?.likeCount).toBe(0);
      expect(first.items[0]?.replies[0]?.likeCount).toBe(1);
      const next = await discussion.readDiscussion(target, null, {
        ...query,
        page: 2,
        pageSize: 1,
        pinned: expectedHot,
      });
      expect(next.hot).toEqual([]);
      expect(next.items.map((r) => r.id)).toEqual([older.id]);
      const traversal = [...first.hot, ...first.items, ...next.items].map(
        (r) => r.id,
      );
      expect(new Set(traversal).size).toBe(5);
      expect(traversal).toEqual([...expectedHot, zero.id, older.id]);

      // A second effective root like wins ahead of newer equal-score roots.
      await discussion.setDiscussionLike(a, older.id, true, randomUUID());
      expect(
        (await discussion.readDiscussion(target, null, query)).hot.map(
          (r) => r.id,
        ),
      ).toEqual([older.id, ...tied]);
      await discussion.setDiscussionLike(a, older.id, false, randomUUID());
      expect(
        (await discussion.readDiscussion(target, null, query)).hot.map(
          (r) => r.id,
        ),
      ).toEqual(expectedHot);
    });

    it("keeps hidden roots private, permits their author's reply, and gives unavailable-context records a private fallback", async () => {
      const target = { type: "work" as const, id: work };
      await pool.query(
        "UPDATE community.publication_setting SET policy='PRE_MODERATION' WHERE id='publication'",
      );
      const root = await discussion.submitDiscussion(
        target,
        a,
        "只给作者的原文",
      );
      const reply = await discussion.submitDiscussion(
        target,
        a,
        "自己的私有回复",
        root.id,
      );
      expect(
        (await discussion.readDiscussion(target, null, query)).items,
      ).toHaveLength(0);
      expect(
        (await discussion.readDiscussion(target, b, query)).items,
      ).toHaveLength(0);
      const own = await discussion.readDiscussion(target, a, query);
      expect(own.items[0]?.text).toBe("只给作者的原文");
      expect(own.items[0]?.replies[0]?.id).toBe(reply.id);
      expect(JSON.stringify(own)).not.toMatch(/pending|hidden/);
      await expect(
        discussion.submitDiscussion(target, b, "不可回复", root.id),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      await adapter.block(a, {
        targetId: b,
        enabled: true,
        requestId: randomUUID(),
      });
      await expect(
        discussion.readDiscussion(target, b, query),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
    });
    it("ranks only root likes, pins hot exclusions and locates late replies without exposing private heat", async () => {
      await pool.query(
        "UPDATE community.publication_setting SET policy='DIRECT_PUBLICATION' WHERE id='publication'",
      );
      const target = { type: "work" as const, id: work };
      const root = await discussion.submitDiscussion(target, a, "根评论");
      const other = await discussion.submitDiscussion(target, b, "新根评论");
      let last = "";
      for (let n = 0; n < 5; n++)
        last = (
          await discussion.submitDiscussion(target, b, `回复 ${n}`, root.id)
        ).id;
      await discussion.setDiscussionLike(a, last, true, randomUUID());
      expect(
        (await discussion.readDiscussion(target, null, query)).hot,
      ).toHaveLength(0);
      const request = randomUUID();
      await discussion.setDiscussionLike(b, root.id, true, request);
      await discussion.setDiscussionLike(b, root.id, true, request);
      const first = await discussion.readDiscussion(target, a, {
        ...query,
        pageSize: 1,
      });
      expect(first.hot.map((r) => r.id)).toEqual([root.id]);
      expect(first.hot[0]?.likeCount).toBe(1);
      expect(first.items[0]?.id).toBe(other.id);
      const located = await discussion.locateDiscussion(target, last, a, {
        ...query,
        pageSize: 2,
      });
      expect(located.replyPage).toBe(3);
      expect(
        (
          await discussion.readDiscussion(target, a, {
            ...query,
            pinned: [root.id],
          })
        ).items.map((r) => r.id),
      ).toEqual([other.id]);
      await discussion.setDiscussionLike(b, root.id, false, randomUUID());
      expect(
        (await discussion.readDiscussion(target, null, query)).hot,
      ).toHaveLength(0);
    });
    it("distinguishes body deletion from whole-thread removal and checks the confirmed count atomically", async () => {
      await pool.query(
        "UPDATE community.publication_setting SET policy='DIRECT_PUBLICATION' WHERE id='publication'",
      );
      const target = { type: "work" as const, id: work },
        operator = `p4-${a.slice(-20)}`;
      const root = await discussion.submitDiscussion(
          target,
          a,
          "将被移除的原文",
        ),
        reply = await discussion.submitDiscussion(
          target,
          b,
          "其他作者保留的回复",
          root.id,
        );
      await discussion.deleteDiscussionBody(a, root.id, randomUUID());
      const page = await discussion.readDiscussion(target, b, query);
      expect(page.items[0]?.text).toBe("This comment has been deleted");
      expect(page.items[0]?.replies[0]?.id).toBe(reply.id);
      await expect(
        discussion.deleteDiscussionBody(a, reply.id, randomUUID()),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      await expect(
        discussion.removeDiscussionThread(operator, root.id, randomUUID(), 1),
      ).rejects.toBeInstanceOf(CommunityConflictError);
      const request = randomUUID();
      expect(
        await discussion.removeDiscussionThread(operator, root.id, request, 2),
      ).toEqual({ removed: 2 });
      expect(
        await discussion.removeDiscussionThread(operator, root.id, request, 2),
      ).toEqual({ removed: 2 });
      expect(
        (await discussion.readDiscussion(target, a, query)).items,
      ).toHaveLength(0);
      expect((await discussion.ownComments(b, query)).items).toHaveLength(0);
      await expect(
        discussion.readDiscussionReplies(target, root.id, a, query),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      expect(
        Number(
          (
            await pool.query(
              "SELECT count(*) AS n FROM community.moderation_events WHERE operator_label=$1 AND action='remove_thread'",
              [operator],
            )
          ).rows[0]?.n,
        ),
      ).toBe(1);
    });
    it("does not create a public tombstone from a never-public deleted reply when its root is later approved", async () => {
      const target = { type: "work" as const, id: work };
      await pool.query(
        "UPDATE community.publication_setting SET policy='PRE_MODERATION' WHERE id='publication'",
      );
      const root = await discussion.submitDiscussion(target, a, "先私有根");
      await pool.query(
        "UPDATE community.publication_setting SET policy='DIRECT_PUBLICATION' WHERE id='publication'",
      );
      const reply = await discussion.submitDiscussion(
        target,
        a,
        "从未公开的回复",
        root.id,
      );
      await discussion.deleteDiscussionBody(a, reply.id, randomUUID());
      await pool.query(
        "UPDATE community.catalog_comments SET moderation='visible',moderated_by='test-owner',moderated_at=CURRENT_TIMESTAMP WHERE id=$1",
        [root.id],
      );
      expect(
        (await discussion.readDiscussion(target, null, query)).items[0]
          ?.replyTotal,
      ).toBe(0);
    });
    it("keeps private list totals owner-only and permits duplicate display names", async () => {
      const own = await adapter.readProfile(a, a),
        visitor = await adapter.readProfile(a, b);
      expect(own.totals.favorites).toBe(0);
      expect(visitor.totals.favorites).toBeNull();
      expect(visitor.totals.likes).toBeNull();
      await adapter.updateProfile(a, {
        requestId: randomUUID(),
        displayName: "同名作者",
        bio: "新的简介",
      });
      expect((await adapter.readProfile(a, b)).bio).toBe("新的简介");
      await adapter.updatePrivacy(a, {
        requestId: randomUUID(),
        privacy: {
          following: "private",
          followers: "private",
          favorites: "public",
          likes: "public",
        },
      });
      const changed = await adapter.readProfile(a, b);
      expect(changed.totals.following).toBeNull();
      expect(changed.totals.followers).toBeNull();
      expect(changed.totals.favorites).toBe(0);
      await expect(
        adapter.listPeople(a, b, "following", query),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
    });
    it("serializes reciprocal follows and blocking, removes both directions, and does not restore them", async () => {
      await Promise.all([
        adapter.follow(a, {
          requestId: randomUUID(),
          targetId: b,
          enabled: true,
        }),
        adapter.follow(b, {
          requestId: randomUUID(),
          targetId: a,
          enabled: true,
        }),
      ]);
      expect((await adapter.listPeople(a, a, "following", query)).total).toBe(
        1,
      );
      await adapter.block(a, {
        requestId: randomUUID(),
        targetId: b,
        enabled: true,
      });
      await expect(adapter.readProfile(a, b)).rejects.toBeInstanceOf(
        CommunityNotFoundError,
      );
      await expect(adapter.readWork(work, b)).rejects.toBeInstanceOf(
        CommunityNotFoundError,
      );
      await expect(
        adapter.follow(b, {
          requestId: randomUUID(),
          targetId: a,
          enabled: true,
        }),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      expect((await adapter.readWork(work, null)).id).toBe(work);
      expect((await adapter.listPeople(a, a, "blocks", query)).total).toBe(1);
      await adapter.block(a, {
        requestId: randomUUID(),
        targetId: b,
        enabled: false,
      });
      expect((await adapter.listPeople(a, a, "following", query)).total).toBe(
        0,
      );
      expect((await adapter.listPeople(b, b, "following", query)).total).toBe(
        0,
      );
    });
    it("binds receipts to exact commands and commits one matching audit", async () => {
      const input = { requestId: randomUUID(), displayName: "已保存", bio: "" };
      await Promise.all([
        adapter.updateProfile(a, input),
        adapter.updateProfile(a, input),
      ]);
      expect(
        (
          await pool.query(
            "SELECT id FROM community.author_events WHERE actor_id=$1 AND action='profile.update'",
            [a],
          )
        ).rowCount,
      ).toBe(1);
      await expect(
        adapter.updateProfile(a, { ...input, displayName: "不同内容" }),
      ).rejects.toBeInstanceOf(CommunityConflictError);
      expect((await adapter.readProfile(a, a)).displayName).toBe("已保存");
    });
    it("keeps a directly inserted Phase 4 work public through its legacy revision and edits it through publishing without changing its identity", async () => {
      // The legacy bridge gives the fixture work its public and author revision.
      const legacy = await adapter.readWork(work, b);
      expect(legacy).toMatchObject({
        title: "合成作品",
        text: "原始已发布内容",
        firstPublishedAt: "2026-01-01T00:00:00.000Z",
        editedAt: null,
        available: true,
        version: 1,
      });
      const editable = await publishing.readEditableWork(a, work);
      const session = id("publishing-session");
      await pool.query(
        "INSERT INTO community.publishing_sessions(id,owner_id,save_mode,work_id,state,lease_expires_at) VALUES($1,$2,'unsaved',$3,'active','2100-01-01T00:00:00Z')",
        [session, a, work],
      );
      const editedAt = new Date("2026-09-13T12:00:00.000Z");
      const receipt = await publishing.submit(
        a,
        {
          requestId: randomUUID(),
          holder: { sessionId: session },
          content: { ...editable.content, body: "发布后的新正文" },
          baseRevisionId: editable.revisionId,
        },
        editedAt,
      );
      expect(receipt).toMatchObject({ state: "confirmed", workId: work });
      expect(await adapter.readWork(work, b)).toMatchObject({
        id: work,
        authorId: a,
        text: "发布后的新正文",
        firstPublishedAt: "2026-01-01T00:00:00.000Z",
        editedAt: editedAt.toISOString(),
      });
      await expect(adapter.readWork(work, null)).resolves.toMatchObject({
        text: "发布后的新正文",
      });
    });
    it("keeps an operator-hidden work hidden after an edit and moving it to the recycle bin leaves the favorite relation", async () => {
      await adapter.changeRelation(b, "favorite", {
        requestId: randomUUID(),
        target: { type: "work", id: work },
        enabled: true,
      });
      await pool.query(
        "UPDATE community.works SET operator_state='hidden' WHERE id=$1",
        [work],
      );
      const editable = await publishing.readEditableWork(a, work);
      const session = id("publishing-session");
      await pool.query(
        "INSERT INTO community.publishing_sessions(id,owner_id,save_mode,work_id,state,lease_expires_at) VALUES($1,$2,'unsaved',$3,'active','2100-01-01T00:00:00Z')",
        [session, a, work],
      );
      await publishing.submit(
        a,
        {
          requestId: randomUUID(),
          holder: { sessionId: session },
          content: { ...editable.content, title: "更新" },
          baseRevisionId: editable.revisionId,
        },
        new Date("2026-09-13T12:00:00.000Z"),
      );
      await expect(adapter.readWork(work, b)).rejects.toBeInstanceOf(
        CommunityNotFoundError,
      );
      expect(await adapter.readWork(work, a)).toMatchObject({
        title: "更新",
        available: false,
      });
      await publishing.trashWork(
        a,
        work,
        { requestId: randomUUID() },
        new Date("2026-09-13T13:00:00.000Z"),
      );
      await expect(adapter.readWork(work, a)).rejects.toBeInstanceOf(
        CommunityNotFoundError,
      );
      expect(
        (
          await pool.query(
            "SELECT 1 FROM community.content_relations WHERE user_id=$1 AND content_id=$2",
            [b, work],
          )
        ).rowCount,
      ).toBe(1);
    });
    it("unions guest favorites idempotently without moving an existing account item", async () => {
      const target = { type: "work" as const, id: work };
      await adapter.changeRelation(a, "favorite", {
        requestId: randomUUID(),
        target,
        enabled: true,
      });
      const old = (
        await pool.query<{ created_at: Date }>(
          "SELECT created_at FROM community.content_relations WHERE user_id=$1",
          [a],
        )
      ).rows[0]!.created_at.toISOString();
      const input = {
        expectedAccountId: a,
        requestId: randomUUID(),
        items: [target, target],
      };
      await adapter.mergeGuestFavorites(a, input);
      await adapter.mergeGuestFavorites(a, input);
      const rows = (
        await pool.query<{ created_at: Date }>(
          "SELECT created_at FROM community.content_relations WHERE user_id=$1",
          [a],
        )
      ).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]!.created_at.toISOString()).toBe(old);
    });
    it("enforces media ownership through HTTP and limits successful avatar changes across devices", async () => {
      const base = await server(),
        ta = await signIn(base, a),
        tb = await signIn(base, b);
      const image = await upload(base, ta);
      expect(
        (await fetch(`${base}/v1/community/media/${image.id}`)).status,
      ).toBe(404);
      expect(
        (
          await fetch(`${base}/v1/community/media/${image.id}`, {
            headers: { authorization: `Bearer ${tb}` },
          })
        ).status,
      ).toBe(404);
      await expect(
        adapter.updateAvatar(b, { requestId: randomUUID(), mediaId: image.id }),
      ).rejects.toBeInstanceOf(CommunityNotFoundError);
      const results = await Promise.allSettled([
        adapter.updateAvatar(a, { requestId: randomUUID(), mediaId: image.id }),
        adapter.updateAvatar(a, { requestId: randomUUID(), mediaId: image.id }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(
        (await fetch(`${base}/v1/community/media/${image.id}`)).status,
      ).toBe(200);
      const permit = (await adapter.readProfile(a, a)).nextAvatarChangeAt;
      expect(permit).not.toBeNull();
    });
    it("uses New York calendar dates including short and long DST days", async () => {
      const rows = (
        await pool.query<{
          start: string;
          hours: number;
        }>(`SELECT d::text AS start, extract(epoch FROM
        (((d+1)::timestamp AT TIME ZONE 'America/New_York')-(d::timestamp AT TIME ZONE 'America/New_York')))/3600 AS hours
        FROM unnest(ARRAY['2026-03-08'::date,'2026-11-01'::date]) d`)
      ).rows;
      expect(rows.map((r) => Number(r.hours))).toEqual([23, 25]);
    });
    it("rejects unknown fields, missing authentication and hostile uploads without storing media", async () => {
      const base = await server(),
        token = await signIn(base, a);
      const post = (path: string, body: unknown, auth = true) =>
        fetch(`${base}/v1/community/${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(auth ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
        });
      expect(
        (
          await post("me/profile", {
            requestId: randomUUID(),
            displayName: "合法",
            bio: "",
            role: "owner",
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await post(
            "me/profile",
            { requestId: randomUUID(), displayName: "合法", bio: "" },
            false,
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await post("me/privacy", {
            requestId: randomUUID(),
            privacy: {
              following: "public",
              followers: "public",
              favorites: "public",
              likes: 2147483648,
            },
          })
        ).status,
      ).toBe(422);
      const invalid = await fetch(`${base}/v1/community/media`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "image/png",
          "x-request-id": randomUUID(),
        },
        body: "not an image",
      });
      expect(invalid.status).toBe(422);
      expect(
        (
          await pool.query(
            "SELECT 1 FROM community.user_media WHERE owner_id=$1",
            [a],
          )
        ).rowCount,
      ).toBe(0);
    });
    it("rejects malformed credentials, account-switch writes and nondecimal transport queries", async () => {
      const base = await server(),
        token = await signIn(base, a);
      for (const authorization of [
        "invalid",
        "Bearer",
        "Basic synthetic",
        "Bearer invalid",
      ]) {
        expect(
          (
            await fetch(`${base}/v1/community/authors/${a}`, {
              headers: { authorization },
            })
          ).status,
        ).toBe(401);
      }
      for (const page of ["1e2", "0x10", "+2", " 2 ", "01"]) {
        expect(
          (
            await fetch(
              `${base}/v1/community/authors/${a}/works?page=${encodeURIComponent(page)}`,
            )
          ).status,
        ).toBe(422);
      }
      const requestId = randomUUID();
      const update = {
        requestId,
        displayName: "应被拒绝的跨账号写入",
        bio: "",
      };
      expect(
        (
          await fetch(`${base}/v1/community/me/profile`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
              "x-author-account": b,
            },
            body: JSON.stringify(update),
          })
        ).status,
      ).toBe(401);
      expect((await adapter.readProfile(a, a)).displayName).toBe("同名作者");
      expect(
        (
          await pool.query(
            "SELECT 1 FROM community.author_command_receipts WHERE actor_id=$1 AND request_id=$2",
            [a, requestId],
          )
        ).rowCount,
      ).toBe(0);
      const noReceipt = await fetch(`${base}/v1/community/media`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "image/png",
        },
        body: "invalid",
      });
      expect(noReceipt.status).toBe(422);
    });
    it("does not compose any Phase 4 route in Production even with an adapter supplied", async () => {
      const base = await server("production");
      for (const route of [
        "discover",
        "filter-options",
        `content/work/${work}/card`,
        `discussion/work/${work}`,
        "me/comments",
        "me/blocks",
        "publishing/drafts",
      ])
        expect((await fetch(`${base}/v1/community/${route}`)).status).toBe(404);
      expect((await fetch(`${base}/v1/community/authors/${a}`)).status).toBe(
        404,
      );
      expect((await fetch(`${base}/v1/community/works/${work}`)).status).toBe(
        404,
      );
      expect(
        (await fetch(`${base}/v1/development/sign-in`, { method: "POST" }))
          .status,
      ).toBe(404);
    });
  });
};
