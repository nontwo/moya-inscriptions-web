import { randomUUID } from "node:crypto";

import { AgentAdministrationService } from "@moya/api";
import {
  PostgresAgentAdministrationAdapter,
  PostgresCommunityCommentAdapter,
  PostgresCommunityContentOperatorAdapter,
  PostgresCommunityIdentityAdapter,
} from "@moya/community-postgres";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupPublishingData } from "./work-publishing-content-cases.js";

import type { createPostgresPool } from "@moya/catalog-postgres";

const id = (prefix: string) => `${prefix}-${randomUUID().replaceAll("-", "")}`;
const PRINCIPAL = "agent-pg-curator";

/**
 * One ordered recommendation command on the real adapter (Issue #141 r6).
 *
 * "Recommend these works in this order" is one business command: the whole
 * requested set commits with its audit events and its authoritative receipt in
 * one transaction, or nothing commits. These cases are the ones that a
 * collection of per-target optimistic writes cannot pass.
 */
export const registerAgentRecommendationTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Ordered recommendation on PostgreSQL", () => {
    const agent = new PostgresAgentAdministrationAdapter(pool);
    const comments = new PostgresCommunityCommentAdapter(pool);
    const identity = new PostgresCommunityIdentityAdapter(pool);
    const content = new PostgresCommunityContentOperatorAdapter(pool);
    let author: string;
    let works: string[] = [];
    /** Rows the suite creates outside `works`, cleaned even when a case fails. */
    let extra: string[] = [];
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

    const seedWork = async (title: string) => {
      const workId = id("work");
      await pool.query(
        `INSERT INTO community.works
           (id,author_id,title,text,first_published_at,synthetic_provenance)
         VALUES ($1,$2,$3,'合成正文','2026-01-02','agent-recommendation-test')`,
        [workId, author, title],
      );
      return workId;
    };

    /** The featured rows this suite created, in the store's own read order. */
    const featured = async () =>
      (
        await pool.query<{
          content_id: string;
          enabled: boolean;
          position: string;
          version: number;
        }>(
          `SELECT content_id,enabled,position,version
             FROM community.featured_content
            WHERE content_id = ANY($1::text[])
            ORDER BY position, content_type, content_id`,
          [works],
        )
      ).rows.map((row) => ({
        id: row.content_id,
        enabled: row.enabled,
        position: Number(row.position),
        version: row.version,
      }));

    const order = async () => (await featured()).map((row) => row.id);

    const receipts = async () =>
      (
        await pool.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM community.content_operator_receipts WHERE operator_label=$1",
          [PRINCIPAL],
        )
      ).rows[0]!.n;

    const events = async (action: string) =>
      (
        await pool.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM community.content_operator_events WHERE operator_label=$1 AND action=$2",
          [PRINCIPAL, action],
        )
      ).rows[0]!.n;

    const prepare = async (
      items: readonly {
        readonly id: string;
        readonly enabled?: boolean;
        readonly position: number;
      }[],
    ) =>
      service.prepareFeatured(PRINCIPAL, {
        requestId: randomUUID(),
        items: items.map((item) => ({
          target: { type: "work" as const, id: item.id },
          enabled: item.enabled ?? true,
          position: item.position,
        })),
      });

    const approved = async (
      items: readonly {
        readonly id: string;
        readonly enabled?: boolean;
        readonly position: number;
      }[],
    ) => {
      const operation = await prepare(items);
      await service.approve({
        requestId: randomUUID(),
        operationId: operation.id,
      });
      return operation;
    };

    const execute = (operationId: string) =>
      service.execute(PRINCIPAL, { requestId: randomUUID(), operationId });

    /** The chunk committed, but its progress write never landed. */
    const lostProgressWrite = async (operationId: string, state = "approved") =>
      pool.query(
        `UPDATE community.agent_operations
            SET next_index=0, results='[]'::jsonb, state=$2,
                lease_owner=NULL, lease_expires_at=NULL
          WHERE id=$1`,
        [operationId, state],
      );

    beforeEach(async () => {
      now = new Date();
      author = id("user");
      await pool.query(
        "INSERT INTO community.public_users(id,handle,display_name,status) VALUES($1,$2,'推荐测试作者','active')",
        [author, `curator-${randomUUID().slice(0, 8)}`],
      );
      extra = [];
      works = [
        await seedWork("作品甲"),
        await seedWork("作品乙"),
        await seedWork("作品丙"),
      ];
      await service.writePrincipal({
        requestId: randomUUID(),
        label: PRINCIPAL,
        displayName: "PG 推荐代理",
        scopes: [
          "content:read",
          "featured:write",
          "operations:execute",
          "operations:undo",
        ],
        enabled: true,
        expectedVersion: 0,
      });
    });

    afterEach(async () => {
      await pool.query(
        "DELETE FROM community.content_operator_receipts WHERE operator_label=$1",
        [PRINCIPAL],
      );
      await pool.query(
        "DELETE FROM community.content_operator_events WHERE operator_label=$1",
        [PRINCIPAL],
      );
      await pool.query("DELETE FROM community.agent_operations");
      await pool.query("DELETE FROM community.agent_delegations");
      await pool.query("DELETE FROM community.agent_principals");
      await pool.query(
        "DELETE FROM community.featured_content WHERE content_id = ANY($1::text[])",
        [[...works, ...extra]],
      );
      await pool.query(
        "DELETE FROM community.featured_users WHERE user_id=$1",
        [author],
      );
      // The legacy bridge gave every seeded work a revision, and the revision
      // holds a foreign key back to the work. This helper is the only order
      // that satisfies that circular pair.
      await cleanupPublishingData(pool, [author]);
      await pool.query("DELETE FROM community.works WHERE author_id=$1", [
        author,
      ]);
      await pool.query("DELETE FROM community.public_users WHERE id=$1", [
        author,
      ]);
    });

    it("writes the requested order as one command, keeps unaffected entries where they were, and leaves one receipt", async () => {
      const [a, b, c] = works as [string, string, string];
      // An entry this command never names, sitting between the requested
      // positions: it must not move and must not change version.
      const other = id("catalog");
      extra.push(other);
      await pool.query(
        "INSERT INTO community.featured_content(content_type,content_id,enabled,position) VALUES('catalog',$1,TRUE,1)",
        [other],
      );
      const operation = await approved([
        { id: a, position: 0 },
        { id: b, position: 2 },
        { id: c, position: 4 },
      ]);
      // Preparation mutates nothing.
      expect(await featured()).toEqual([]);
      const done = await execute(operation.id);
      expect(done).toMatchObject({
        state: "completed",
        tally: { applied: 3, conflicts: 0, failed: 0 },
      });
      expect(await order()).toEqual([a, b, c]);
      const unaffected = (
        await pool.query<{ position: string; version: number }>(
          "SELECT position,version FROM community.featured_content WHERE content_id=$1",
          [other],
        )
      ).rows[0]!;
      expect(Number(unaffected.position)).toBe(1);
      expect(unaffected.version).toBe(1);
      // One command: one authoritative receipt and one command audit event,
      // beside the per-target trail the operator surface already wrote.
      expect(await receipts()).toBe(1);
      expect(await events("featured.order")).toBe(1);
      expect(await events("featured.set")).toBe(3);
    });

    it("refuses the whole command when one target stopped being eligible after preparation", async () => {
      const [a, b, c] = works as [string, string, string];
      const operation = await approved([
        { id: a, position: 0 },
        { id: b, position: 1 },
        { id: c, position: 2 },
      ]);
      // The middle work is hidden by an operator between prepare and execute.
      await pool.query(
        "UPDATE community.works SET operator_state='hidden' WHERE id=$1",
        [b],
      );
      const refused = await execute(operation.id);
      expect(refused.tally).toMatchObject({ applied: 0, conflicts: 3 });
      expect(refused.results[0]!.detail).toContain("public work");
      // Zero partial order: the eligible neighbours were never written.
      expect(await featured()).toEqual([]);
      expect(await receipts()).toBe(0);
      // And the command changed no work's visibility to make itself succeed.
      expect(
        (
          await pool.query<{ operator_state: string; visibility: string }>(
            "SELECT operator_state,visibility FROM community.works WHERE id=$1",
            [a],
          )
        ).rows[0],
      ).toMatchObject({ operator_state: "visible", visibility: "public" });
    });

    it("refuses the whole command when one frozen version went stale", async () => {
      const [a, b, c] = works as [string, string, string];
      const operation = await approved([
        { id: a, position: 0 },
        { id: b, position: 1 },
        { id: c, position: 2 },
      ]);
      // Someone writes the middle row after preparation froze version 0.
      await pool.query(
        "INSERT INTO community.featured_content(content_type,content_id,enabled,position) VALUES('work',$1,TRUE,9)",
        [b],
      );
      const refused = await execute(operation.id);
      expect(refused.tally).toMatchObject({ applied: 0, conflicts: 3 });
      expect(refused.results[0]!.detail).toContain(
        "Featured membership changed",
      );
      expect(await order()).toEqual([b]);
      expect(await receipts()).toBe(0);
    });

    it("serializes two overlapping ordered commands instead of interleaving them", async () => {
      const [a, b, c] = works as [string, string, string];
      const first = await approved([
        { id: a, position: 0 },
        { id: b, position: 1 },
        { id: c, position: 2 },
      ]);
      const second = await approved([
        { id: c, position: 0 },
        { id: a, position: 1 },
        { id: b, position: 2 },
      ]);
      const [one, two] = await Promise.all([
        execute(first.id),
        execute(second.id),
      ]);
      const outcomes = [one.tally.applied, two.tally.applied].sort(
        (left, right) => left - right,
      );
      expect(outcomes).toEqual([0, 3]);
      const winner = one.tally.applied === 3 ? [a, b, c] : [c, a, b];
      // The final state is one whole command's order, never a mixture.
      expect(await order()).toEqual(winner);
      expect(await receipts()).toBe(1);
    });

    it("replays the committed command after a lost response, with no second effect", async () => {
      const [a, b, c] = works as [string, string, string];
      const operation = await approved([
        { id: a, position: 0 },
        { id: b, position: 1 },
        { id: c, position: 2 },
      ]);
      const done = await execute(operation.id);
      expect(done.tally).toMatchObject({ applied: 3 });
      const versions = (await featured()).map((row) => row.version);
      await lostProgressWrite(operation.id);
      const again = await execute(operation.id);
      expect(again).toMatchObject({
        state: "completed",
        tally: { applied: 3, conflicts: 0 },
      });
      expect(await order()).toEqual([a, b, c]);
      expect((await featured()).map((row) => row.version)).toEqual(versions);
      expect(await receipts()).toBe(1);
      expect(await events("featured.order")).toBe(1);
      expect(await events("featured.set")).toBe(3);
    });

    it("cancels before the command runs and writes nothing", async () => {
      const [a, b] = works as [string, string];
      const operation = await approved([
        { id: a, position: 0 },
        { id: b, position: 1 },
      ]);
      // A stalled executor holds the lease, so the cancel is a request rather
      // than an immediate state flip, and the next executor has to decide for
      // itself what the command actually did.
      await agent.claimExecution(operation.id, "stalled.1", now, 60_000);
      const requested = await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      expect(requested.cancelRequestedAt).not.toBeNull();
      now = new Date(now.getTime() + 61_000);
      const cancelled = await execute(operation.id);
      expect(cancelled).toMatchObject({
        state: "cancelled",
        tally: { applied: 0, cancelled: 2 },
      });
      expect(await featured()).toEqual([]);
      expect(await receipts()).toBe(0);
    });

    it("reports a committed command as applied even though the operation is cancelled, and keeps it undoable", async () => {
      const [a, b] = works as [string, string];
      const operation = await approved([
        { id: a, position: 0 },
        { id: b, position: 1 },
      ]);
      await execute(operation.id);
      // The command committed; its progress write was lost and the Owner then
      // cancelled the operation that looked stuck.
      await lostProgressWrite(operation.id, "executing");
      await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      const finished = await execute(operation.id);
      // The operation's own lifecycle state stays `cancelled`, because the
      // Owner did cancel it; what must never be mislabelled is the work. Every
      // target reports applied, so the tally and the undo both see the truth.
      expect(finished).toMatchObject({
        state: "cancelled",
        tally: { applied: 2, cancelled: 0 },
      });
      expect(await order()).toEqual([a, b]);
      // Cancelling is not a rollback, so the real effects stay undoable.
      const undo = await service.prepareUndo(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      expect(undo).toMatchObject({ kind: "featured.set", targetCount: 2 });
    });

    it("undoes the exact prior order atomically", async () => {
      const [a, b, c] = works as [string, string, string];
      // A prior order exists: c, then a.
      const before = await approved([
        { id: c, position: 0 },
        { id: a, position: 1 },
      ]);
      await execute(before.id);
      const prior = await featured();
      const operation = await approved([
        { id: a, position: 0 },
        { id: b, position: 1 },
        { id: c, position: 2 },
      ]);
      await execute(operation.id);
      expect(await order()).toEqual([a, b, c]);
      const undo = await service.prepareUndo(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      await service.approve({
        requestId: randomUUID(),
        operationId: undo.id,
      });
      const restored = await execute(undo.id);
      expect(restored.tally).toMatchObject({ applied: 3, conflicts: 0 });
      const after = await featured();
      expect(
        after
          .filter((row) => row.enabled)
          .map((row) => ({ id: row.id, position: row.position })),
      ).toEqual(
        prior
          .filter((row) => row.enabled)
          .map((row) => ({ id: row.id, position: row.position })),
      );
      // The work that had no prior row is disabled rather than deleted.
      expect(after.find((row) => row.id === b)).toMatchObject({
        enabled: false,
      });
    });

    it("conflicts instead of overwriting a change made after the operation it undoes", async () => {
      const [a, b] = works as [string, string];
      const operation = await approved([
        { id: a, position: 0 },
        { id: b, position: 1 },
      ]);
      await execute(operation.id);
      const undo = await service.prepareUndo(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      await service.approve({
        requestId: randomUUID(),
        operationId: undo.id,
      });
      // An Owner moves one of the rows before the undo runs.
      await pool.query(
        "UPDATE community.featured_content SET position=8,version=version+1 WHERE content_id=$1",
        [b],
      );
      const refused = await execute(undo.id);
      expect(refused.tally).toMatchObject({ applied: 0, conflicts: 2 });
      // The newer state stands, and the other row was not rolled back either.
      expect(await order()).toEqual([a, b]);
      expect((await featured()).find((row) => row.id === b)).toMatchObject({
        position: 8,
      });
    });

    it("replays one identity for the same command and conflicts on a different one", async () => {
      const [a, b] = works as [string, string];
      const requestId = randomUUID();
      const command = {
        requestId,
        items: [
          {
            target: { type: "work" as const, id: a },
            enabled: true,
            position: 0,
            expectedVersion: 0,
          },
          {
            target: { type: "work" as const, id: b },
            enabled: true,
            position: 1,
            expectedVersion: 0,
          },
        ],
      };
      const written = await content.setFeaturedOrder(PRINCIPAL, command);
      expect(written.items.map((item) => item.version)).toEqual([1, 1]);
      const replay = await content.setFeaturedOrder(PRINCIPAL, command);
      expect(replay).toEqual(written);
      expect((await featured()).map((row) => row.version)).toEqual([1, 1]);
      await expect(
        content.setFeaturedOrder(PRINCIPAL, {
          requestId,
          items: command.items.slice(0, 1),
        }),
      ).rejects.toThrow("Request identity already used");
      // The read-only lookup answers the same result and never writes.
      expect(await content.findFeaturedOrder(PRINCIPAL, command)).toEqual(
        written,
      );
      expect(
        await content.findFeaturedOrder(PRINCIPAL, {
          requestId,
          items: command.items.slice(0, 1),
        }),
      ).toBeNull();
      expect(await receipts()).toBe(1);
    });

    it("keeps an explicit recommendation when the author's inherited one is turned off", async () => {
      const [a, b] = works as [string, string];
      await pool.query(
        "INSERT INTO community.featured_users(user_id,enabled) VALUES($1,TRUE)",
        [author],
      );
      const operation = await approved([{ id: a, position: 0 }]);
      await execute(operation.id);
      await pool.query(
        "UPDATE community.featured_users SET enabled=FALSE,version=version+1 WHERE user_id=$1",
        [author],
      );
      // The explicit row survives the inherited recommendation being turned
      // off, and the work that only inherited it has no explicit row at all.
      expect(await featured()).toEqual([
        { id: a, enabled: true, position: 0, version: 1 },
      ]);
      expect(
        (
          await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM community.featured_content WHERE content_id=$1",
            [b],
          )
        ).rows[0]!.n,
      ).toBe(0);
    });

    it("refuses a requested order whose positions do not rise along it", async () => {
      const [a, b] = works as [string, string];
      await expect(
        service.prepareFeatured(PRINCIPAL, {
          requestId: randomUUID(),
          items: [
            { target: { type: "work", id: a }, enabled: true, position: 3 },
            { target: { type: "work", id: b }, enabled: true, position: 1 },
          ],
        }),
      ).rejects.toThrow();
      expect(await featured()).toEqual([]);
    });
  });
};
