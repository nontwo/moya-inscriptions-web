import { randomUUID } from "node:crypto";

import { AgentAdministrationService } from "@moya/api";
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
      await pool.query("DELETE FROM community.agent_operations");
      await pool.query("DELETE FROM community.agent_delegations");
      await pool.query("DELETE FROM community.agent_principals");
      await pool.query("DELETE FROM community.moderation_events");
      await pool.query(
        "DELETE FROM community.catalog_comments WHERE author_id=$1",
        [author],
      );
      await pool.query("DELETE FROM community.public_users WHERE id=$1", [
        author,
      ]);
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
