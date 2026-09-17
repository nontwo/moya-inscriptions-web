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
const PRINCIPAL = "agent-pg-fence";

/**
 * The fence, witnessed rather than asserted (Issue #141 r7).
 *
 * An ordered recommendation command being atomic does not by itself stop an
 * executor that has lost the right to execute from committing anyway: it can
 * stall between claiming its lease and opening its transaction, or sit waiting
 * for the shared lock while a cancellation wins. These cases drive those exact
 * interleavings on separate connections with explicit synchronisation, and each
 * one carries a negative control that removes only the guard under test and
 * shows the bad outcome returning.
 */
export const registerAgentFencingTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Execution fencing on PostgreSQL", () => {
    const agent = new PostgresAgentAdministrationAdapter(pool);
    const comments = new PostgresCommunityCommentAdapter(pool);
    const identity = new PostgresCommunityIdentityAdapter(pool);
    const content = new PostgresCommunityContentOperatorAdapter(pool);
    let author: string;
    let works: string[] = [];
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
         VALUES ($1,$2,$3,'合成正文','2026-01-02','agent-fencing-test')`,
        [workId, author, title],
      );
      return workId;
    };

    const featured = async () =>
      (
        await pool.query<{ content_id: string; position: string }>(
          `SELECT content_id,position FROM community.featured_content
            WHERE content_id = ANY($1::text[]) ORDER BY position`,
          [works],
        )
      ).rows.map((row) => row.content_id);

    const receipts = async () =>
      (
        await pool.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM community.content_operator_receipts WHERE operator_label=$1",
          [PRINCIPAL],
        )
      ).rows[0]!.n;

    const auditRows = async () =>
      (
        await pool.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM community.content_operator_events WHERE operator_label=$1",
          [PRINCIPAL],
        )
      ).rows[0]!.n;

    /** The command an executor would send, with its frozen versions. */
    const commandFor = (
      targets: readonly string[],
      requestId = randomUUID(),
    ) => ({
      requestId,
      items: targets.map((target, index) => ({
        target: { type: "work" as const, id: target },
        enabled: true,
        position: 40 + index,
        expectedVersion: 0,
      })),
    });

    const approvedOperation = async (targets: readonly string[]) => {
      const prepared = await service.prepareFeatured(PRINCIPAL, {
        requestId: randomUUID(),
        items: targets.map((target, index) => ({
          target: { type: "work" as const, id: target },
          enabled: true,
          position: 40 + index,
        })),
      });
      await service.approve({
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      return prepared;
    };

    /** A second connection that can hold a transaction open on purpose. */
    /**
     * Only what these cases need from a dedicated connection. The tests
     * workspace does not depend on `pg` directly, so the shape is declared
     * here rather than imported.
     */
    type Client = {
      query: (sql: string, values?: readonly unknown[]) => Promise<unknown>;
      release: () => void;
    };
    let other: Client | null = null;
    const otherClient = async (): Promise<Client> => {
      const client = await (pool.connect as () => Promise<Client>)();
      other = client;
      return client;
    };

    /** Whether a promise is still unsettled after the event loop has drained. */
    const pending = async (promise: Promise<unknown>, ms = 300) => {
      const sentinel = Symbol("pending");
      const result = await Promise.race([
        promise.then(
          () => "settled" as const,
          () => "settled" as const,
        ),
        new Promise<typeof sentinel>((resolve) =>
          setTimeout(() => resolve(sentinel), ms),
        ),
      ]);
      return result === sentinel;
    };

    beforeEach(async () => {
      now = new Date();
      author = id("user");
      await pool.query(
        "INSERT INTO community.public_users(id,handle,display_name,status) VALUES($1,$2,'围栏测试作者','active')",
        [author, `fence-${randomUUID().slice(0, 8)}`],
      );
      works = [await seedWork("围栏甲"), await seedWork("围栏乙")];
      await service.writePrincipal({
        requestId: randomUUID(),
        label: PRINCIPAL,
        displayName: "PG 围栏代理",
        scopes: [
          "content:read",
          "comments:read",
          "comments:moderate",
          "featured:write",
          "operations:execute",
          "operations:undo",
        ],
        enabled: true,
        expectedVersion: 0,
      });
    });

    afterEach(async () => {
      if (other !== null) {
        await other.query("ROLLBACK").catch(() => undefined);
        other.release();
        other = null;
      }
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
        [works],
      );
      await cleanupPublishingData(pool, [author]);
      await pool.query("DELETE FROM community.works WHERE author_id=$1", [
        author,
      ]);
      await pool.query("DELETE FROM community.public_users WHERE id=$1", [
        author,
      ]);
    });

    it("refuses a stalled executor that lost its lease before it reached the transaction", async () => {
      const operation = await approvedOperation(works);
      await agent.claimExecution(operation.id, "A.1", now, 60_000);
      // A stalls. Its lease expires and a newer attempt takes the operation
      // over; only then does A reach the mutation.
      now = new Date(now.getTime() + 61_000);
      const taken = await agent.claimExecution(
        operation.id,
        "B.1",
        now,
        60_000,
      );
      expect(taken?.claimed).toBe(true);
      await expect(
        content.setFeaturedOrder(PRINCIPAL, commandFor(works), {
          operationId: operation.id,
          leaseOwner: "A.1",
          at: now,
        }),
      ).rejects.toThrow("Execution right was lost");
      expect(await featured()).toEqual([]);
      expect(await receipts()).toBe(0);
      expect(await auditRows()).toBe(0);
    });

    it("refuses a stalled executor whose operation was cancelled before it reached the transaction", async () => {
      const operation = await approvedOperation(works);
      await agent.claimExecution(operation.id, "A.1", now, 60_000);
      await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      await expect(
        content.setFeaturedOrder(PRINCIPAL, commandFor(works), {
          operationId: operation.id,
          leaseOwner: "A.1",
          at: now,
        }),
      ).rejects.toThrow("Execution right was lost");
      expect(await featured()).toEqual([]);
      expect(await receipts()).toBe(0);
    });

    it("NEGATIVE CONTROL: the same stalled executor does commit when the fence is not passed", async () => {
      const operation = await approvedOperation(works);
      await agent.claimExecution(operation.id, "A.1", now, 60_000);
      now = new Date(now.getTime() + 61_000);
      await agent.claimExecution(operation.id, "B.1", now, 60_000);
      // Exactly the same call as the two cases above, with the fence argument
      // removed and nothing else changed. The late commit returns, which is
      // what the fence is there to stop.
      const written = await content.setFeaturedOrder(
        PRINCIPAL,
        commandFor(works),
      );
      expect(written.items).toHaveLength(2);
      expect(await featured()).toEqual(works);
      expect(await receipts()).toBe(1);
    });

    it("revalidates after waiting for the shared lock, not before it", async () => {
      const operation = await approvedOperation(works);
      await agent.claimExecution(operation.id, "A.1", now, 60_000);
      const holder = await otherClient();
      await holder.query("BEGIN");
      await holder.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('phase4-content-operator',0))",
      );
      // A is now blocked on the advisory lock, before it has read anything.
      const attempt = content
        .setFeaturedOrder(PRINCIPAL, commandFor(works), {
          operationId: operation.id,
          leaseOwner: "A.1",
          at: now,
        })
        .then(
          () => "committed" as const,
          (error: Error) => error.message,
        );
      expect(await pending(attempt)).toBe(true);
      // A's right to execute changes while it waits.
      await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      await holder.query("COMMIT");
      holder.release();
      other = null;
      // A now gets the lock. A snapshot taken before the wait would still show
      // an uncancelled operation and would let A through; the fence reads
      // current state, so A refuses.
      expect(await attempt).toContain("Execution right was lost");
      expect(await featured()).toEqual([]);
      expect(await receipts()).toBe(0);
    });

    it("cannot conclude that nothing committed while the command is still open, and sees the truth once it resolves", async () => {
      const command = commandFor(works);
      const holder = await otherClient();
      await holder.query("BEGIN");
      await holder.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('phase4-content-operator',0))",
      );
      // The writer has its receipt in place but has not committed.
      await holder.query(
        `INSERT INTO community.content_operator_receipts(operator_label,request_id,fingerprint,result)
         VALUES ($1,$2,'unused','{"kind":"featured.order","items":[]}'::jsonb)`,
        [PRINCIPAL, command.requestId],
      );
      const read = content
        .findFeaturedOrder(PRINCIPAL, command)
        .then(() => "answered" as const);
      expect(await pending(read)).toBe(true);
      // NEGATIVE CONTROL: the same question asked without the shared lock does
      // answer, and answers "nothing committed" — the wrong conclusion the
      // synchronisation exists to prevent.
      const unsynchronised = await pool.query(
        "SELECT fingerprint FROM community.content_operator_receipts WHERE operator_label=$1 AND request_id=$2",
        [PRINCIPAL, command.requestId],
      );
      expect(unsynchronised.rows).toHaveLength(0);
      await holder.query("ROLLBACK");
      holder.release();
      other = null;
      expect(await read).toBe("answered");
      // The writer rolled back, so no effect is invented from its attempt.
      expect(await content.findFeaturedOrder(PRINCIPAL, command)).toBeNull();
      expect(await featured()).toEqual([]);
    });

    it("completes, rather than cancels, an operation whose command had already committed", async () => {
      const operation = await approvedOperation(works);
      const done = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      expect(done.tally.applied).toBe(2);
      // The command committed; the progress write was lost, and the Owner then
      // cancelled the operation that looked stuck.
      await pool.query(
        `UPDATE community.agent_operations
            SET next_index=0, results='[]'::jsonb, state='executing',
                lease_owner=NULL, lease_expires_at=NULL
          WHERE id=$1`,
        [operation.id],
      );
      await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      const finished = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      // A cancellation request that arrived after the command committed is a
      // request that did not take effect, not a cancellation.
      expect(finished).toMatchObject({
        state: "completed",
        tally: { applied: 2, cancelled: 0 },
      });
      expect(finished.cancelRequestedAt).not.toBeNull();
      expect(await featured()).toEqual(works);
      // And the committed work stays undoable, which a cancelled record denied.
      const undo = await service.prepareUndo(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      expect(undo).toMatchObject({ kind: "featured.set", targetCount: 2 });
    });

    it("cancels, rather than completing, when the fence is lost and nothing committed", async () => {
      const operation = await approvedOperation(works);
      // No pre-claim: the executor under test must take its own lease, or it
      // never reaches the lock and the interleaving is not the one intended.
      const holder = await otherClient();
      await holder.query("BEGIN");
      await holder.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('phase4-content-operator',0))",
      );
      // The executor is inside runOrdered, blocked on the shared lock, when the
      // Owner cancels. Its fence will fail, and the operation must not go
      // terminal as completed on the strength of that failure.
      const attempt = service
        .execute(PRINCIPAL, {
          requestId: randomUUID(),
          operationId: operation.id,
        })
        .catch((error: Error) => ({ error: error.message }));
      expect(await pending(attempt)).toBe(true);
      await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      await holder.query("COMMIT");
      holder.release();
      other = null;
      const finished = await attempt;
      expect(finished).toMatchObject({
        state: "cancelled",
        tally: { applied: 0, cancelled: 2, conflicts: 0 },
      });
      expect(await featured()).toEqual([]);
      expect(await receipts()).toBe(0);
    });

    it("reports the earlier committed command when the fence is lost after it committed", async () => {
      const operation = await approvedOperation(works);
      const done = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      expect(done.tally.applied).toBe(2);
      // The progress write was lost, so the operation looks unexecuted. A new
      // attempt starts, blocks on the shared lock, and the Owner cancels while
      // it waits. Its fence fails — but an earlier attempt's rows are live, and
      // the receipt is the only thing that knows.
      await pool.query(
        `UPDATE community.agent_operations
            SET next_index=0, results='[]'::jsonb, state='executing',
                lease_owner=NULL, lease_expires_at=NULL
          WHERE id=$1`,
        [operation.id],
      );
      const holder = await otherClient();
      await holder.query("BEGIN");
      await holder.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('phase4-content-operator',0))",
      );
      const attempt = service
        .execute(PRINCIPAL, {
          requestId: randomUUID(),
          operationId: operation.id,
        })
        .catch((error: Error) => ({ error: error.message }));
      expect(await pending(attempt)).toBe(true);
      await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      await holder.query("COMMIT");
      holder.release();
      other = null;
      const finished = await attempt;
      // Live rows the tally denies and the undo refuses to cover is the exact
      // failure this work exists to remove; it must not come back through the
      // fence's own error path.
      expect(finished).toMatchObject({
        state: "completed",
        tally: { applied: 2, conflicts: 0, cancelled: 0 },
      });
      expect(await featured()).toEqual(works);
      const undo = await service.prepareUndo(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      expect(undo).toMatchObject({ kind: "featured.set", targetCount: 2 });
    });

    it("lets a committed transition replay even after its executor lost the fence", async () => {
      const commentId = id("comment");
      await pool.query(
        "INSERT INTO community.catalog_comments(id,catalog_id,author_id,text,moderation) VALUES($1,'catalog-fence-02',$2,'可重放评论','visible')",
        [commentId, author],
      );
      const prepared = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids: [commentId],
      });
      await service.approve({
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      await agent.claimExecution(prepared.id, "A.1", now, 60_000);
      const command = {
        requestId: randomUUID(),
        fingerprint: "replay-after-fence-loss",
        fence: { operationId: prepared.id, leaseOwner: "A.1", at: now },
      };
      const audit = () => ({
        id: id("moderation"),
        occurredAt: now,
        operatorLabel: PRINCIPAL,
        action: "hide" as const,
      });
      const applied = await comments.applyCommentModeration(
        commentId as never,
        "hidden",
        ["visible"],
        PRINCIPAL,
        now,
        audit(),
        command,
      );
      expect(applied).toMatchObject({ moderation: "hidden" });
      // The executor loses the operation, then repeats its own command. Reading
      // back a committed fact creates no effect, so it must still replay rather
      // than be reported as a conflict.
      await service.cancel(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      const replay = await comments.applyCommentModeration(
        commentId as never,
        "hidden",
        ["visible"],
        PRINCIPAL,
        now,
        audit(),
        command,
      );
      expect(replay).toMatchObject({ moderation: "hidden" });
      expect(
        (
          await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM community.moderation_events WHERE subject_id=$1",
            [commentId],
          )
        ).rows[0]!.n,
      ).toBe(1);
      await pool.query("DELETE FROM community.catalog_comments WHERE id=$1", [
        commentId,
      ]);
    });

    it("keeps the business identity stable across a lease take-over, so a legitimate retry replays", async () => {
      const operation = await approvedOperation(works);
      const first = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      expect(first.tally.applied).toBe(2);
      // The progress write is lost and a different executor takes over. The
      // fence changes, the canonical command does not, so the retry replays its
      // own receipt instead of conflicting with it.
      await pool.query(
        `UPDATE community.agent_operations
            SET next_index=0, results='[]'::jsonb, state='approved',
                lease_owner=NULL, lease_expires_at=NULL
          WHERE id=$1`,
        [operation.id],
      );
      const again = await service.execute(PRINCIPAL, {
        requestId: randomUUID(),
        operationId: operation.id,
      });
      expect(again).toMatchObject({
        state: "completed",
        tally: { applied: 2, conflicts: 0 },
      });
      expect(await receipts()).toBe(1);
      expect(await auditRows()).toBe(3);
    });

    it("fences the comment path at the same boundary, without changing chunk cancellation", async () => {
      const commentId = id("comment");
      await pool.query(
        "INSERT INTO community.catalog_comments(id,catalog_id,author_id,text,moderation) VALUES($1,'catalog-fence-01',$2,'围栏评论','visible')",
        [commentId, author],
      );
      const prepared = await service.prepareComments(PRINCIPAL, {
        requestId: randomUUID(),
        action: "hide",
        ids: [commentId],
      });
      await service.approve({
        requestId: randomUUID(),
        operationId: prepared.id,
      });
      await agent.claimExecution(prepared.id, "A.1", now, 60_000);
      now = new Date(now.getTime() + 61_000);
      await agent.claimExecution(prepared.id, "B.1", now, 60_000);
      // A, having lost the operation, tries its transition anyway.
      await expect(
        comments.applyCommentModeration(
          commentId as never,
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
          {
            requestId: randomUUID(),
            fingerprint: "fence-test",
            fence: {
              operationId: prepared.id,
              leaseOwner: "A.1",
              at: now,
            },
          },
        ),
      ).rejects.toThrow("Execution right was lost");
      expect(
        (
          await pool.query<{ moderation: string }>(
            "SELECT moderation FROM community.catalog_comments WHERE id=$1",
            [commentId],
          )
        ).rows[0]!.moderation,
      ).toBe("visible");
      expect(
        (
          await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM community.moderation_events WHERE subject_id=$1",
            [commentId],
          )
        ).rows[0]!.n,
      ).toBe(0);
      await pool.query("DELETE FROM community.catalog_comments WHERE id=$1", [
        commentId,
      ]);
    });
  });
};
