import {
  AgentAdministrationService,
  CommunityConflictError,
  CommunityNotFoundError,
  CommunityStoreUnavailableError,
  isAgentForbiddenError,
  targetRequestId,
} from "@moya/api";
import {
  AGENT_OPERATION_CHUNK_SIZE,
  agentOperationDetailSchema,
} from "@moya/contracts/internal/community-operator";
import { describe, expect, it } from "vitest";

import {
  FixtureCatalogPublicationPort,
  InMemoryCommunityCommentPort,
  publishedCatalogId,
} from "./community-comment-fixture.js";
import {
  InMemoryCommunityIdentityPort,
  fixtureUsers,
} from "./community-identity-fixture.js";

import type {
  AgentAdministrationPort,
  AgentFeaturedState,
  AgentOperationDraft,
  CommunityContentOperatorPort,
} from "@moya/api";
import type { CatalogCommentId } from "@moya/contracts";
import type {
  AgentDelegation,
  AgentDelegationQuery,
  AgentOperation,
  AgentOperationApproval,
  AgentOperationDetail,
  AgentOperationPage,
  AgentOperationQuery,
  AgentOperationResult,
  AgentPrincipal,
  FeaturedMutation,
} from "@moya/contracts/internal/community-operator";

/**
 * The service over deterministic in-memory ports: the same comment port the
 * moderation service tests use (so transitions and audit rows are the real
 * ones), a recording content operator port, and an in-memory agent port that
 * mirrors the adapter's fencing (state-named transitions, lease-named writes).
 */
const commentId = (n: number): CatalogCommentId =>
  `comment-${n.toString(16).padStart(32, "0")}` as CatalogCommentId;
const requestId = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const PRINCIPAL = "agent-reviewer";

interface StoredOperation extends AgentOperationDetail {
  fingerprint: string;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
}

const tally = (results: readonly AgentOperationResult[]) => ({
  applied: results.filter((r) => r.outcome === "applied").length,
  conflicts: results.filter((r) => r.outcome === "conflict").length,
  notFound: results.filter((r) => r.outcome === "not_found").length,
  failed: results.filter((r) => r.outcome === "failed").length,
  cancelled: results.filter((r) => r.outcome === "cancelled").length,
});

class InMemoryAgentPort implements AgentAdministrationPort {
  readonly principals = new Map<string, AgentPrincipal>();
  readonly delegations: AgentDelegation[] = [];
  readonly operations = new Map<string, StoredOperation>();
  readonly featured = new Map<string, AgentFeaturedState>();

  private view(stored: StoredOperation, at: Date): AgentOperationDetail {
    const { fingerprint, leaseOwner, leaseExpiresAt, ...rest } = stored;
    void fingerprint;
    return {
      ...rest,
      tally: tally(stored.results),
      leaseHeld:
        leaseOwner !== null &&
        leaseExpiresAt !== null &&
        leaseExpiresAt > at.getTime(),
    };
  }

  async readPrincipals() {
    return [...this.principals.values()];
  }
  async findPrincipal(label: string) {
    return this.principals.get(label) ?? null;
  }
  async writePrincipal(
    input: {
      readonly label: string;
      readonly displayName: string;
      readonly scopes: readonly string[];
      readonly enabled: boolean;
      readonly expectedVersion: number;
    },
    at: Date,
  ) {
    const existing = this.principals.get(input.label);
    if ((existing?.version ?? 0) !== input.expectedVersion) return null;
    if (existing?.revokedAt) return null;
    const written: AgentPrincipal = {
      label: input.label,
      displayName: input.displayName,
      scopes: input.scopes as AgentPrincipal["scopes"],
      enabled: input.enabled,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? at.toISOString(),
      updatedAt: at.toISOString(),
      revokedAt: null,
    };
    this.principals.set(input.label, written);
    return written;
  }
  async revokePrincipal(label: string, expectedVersion: number, at: Date) {
    const existing = this.principals.get(label);
    if (!existing || existing.version !== expectedVersion || existing.revokedAt)
      return null;
    const revoked = {
      ...existing,
      enabled: false,
      revokedAt: at.toISOString(),
      version: existing.version + 1,
    };
    this.principals.set(label, revoked);
    return revoked;
  }
  async readDelegations(query: AgentDelegationQuery, at: Date) {
    return this.delegations.filter(
      (d) =>
        (query.principal === undefined || d.principal === query.principal) &&
        (query.includeInactive ||
          (d.revokedAt === null && new Date(d.expiresAt) > at)),
    );
  }
  async createDelegation(
    input: Parameters<AgentAdministrationPort["createDelegation"]>[0],
    at: Date,
  ) {
    const created: AgentDelegation = {
      id: input.id,
      principal: input.principal,
      kind: input.kind,
      maxTargets: input.maxTargets,
      expiresAt: input.expiresAt.toISOString(),
      createdBy: input.createdBy,
      createdAt: at.toISOString(),
      revokedAt: null,
      revokedBy: null,
    };
    this.delegations.push(created);
    return created;
  }
  async revokeDelegation(id: string, by: string, at: Date) {
    const index = this.delegations.findIndex((d) => d.id === id);
    if (index < 0) return null;
    const current = this.delegations[index]!;
    if (current.revokedAt !== null) return current;
    const revoked = { ...current, revokedAt: at.toISOString(), revokedBy: by };
    this.delegations[index] = revoked;
    return revoked;
  }
  async findActiveDelegation(
    principal: string,
    kind: AgentDelegation["kind"],
    targetCount: number,
    at: Date,
  ) {
    return (
      this.delegations.find(
        (d) =>
          d.principal === principal &&
          d.kind === kind &&
          d.maxTargets >= targetCount &&
          d.revokedAt === null &&
          new Date(d.expiresAt) > at,
      ) ?? null
    );
  }
  /** Exact-match-first over a tiny fixture; same ranking rule as the adapter. */
  users: { id: string; handle: string; displayName: string }[] = [];
  async resolveUsers(query: {
    search?: string | undefined;
    userId?: string | undefined;
    handle?: string | undefined;
    page: number;
    pageSize: number;
  }) {
    const search = query.search ?? "";
    const rank = (user: {
      id: string;
      handle: string;
      displayName: string;
    }) => {
      if (query.userId !== undefined) return user.id === query.userId ? 0 : -1;
      if (query.handle !== undefined)
        return user.handle.toLowerCase() ===
          query.handle.replace(/^@/, "").toLowerCase()
          ? 1
          : -1;
      if (search === "") return 3;
      if (user.id === search) return 0;
      if (user.handle.toLowerCase() === search.replace(/^@/, "").toLowerCase())
        return 1;
      if (user.displayName.toLowerCase() === search.toLowerCase()) return 2;
      return `${user.id} ${user.handle} ${user.displayName}`
        .toLowerCase()
        .includes(search.toLowerCase())
        ? 3
        : -1;
    };
    const kinds = ["id", "handle", "display_name", "substring"] as const;
    const matched = this.users
      .map((user) => ({ user, rank: rank(user) }))
      .filter((row) => row.rank >= 0)
      .sort((a, b) => a.rank - b.rank);
    const best = matched[0]?.rank ?? null;
    const bestCount = matched.filter((row) => row.rank === best).length;
    const uniqueIdentity = bestCount === 1 && (best === 0 || best === 1);
    return {
      items: matched.map((row) => ({
        id: row.user.id,
        handle: row.user.handle,
        displayName: row.user.displayName,
        status: "active" as const,
        matchKind: kinds[row.rank]!,
      })),
      total: matched.length,
      page: query.page,
      pageSize: query.pageSize,
      resolution: {
        status:
          matched.length === 0
            ? ("none" as const)
            : uniqueIdentity
              ? ("exact" as const)
              : ("candidates" as const),
        uniqueIdentity,
        matchKind: best === null ? null : kinds[best]!,
        userId: uniqueIdentity ? (matched[0]!.user.id as never) : null,
        ambiguous: matched.length > 1 && !uniqueIdentity,
      },
    } as never;
  }
  /** The service never reaches this in the unit suite; PostgreSQL covers it. */
  async selectCommentManifest(): Promise<never> {
    throw new Error("selectCommentManifest is covered by the PostgreSQL suite");
  }
  async readOperationTargets(id: string, page: number, pageSize: number) {
    const stored = this.operations.get(id);
    if (stored === undefined) return null;
    const start = (page - 1) * pageSize;
    return {
      operationId: id,
      items: stored.targets.slice(start, start + pageSize),
      total: stored.targetCount,
      page,
      pageSize,
    } as never;
  }
  async readFeaturedStates(targets: readonly { type: string; id: string }[]) {
    const states = new Map<string, AgentFeaturedState>();
    for (const target of targets) {
      const state = this.featured.get(`${target.type}:${target.id}`);
      if (state) states.set(`${target.type}:${target.id}`, state);
    }
    return states;
  }
  async createOperation(draft: AgentOperationDraft) {
    const existing = [...this.operations.values()].find(
      (o) => o.principal === draft.principal && o.requestId === draft.requestId,
    );
    if (existing)
      return existing.fingerprint === draft.fingerprint
        ? { operation: this.view(existing, draft.createdAt), created: false }
        : null;
    const stored: StoredOperation = {
      id: draft.id,
      principal: draft.principal,
      requestId: draft.requestId,
      kind: draft.kind,
      action: draft.action,
      state: draft.approval === null ? "prepared" : "approved",
      approval: draft.approval,
      undoOf: draft.undoOf,
      criteria: draft.criteria,
      targetCount: draft.targets.length,
      nextIndex: 0,
      results: [],
      tally: tally([]),
      version: 1,
      createdAt: draft.createdAt.toISOString(),
      expiresAt: draft.expiresAt.toISOString(),
      approvedAt:
        draft.approval === null ? null : draft.createdAt.toISOString(),
      startedAt: null,
      finishedAt: null,
      cancelRequestedAt: null,
      leaseHeld: false,
      targets: [...draft.targets],
      fingerprint: draft.fingerprint,
      leaseOwner: null,
      leaseExpiresAt: null,
    };
    this.operations.set(stored.id, stored);
    return { operation: this.view(stored, draft.createdAt), created: true };
  }
  async findOperation(id: string) {
    const stored = this.operations.get(id);
    return stored ? this.view(stored, new Date()) : null;
  }
  async readOperations(
    query: AgentOperationQuery,
  ): Promise<AgentOperationPage> {
    const items = [...this.operations.values()].filter(
      (o) =>
        (query.state === undefined || o.state === query.state) &&
        (query.principal === undefined || o.principal === query.principal),
    );
    const at = new Date();
    return {
      items: items.map((o) => {
        const { targets, ...rest } = this.view(o, at);
        void targets;
        return rest as AgentOperation;
      }),
      total: items.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
  async approveOperation(
    id: string,
    approval: AgentOperationApproval,
    at: Date,
  ) {
    const stored = this.operations.get(id);
    if (!stored || stored.state !== "prepared") return null;
    stored.state = "approved";
    stored.approval = approval;
    stored.approvedAt = at.toISOString();
    stored.version += 1;
    return this.view(stored, at);
  }
  async cancelOperation(id: string, at: Date) {
    const stored = this.operations.get(id);
    if (
      !stored ||
      !["prepared", "approved", "executing"].includes(stored.state)
    )
      return null;
    stored.cancelRequestedAt ??= at.toISOString();
    if (stored.state !== "executing") {
      stored.state = "cancelled";
      stored.finishedAt = at.toISOString();
    }
    stored.version += 1;
    return this.view(stored, at);
  }
  async claimExecution(
    id: string,
    leaseOwner: string,
    at: Date,
    leaseMs: number,
  ) {
    const stored = this.operations.get(id);
    if (!stored || !["approved", "executing"].includes(stored.state))
      return null;
    if (
      stored.leaseOwner !== null &&
      stored.leaseExpiresAt !== null &&
      stored.leaseExpiresAt > at.getTime()
    )
      return { operation: this.view(stored, at), claimed: false };
    stored.state = "executing";
    stored.leaseOwner = leaseOwner;
    stored.leaseExpiresAt = at.getTime() + leaseMs;
    stored.startedAt ??= at.toISOString();
    stored.version += 1;
    return { operation: this.view(stored, at), claimed: true };
  }
  async recordChunk(
    id: string,
    leaseOwner: string,
    results: readonly AgentOperationResult[],
    nextIndex: number,
    at: Date,
    options: {
      readonly finalState?: "completed" | "cancelled" | "failed";
      readonly release: boolean;
      readonly leaseMs: number;
    },
  ) {
    const stored = this.operations.get(id);
    if (
      !stored ||
      stored.state !== "executing" ||
      stored.leaseOwner !== leaseOwner ||
      (stored.leaseExpiresAt ?? 0) <= at.getTime()
    )
      return null;
    stored.results = [...stored.results, ...results];
    stored.nextIndex = nextIndex;
    if (options.finalState) {
      stored.state = options.finalState;
      stored.finishedAt = at.toISOString();
    }
    if (options.release || options.finalState) {
      stored.leaseOwner = null;
      stored.leaseExpiresAt = null;
    } else stored.leaseExpiresAt = at.getTime() + options.leaseMs;
    stored.version += 1;
    return this.view(stored, at);
  }
}

/** Records `setFeatured` receipts by request identity, like the real adapter. */
class RecordingContentPort implements CommunityContentOperatorPort {
  readonly rows = new Map<
    string,
    { enabled: boolean; position: number; version: number }
  >();
  readonly receipts = new Map<string, { version: number }>();
  readonly calls: FeaturedMutation[] = [];
  unavailable = false;
  async readWorkTitle() {
    return null;
  }
  async readWorks() {
    return { items: [], total: 0, page: 1, pageSize: 20 } as never;
  }
  async readUsers() {
    return { items: [], total: 0, page: 1, pageSize: 20 } as never;
  }
  async recommendUser() {
    return { version: 1 };
  }
  async moderateWork(): Promise<never> {
    throw new CommunityNotFoundError();
  }
  async readFeatured() {
    return { items: [], total: 0, page: 1, pageSize: 20 } as never;
  }
  async setFeatured(_operator: string, input: FeaturedMutation) {
    if (this.unavailable) throw new CommunityStoreUnavailableError();
    const receipt = this.receipts.get(input.requestId);
    if (receipt) return receipt;
    this.calls.push(input);
    const key = `${input.target.type}:${input.target.id}`;
    const row = this.rows.get(key);
    if ((row?.version ?? 0) !== input.expectedVersion)
      throw new CommunityConflictError("Featured membership changed");
    const written = {
      enabled: input.enabled,
      position: input.position,
      version: (row?.version ?? 0) + 1,
    };
    this.rows.set(key, written);
    this.receipts.set(input.requestId, { version: written.version });
    return { version: written.version };
  }
  async setFeaturedQuantity() {
    return { version: 1 };
  }
}

const createHarness = () => {
  const commentPort = new InMemoryCommunityCommentPort();
  const identityPort = new InMemoryCommunityIdentityPort(
    undefined,
    undefined,
    commentPort.events,
  );
  const catalogPort = new FixtureCatalogPublicationPort();
  const contentPort = new RecordingContentPort();
  const agentPort = new InMemoryAgentPort();
  let now = new Date("2026-09-16T20:00:00.000Z");
  const service = new AgentAdministrationService(agentPort, {
    commentPort,
    identityPort,
    catalogPort,
    contentOperatorPort: contentPort,
    clock: () => now,
    leaseMs: 60_000,
  });
  const seed = async (
    count: number,
    moderation: "pending" | "visible" | "hidden",
  ) => {
    const ids: CatalogCommentId[] = [];
    for (let n = 1; n <= count; n += 1) {
      const id = commentId(n);
      await commentPort.insertComment({
        id,
        catalogId: publishedCatalogId,
        authorId: fixtureUsers.active.id,
        text: `评论 ${n}`,
        moderation,
        createdAt: now,
      });
      ids.push(id);
    }
    return ids;
  };
  const principal = async (
    scopes: readonly string[] = [
      "users:read",
      "content:read",
      "comments:read",
      "comments:moderate",
      "featured:write",
      "operations:execute",
      "operations:undo",
    ],
  ) =>
    service.writePrincipal({
      requestId: requestId(1),
      label: PRINCIPAL,
      displayName: "评审代理",
      scopes,
      enabled: true,
      expectedVersion: 0,
    });
  return {
    service,
    commentPort,
    contentPort,
    agentPort,
    seed,
    principal,
    now: () => now,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
};

describe("AgentAdministrationService", () => {
  it("refuses an unknown, disabled, revoked or under-scoped principal before touching anything", async () => {
    const h = createHarness();
    await expect(h.service.commentsQuery("agent-nobody", {})).rejects.toSatisfy(
      isAgentForbiddenError,
    );
    await expect(h.service.commentsQuery("owner", {})).rejects.toSatisfy(
      isAgentForbiddenError,
    );
    const written = await h.principal(["comments:read"]);
    await expect(h.service.commentsQuery(PRINCIPAL, {})).resolves.toMatchObject(
      {
        total: 0,
      },
    );
    await expect(
      h.service.prepareComments(PRINCIPAL, {
        requestId: requestId(2),
        action: "hide",
        ids: [commentId(1)],
      }),
    ).rejects.toSatisfy(isAgentForbiddenError);
    await h.service.writePrincipal({
      requestId: requestId(3),
      label: PRINCIPAL,
      displayName: "评审代理",
      scopes: ["comments:read"],
      enabled: false,
      expectedVersion: written.version,
    });
    await expect(h.service.commentsQuery(PRINCIPAL, {})).rejects.toSatisfy(
      isAgentForbiddenError,
    );
    const revoked = await h.service.revokePrincipal({
      requestId: requestId(4),
      label: PRINCIPAL,
      expectedVersion: written.version + 1,
    });
    expect(revoked.revokedAt).not.toBeNull();
    await expect(
      h.service.writePrincipal({
        requestId: requestId(5),
        label: PRINCIPAL,
        displayName: "x",
        scopes: [],
        enabled: true,
        expectedVersion: revoked.version,
      }),
    ).rejects.toBeInstanceOf(CommunityConflictError);
    expect(h.agentPort.operations.size).toBe(0);
  });

  it("prepares an immutable comment operation with observed prior states, idempotent by request identity", async () => {
    const h = createHarness();
    await h.principal();
    const ids = await h.seed(3, "visible");
    const command = { requestId: requestId(10), action: "hide" as const, ids };
    const prepared = await h.service.prepareComments(PRINCIPAL, command);
    expect(agentOperationDetailSchema.parse(prepared)).toMatchObject({
      state: "prepared",
      approval: null,
      targetCount: 3,
      targets: ids.map((id) => ({ id, prior: "visible" })),
    });
    // Nothing applied at preparation.
    for (const id of ids)
      expect(h.commentPort.comments.get(id)?.moderation).toBe("visible");
    expect(h.commentPort.events).toHaveLength(0);
    // Same request identity and content: the same operation, not a second one.
    const replay = await h.service.prepareComments(PRINCIPAL, command);
    expect(replay.id).toBe(prepared.id);
    // Same identity, different content: refused.
    await expect(
      h.service.prepareComments(PRINCIPAL, { ...command, action: "unhide" }),
    ).rejects.toBeInstanceOf(CommunityConflictError);
    expect(h.agentPort.operations.size).toBe(1);
  });

  it("does not run a prepared operation; the Owner's approval or an active delegation is required", async () => {
    const h = createHarness();
    await h.principal();
    const ids = await h.seed(2, "visible");
    const prepared = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(20),
      action: "hide",
      ids,
    });
    await expect(
      h.service.execute(PRINCIPAL, {
        requestId: requestId(21),
        operationId: prepared.id,
      }),
    ).rejects.toBeInstanceOf(CommunityConflictError);
    const approved = await h.service.approve({
      requestId: requestId(22),
      operationId: prepared.id,
    });
    expect(approved).toMatchObject({
      state: "approved",
      approval: { kind: "owner", by: "owner", delegationId: null },
    });
    // A second approval is a conflict: the operation is no longer prepared.
    await expect(
      h.service.approve({ requestId: requestId(23), operationId: prepared.id }),
    ).rejects.toBeInstanceOf(CommunityConflictError);
    // A delegation covering the size auto-approves the next preparation;
    // one that is too small does not.
    const delegation = await h.service.createDelegation({
      requestId: requestId(24),
      principal: PRINCIPAL,
      kind: "comments.moderate",
      maxTargets: 1,
      expiresAt: new Date("2026-09-17T20:00:00.000Z").toISOString(),
    });
    const tooBig = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(25),
      action: "unhide",
      ids,
    });
    expect(tooBig.state).toBe("prepared");
    const covered = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(26),
      action: "unhide",
      ids: [ids[0]!],
    });
    expect(covered).toMatchObject({
      state: "approved",
      approval: { kind: "delegation", delegationId: delegation.id },
    });
    await h.service.revokeDelegation({
      requestId: requestId(27),
      id: delegation.id,
    });
    const afterRevoke = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(28),
      action: "unhide",
      ids: [ids[1]!],
    });
    expect(afterRevoke.state).toBe("prepared");
    // An expired delegation does not approve either.
    await h.service.createDelegation({
      requestId: requestId(29),
      principal: PRINCIPAL,
      kind: "comments.moderate",
      maxTargets: 10,
      expiresAt: new Date("2026-09-16T20:00:01.000Z").toISOString(),
    });
    h.advance(2_000);
    const expired = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(30),
      action: "hide",
      ids: [ids[1]!],
    });
    expect(expired.state).toBe("prepared");
  });

  it("executes in persisted chunks through the real transition path, under the principal's label, and resumes safely", async () => {
    const h = createHarness();
    await h.principal();
    const count = AGENT_OPERATION_CHUNK_SIZE * 2 + 5;
    const ids = await h.seed(count, "visible");
    // One target is moderated by the Owner between preparation and execution.
    const prepared = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(40),
      action: "hide",
      ids,
    });
    await h.service.approve({
      requestId: requestId(41),
      operationId: prepared.id,
    });
    await h.commentPort.applyCommentModeration(
      ids[3]!,
      "hidden",
      ["visible"],
      "owner",
      h.now(),
    );
    // First call: two chunks (100 targets), lease handed back, still executing.
    const first = await h.service.execute(PRINCIPAL, {
      requestId: requestId(42),
      operationId: prepared.id,
    });
    expect(first).toMatchObject({
      state: "executing",
      nextIndex: AGENT_OPERATION_CHUNK_SIZE * 2,
      leaseHeld: false,
    });
    expect(first.results).toHaveLength(AGENT_OPERATION_CHUNK_SIZE * 2);
    expect(first.results[3]).toMatchObject({ outcome: "conflict" });
    // Second call finishes the remaining five.
    const second = await h.service.execute(PRINCIPAL, {
      requestId: requestId(43),
      operationId: prepared.id,
    });
    expect(second).toMatchObject({
      state: "completed",
      nextIndex: count,
      tally: {
        applied: count - 1,
        conflicts: 1,
        notFound: 0,
        failed: 0,
        cancelled: 0,
      },
    });
    // Every applied target went through the moderation service's audited edge
    // with the principal as operator; the Owner's own action stays the Owner's.
    const agentEvents = h.commentPort.events.filter(
      (event) => event.operatorLabel === PRINCIPAL,
    );
    expect(agentEvents).toHaveLength(count - 1);
    expect(agentEvents.every((event) => event.action === "hide")).toBe(true);
    for (const id of ids)
      expect(h.commentPort.comments.get(id)?.moderation).toBe("hidden");
    // Executing a finished operation is a no-op answer, never a re-run.
    const again = await h.service.execute(PRINCIPAL, {
      requestId: requestId(44),
      operationId: prepared.id,
    });
    expect(again.state).toBe("completed");
    expect(
      h.commentPort.events.filter((e) => e.operatorLabel === PRINCIPAL),
    ).toHaveLength(count - 1);
  });

  it("fences concurrent executors: a live lease is respected, an expired one is taken over, a stale writer loses", async () => {
    const h = createHarness();
    await h.principal();
    const ids = await h.seed(3, "visible");
    const prepared = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(50),
      action: "hide",
      ids,
    });
    await h.service.approve({
      requestId: requestId(51),
      operationId: prepared.id,
    });
    // Simulate an executor that claimed and stalled.
    const claim = await h.agentPort.claimExecution(
      prepared.id,
      "stalled.1",
      h.now(),
      60_000,
    );
    expect(claim?.claimed).toBe(true);
    const waiting = await h.service.execute(PRINCIPAL, {
      requestId: requestId(52),
      operationId: prepared.id,
    });
    expect(waiting).toMatchObject({
      state: "executing",
      leaseHeld: true,
      nextIndex: 0,
    });
    expect(h.commentPort.events).toHaveLength(0);
    // The lease expires: the next executor takes over and finishes.
    h.advance(61_000);
    const done = await h.service.execute(PRINCIPAL, {
      requestId: requestId(53),
      operationId: prepared.id,
    });
    expect(done).toMatchObject({ state: "completed", tally: { applied: 3 } });
    // The stalled executor's late write finds no lease and changes nothing.
    expect(
      await h.agentPort.recordChunk(prepared.id, "stalled.1", [], 3, h.now(), {
        release: true,
        leaseMs: 60_000,
      }),
    ).toBeNull();
  });

  it("cancels: at once before execution, after the current chunk during it; applied targets stay applied", async () => {
    const h = createHarness();
    await h.principal();
    const ids = await h.seed(AGENT_OPERATION_CHUNK_SIZE + 2, "visible");
    const early = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(60),
      action: "hide",
      ids: [ids[0]!],
    });
    expect(
      await h.service.cancel(PRINCIPAL, {
        requestId: requestId(61),
        operationId: early.id,
      }),
    ).toMatchObject({ state: "cancelled" });
    await expect(
      h.service.approve({ requestId: requestId(62), operationId: early.id }),
    ).rejects.toBeInstanceOf(CommunityConflictError);

    const running = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(63),
      action: "hide",
      ids,
    });
    await h.service.approve({
      requestId: requestId(64),
      operationId: running.id,
    });
    // Cancel requested while another executor holds the lease mid-way.
    const claim = await h.agentPort.claimExecution(
      running.id,
      "other.1",
      h.now(),
      60_000,
    );
    expect(claim?.claimed).toBe(true);
    await h.service.cancel(PRINCIPAL, {
      requestId: requestId(65),
      operationId: running.id,
    });
    h.advance(61_000);
    const finished = await h.service.execute(PRINCIPAL, {
      requestId: requestId(66),
      operationId: running.id,
    });
    expect(finished).toMatchObject({
      state: "cancelled",
      tally: { applied: 0, cancelled: AGENT_OPERATION_CHUNK_SIZE + 2 },
    });
    expect(h.commentPort.events).toHaveLength(0);
  });

  it("prepares a conditional undo for hide/unhide only, as a new operation needing its own approval", async () => {
    const h = createHarness();
    await h.principal();
    const ids = await h.seed(3, "visible");
    const hide = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(70),
      action: "hide",
      ids,
    });
    await expect(
      h.service.prepareUndo(PRINCIPAL, {
        requestId: requestId(71),
        operationId: hide.id,
      }),
    ).rejects.toBeInstanceOf(CommunityConflictError); // not finished
    await h.service.approve({ requestId: requestId(72), operationId: hide.id });
    await h.service.execute(PRINCIPAL, {
      requestId: requestId(73),
      operationId: hide.id,
    });
    // The Owner restores one comment by hand before the undo runs.
    await h.commentPort.applyCommentModeration(
      ids[1]!,
      "visible",
      ["hidden"],
      "owner",
      h.now(),
    );
    const undo = await h.service.prepareUndo(PRINCIPAL, {
      requestId: requestId(74),
      operationId: hide.id,
    });
    expect(undo).toMatchObject({
      state: "prepared",
      action: "unhide",
      undoOf: hide.id,
      targetCount: 3,
    });
    await h.service.approve({ requestId: requestId(75), operationId: undo.id });
    const done = await h.service.execute(PRINCIPAL, {
      requestId: requestId(76),
      operationId: undo.id,
    });
    // The hand-restored comment is already visible: a conflict, untouched.
    expect(done.tally).toMatchObject({ applied: 2, conflicts: 1 });
    for (const id of ids)
      expect(h.commentPort.comments.get(id)?.moderation).toBe("visible");
    // An undo cannot be undone; approve/reject have no inverse.
    await expect(
      h.service.prepareUndo(PRINCIPAL, {
        requestId: requestId(77),
        operationId: undo.id,
      }),
    ).rejects.toBeInstanceOf(CommunityConflictError);
    await h.commentPort.insertComment({
      id: commentId(99),
      catalogId: publishedCatalogId,
      authorId: fixtureUsers.active.id,
      text: "待审",
      moderation: "pending",
      createdAt: new Date(),
    });
    const approve = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(78),
      action: "approve",
      ids: [commentId(99)],
    });
    await h.service.approve({
      requestId: requestId(79),
      operationId: approve.id,
    });
    await h.service.execute(PRINCIPAL, {
      requestId: requestId(80),
      operationId: approve.id,
    });
    await expect(
      h.service.prepareUndo(PRINCIPAL, {
        requestId: requestId(81),
        operationId: approve.id,
      }),
    ).rejects.toThrow("UNDO_NOT_AVAILABLE");
  });

  it("writes recommendation rows with deterministic per-target request identities and restores prior rows on undo", async () => {
    const h = createHarness();
    await h.principal();
    const work = "work-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01";
    h.contentPort.rows.set(`work:${work}`, {
      enabled: false,
      position: 7,
      version: 2,
    });
    h.agentPort.featured.set(`work:${work}`, {
      enabled: false,
      position: 7,
      version: 2,
    });
    const prepared = await h.service.prepareFeatured(PRINCIPAL, {
      requestId: requestId(90),
      items: [
        { target: { type: "work", id: work }, enabled: true, position: 0 },
        {
          target: { type: "catalog", id: "catalog-new" },
          enabled: true,
          position: 1,
        },
      ],
    });
    expect(prepared.targets).toEqual([
      {
        target: { type: "work", id: work },
        enabled: true,
        position: 0,
        prior: { enabled: false, position: 7, version: 2 },
      },
      {
        target: { type: "catalog", id: "catalog-new" },
        enabled: true,
        position: 1,
        prior: null,
      },
    ]);
    await h.service.approve({
      requestId: requestId(91),
      operationId: prepared.id,
    });
    const done = await h.service.execute(PRINCIPAL, {
      requestId: requestId(92),
      operationId: prepared.id,
    });
    expect(done.tally).toMatchObject({ applied: 2 });
    expect(h.contentPort.calls.map((c) => c.requestId)).toEqual([
      await targetRequestId(prepared.id, 0),
      await targetRequestId(prepared.id, 1),
    ]);
    expect(h.contentPort.calls[0]).toMatchObject({ expectedVersion: 2 });
    expect(h.contentPort.calls[1]).toMatchObject({ expectedVersion: 0 });
    const undo = await h.service.prepareUndo(PRINCIPAL, {
      requestId: requestId(93),
      operationId: prepared.id,
    });
    expect(undo.targets).toEqual([
      {
        target: { type: "work", id: work },
        enabled: false,
        position: 7,
        prior: { enabled: true, position: 0, version: 3 },
      },
      {
        target: { type: "catalog", id: "catalog-new" },
        enabled: false,
        position: 0,
        prior: { enabled: true, position: 1, version: 1 },
      },
    ]);
    await h.service.approve({ requestId: requestId(94), operationId: undo.id });
    const restored = await h.service.execute(PRINCIPAL, {
      requestId: requestId(95),
      operationId: undo.id,
    });
    expect(restored.tally).toMatchObject({ applied: 2 });
    expect(h.contentPort.rows.get(`work:${work}`)).toEqual({
      enabled: false,
      position: 7,
      version: 4,
    });
  });

  it("marks the rest of a chunk failed and stops when the store becomes unavailable, keeping what was applied", async () => {
    const h = createHarness();
    await h.principal();
    const work = (n: number) => `work-${n.toString(16).padStart(32, "0")}`;
    const prepared = await h.service.prepareFeatured(PRINCIPAL, {
      requestId: requestId(100),
      items: [1, 2, 3].map((n) => ({
        target: { type: "work" as const, id: work(n) },
        enabled: true,
        position: n,
      })),
    });
    await h.service.approve({
      requestId: requestId(101),
      operationId: prepared.id,
    });
    const original = h.contentPort.setFeatured.bind(h.contentPort);
    let applied = 0;
    h.contentPort.setFeatured = async (operator, input) => {
      if (applied === 1) throw new CommunityStoreUnavailableError();
      applied += 1;
      return original(operator, input);
    };
    const failed = await h.service.execute(PRINCIPAL, {
      requestId: requestId(102),
      operationId: prepared.id,
    });
    expect(failed).toMatchObject({
      state: "failed",
      tally: { applied: 1, failed: 2 },
    });
    expect(failed.results.map((r) => r.detail)).toEqual([
      "1",
      "STORE_UNAVAILABLE",
      "STORE_UNAVAILABLE",
    ]);
  });

  it("retracts a delegation-approved operation when the delegation is revoked, and refuses to run for a disabled principal", async () => {
    const h = createHarness();
    await h.principal();
    const ids = await h.seed(2, "visible");
    const delegation = await h.service.createDelegation({
      requestId: requestId(120),
      principal: PRINCIPAL,
      kind: "comments.moderate",
      maxTargets: 5,
      expiresAt: new Date("2026-09-17T20:00:00.000Z").toISOString(),
    });
    const covered = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(121),
      action: "hide",
      ids,
    });
    expect(covered.state).toBe("approved");
    await h.service.revokeDelegation({
      requestId: requestId(122),
      id: delegation.id,
    });
    await expect(
      h.service.execute(PRINCIPAL, {
        requestId: requestId(123),
        operationId: covered.id,
      }),
    ).rejects.toThrow("Delegation is no longer active");
    expect(h.commentPort.events).toHaveLength(0);
    // The Owner's explicit approval is not possible on an approved operation;
    // cancel and re-prepare is the documented path. Owner "run now" on an
    // Owner-approved operation refuses once the principal is disabled.
    const own = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(124),
      action: "hide",
      ids: [ids[0]!],
    });
    await h.service.approve({
      requestId: requestId(125),
      operationId: own.id,
    });
    const current = (await h.service.readPrincipals()).items.find(
      (p) => p.label === PRINCIPAL,
    )!;
    await h.service.writePrincipal({
      requestId: requestId(126),
      label: PRINCIPAL,
      displayName: current.displayName,
      scopes: current.scopes,
      enabled: false,
      expectedVersion: current.version,
    });
    await expect(
      h.service.executeAsOwner({
        requestId: requestId(127),
        operationId: own.id,
      }),
    ).rejects.toThrow("Principal can no longer act");
    expect(h.commentPort.events).toHaveLength(0);
  });

  it("allows an undo of a failed operation's applied targets", async () => {
    const h = createHarness();
    await h.principal();
    const work = (n: number) => `work-${n.toString(16).padStart(32, "0")}`;
    const prepared = await h.service.prepareFeatured(PRINCIPAL, {
      requestId: requestId(130),
      items: [1, 2].map((n) => ({
        target: { type: "work" as const, id: work(n) },
        enabled: true,
        position: n,
      })),
    });
    await h.service.approve({
      requestId: requestId(131),
      operationId: prepared.id,
    });
    const original = h.contentPort.setFeatured.bind(h.contentPort);
    let applied = 0;
    h.contentPort.setFeatured = async (operator, input) => {
      if (applied === 1) throw new CommunityStoreUnavailableError();
      applied += 1;
      return original(operator, input);
    };
    const failed = await h.service.execute(PRINCIPAL, {
      requestId: requestId(132),
      operationId: prepared.id,
    });
    expect(failed.state).toBe("failed");
    h.contentPort.setFeatured = original;
    const undo = await h.service.prepareUndo(PRINCIPAL, {
      requestId: requestId(133),
      operationId: prepared.id,
    });
    expect(undo).toMatchObject({ undoOf: prepared.id, targetCount: 1 });
  });

  it("keeps Owner-side reads and cancels across principals while an agent sees only its own operations", async () => {
    const h = createHarness();
    await h.principal();
    await h.service.writePrincipal({
      requestId: requestId(110),
      label: "agent-other",
      displayName: "other",
      scopes: ["comments:moderate", "operations:execute"],
      enabled: true,
      expectedVersion: 0,
    });
    const ids = await h.seed(1, "visible");
    const mine = await h.service.prepareComments(PRINCIPAL, {
      requestId: requestId(111),
      action: "hide",
      ids,
    });
    const theirs = await h.service.prepareComments("agent-other", {
      requestId: requestId(112),
      action: "hide",
      ids,
    });
    await expect(
      h.service.get(PRINCIPAL, { operationId: theirs.id }),
    ).rejects.toBeInstanceOf(CommunityNotFoundError);
    await expect(
      h.service.cancel(PRINCIPAL, {
        requestId: requestId(113),
        operationId: theirs.id,
      }),
    ).rejects.toBeInstanceOf(CommunityNotFoundError);
    expect(
      (await h.service.readOperations({ page: 1, pageSize: 20 })).total,
    ).toBe(2);
    expect(
      (await h.service.readOperations({ principal: "agent-other" })).items.map(
        (o) => o.id,
      ),
    ).toEqual([theirs.id]);
    expect(
      await h.service.cancelAsOwner({
        requestId: requestId(114),
        operationId: theirs.id,
      }),
    ).toMatchObject({ state: "cancelled" });
    expect(
      (await h.service.readOperation({ operationId: mine.id })).state,
    ).toBe("prepared");
  });
});
