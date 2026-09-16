import {
  AGENT_OPERATION_CHUNK_SIZE,
  AGENT_OPERATION_PREPARED_LIFETIME_MS,
  agentDelegationCreateSchema,
  agentDelegationQuerySchema,
  agentDelegationRevokeSchema,
  agentOperationCommandSchema,
  agentOperationQuerySchema,
  agentOperationReadSchema,
  agentPrepareCommentsCommandSchema,
  agentPrepareFeaturedCommandSchema,
  agentPrincipalLabelSchema,
  agentPrincipalMutationSchema,
  agentPrincipalRevokeSchema,
  operatorLabelSchema,
} from "@moya/contracts/internal/community-operator";

import {
  CommunityConflictError,
  CommunityInputError,
  CommunityNotFoundError,
  isCommunityConflictError,
  isCommunityNotFoundError,
} from "../errors/community-request-errors.js";
import { isCommunityStoreUnavailableError } from "../errors/community-store-unavailable-error.js";
import { CommunityContentOperatorService } from "./community-content-operator-service.js";
import { CommunityModerationService } from "./community-moderation-service.js";

import type {
  AgentAdministrationPort,
  AgentOperationDraft,
} from "../ports/agent-administration-port.js";
import type { CatalogPublicationPort } from "../ports/catalog-publication-port.js";
import type { CommunityCommentPort } from "../ports/community-comment-port.js";
import type { CommunityContentOperatorPort } from "../ports/community-content-operator-port.js";
import type { CommunityIdentityPort } from "../ports/community-identity-port.js";
import type { DiscussionPort } from "../ports/discussion-port.js";
import type {
  AgentCommentTarget,
  AgentDelegation,
  AgentFeaturedTarget,
  AgentOperation,
  AgentOperationApproval,
  AgentOperationDetail,
  AgentOperationPage,
  AgentOperationResult,
  AgentOperationTarget,
  AgentPrincipal,
  AgentScope,
} from "@moya/contracts/internal/community-operator";

/**
 * A principal that is unknown, disabled, revoked or lacks the scope. The
 * boundary answers 403 with a bare code; nothing about the principal registry
 * leaks to the caller.
 */
export class AgentForbiddenError extends Error {
  override readonly name = "AgentForbiddenError";

  constructor(message = "Agent principal is not allowed") {
    super(message);
  }
}

export const isAgentForbiddenError = (
  error: unknown,
): error is AgentForbiddenError => error instanceof AgentForbiddenError;

export interface AgentAdministrationServiceOptions {
  readonly commentPort: CommunityCommentPort;
  readonly identityPort: CommunityIdentityPort;
  readonly catalogPort: CatalogPublicationPort;
  readonly contentOperatorPort?: CommunityContentOperatorPort | undefined;
  readonly discussionPort?: DiscussionPort | undefined;
  readonly clock?: () => Date;
  /** The Owner's label, used for approvals and registry changes made from the Admin. */
  readonly ownerLabel?: string;
  /** How long one executor may hold an operation between chunk writes. */
  readonly leaseMs?: number;
  /** Chunks processed per execute call before the lease is handed back. */
  readonly chunksPerCall?: number;
}

const parse = <T>(
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  input: unknown,
): T => {
  const result = schema.safeParse(input);
  if (!result.success) throw new CommunityInputError("Invalid agent command");
  return result.data;
};

/** SHA-256 hex through Web Crypto: this package imports no Node module. */
const sha256Hex = async (text: string): Promise<string> =>
  Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

const fingerprintOf = (parts: unknown): Promise<string> =>
  sha256Hex(JSON.stringify(parts));

const randomUUID = (): string => globalThis.crypto.randomUUID();

/**
 * One deterministic request identity per (operation, target index): a retried
 * or resumed execution replays the very same receipt at the existing services
 * instead of applying a second time. RFC 9562 layout with version nibble 8
 * (custom), so the contract's uuid check accepts it.
 */
export const targetRequestId = async (
  operationId: string,
  index: number,
): Promise<string> => {
  const hex = (await sha256Hex(`${operationId}:${index}`)).slice(0, 32);
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const inverseAction = {
  hide: "unhide",
  unhide: "hide",
} as const;

const featuredKey = (target: { type: string; id: string }): string =>
  `${target.type}:${target.id}`;

const isCommentTarget = (
  target: AgentOperationTarget,
): target is AgentCommentTarget => "id" in target;

/**
 * Agent Administration V1: the shared business operations behind both the
 * Owner-only Payload operations view and the MCP tools. A machine principal
 * prepares an immutable operation over a fixed selection, an Owner approval or
 * a bounded persisted delegation authorizes it, and execution runs through the
 * very same moderation and content operator services the Admin uses, with the
 * principal's label on every audit row and receipt. Nothing here decides what
 * to moderate: every target was named by the caller and frozen at preparation.
 */
export class AgentAdministrationService {
  private readonly clock: () => Date;
  private readonly ownerLabel: string;
  private readonly leaseMs: number;
  private readonly chunksPerCall: number;

  constructor(
    private readonly port: AgentAdministrationPort,
    private readonly deps: AgentAdministrationServiceOptions,
  ) {
    this.clock = deps.clock ?? (() => new Date());
    this.ownerLabel = operatorLabelSchema.parse(deps.ownerLabel ?? "owner");
    this.leaseMs = deps.leaseMs ?? 60_000;
    this.chunksPerCall = deps.chunksPerCall ?? 2;
  }

  // ---------------------------------------------------------------- registry

  async readPrincipals(): Promise<{ items: readonly AgentPrincipal[] }> {
    return { items: await this.port.readPrincipals() };
  }

  async writePrincipal(body: unknown): Promise<AgentPrincipal> {
    const command = parse(agentPrincipalMutationSchema, body);
    const written = await this.port.writePrincipal(command, this.clock());
    if (written === null)
      throw new CommunityConflictError("Agent principal changed");
    return written;
  }

  async revokePrincipal(body: unknown): Promise<AgentPrincipal> {
    const command = parse(agentPrincipalRevokeSchema, body);
    const revoked = await this.port.revokePrincipal(
      command.label,
      command.expectedVersion,
      this.clock(),
    );
    if (revoked === null)
      throw new CommunityConflictError("Agent principal changed");
    return revoked;
  }

  async readDelegations(
    query: unknown,
  ): Promise<{ items: readonly AgentDelegation[] }> {
    return {
      items: await this.port.readDelegations(
        parse(agentDelegationQuerySchema, query ?? {}),
        this.clock(),
      ),
    };
  }

  async createDelegation(body: unknown): Promise<AgentDelegation> {
    const command = parse(agentDelegationCreateSchema, body);
    const at = this.clock();
    if (new Date(command.expiresAt).getTime() <= at.getTime())
      throw new CommunityInputError("Delegation expiry is in the past");
    const principal = await this.port.findPrincipal(command.principal);
    if (principal === null || principal.revokedAt !== null)
      throw new CommunityNotFoundError("Agent principal was not found");
    return this.port.createDelegation(
      {
        id: randomUUID(),
        principal: command.principal,
        kind: command.kind,
        maxTargets: command.maxTargets,
        expiresAt: new Date(command.expiresAt),
        createdBy: this.ownerLabel,
      },
      at,
    );
  }

  async revokeDelegation(body: unknown): Promise<AgentDelegation> {
    const command = parse(agentDelegationRevokeSchema, body);
    const revoked = await this.port.revokeDelegation(
      command.id,
      this.ownerLabel,
      this.clock(),
    );
    if (revoked === null)
      throw new CommunityNotFoundError("Delegation was not found");
    return revoked;
  }

  // ------------------------------------------------------------ authorization

  /** The enabled, unrevoked principal holding the scope; anything else is forbidden. */
  private async authorize(
    label: string,
    scope: AgentScope,
  ): Promise<AgentPrincipal> {
    const parsed = agentPrincipalLabelSchema.safeParse(label);
    if (!parsed.success) throw new AgentForbiddenError();
    const principal = await this.port.findPrincipal(parsed.data);
    if (
      principal === null ||
      !principal.enabled ||
      principal.revokedAt !== null ||
      !principal.scopes.includes(scope)
    )
      throw new AgentForbiddenError();
    return principal;
  }

  /** The existing services, acting under the principal's own label. */
  private servicesFor(label: string) {
    return {
      moderation: new CommunityModerationService(
        this.deps.commentPort,
        this.deps.identityPort,
        this.deps.catalogPort,
        {
          operatorLabel: label,
          clock: this.clock,
          ...(this.deps.contentOperatorPort
            ? { contentOperatorPort: this.deps.contentOperatorPort }
            : {}),
        },
      ),
      content: new CommunityContentOperatorService(
        this.deps.contentOperatorPort,
        this.deps.discussionPort,
        label,
      ),
    };
  }

  // ------------------------------------------------------------------ reads

  async usersFind(principal: string, query: unknown) {
    await this.authorize(principal, "users:read");
    return this.servicesFor(principal).content.readUsers(query);
  }

  async contentSearch(principal: string, query: unknown) {
    await this.authorize(principal, "content:read");
    return this.servicesFor(principal).content.readWorks(query);
  }

  async commentsQuery(principal: string, query: unknown) {
    await this.authorize(principal, "comments:read");
    return this.servicesFor(principal).moderation.readComments(query);
  }

  async commentsRead(principal: string, id: string) {
    await this.authorize(principal, "comments:read");
    return this.servicesFor(principal).moderation.readCommentDetail(
      id as Parameters<CommunityModerationService["readCommentDetail"]>[0],
    );
  }

  // ------------------------------------------------------------- preparation

  private async approvalFor(
    principal: string,
    kind: AgentOperationDraft["kind"],
    targetCount: number,
    at: Date,
  ): Promise<AgentOperationApproval | null> {
    const delegation = await this.port.findActiveDelegation(
      principal,
      kind,
      targetCount,
      at,
    );
    return delegation === null
      ? null
      : {
          kind: "delegation",
          by: delegation.createdBy,
          delegationId: delegation.id,
          at: at.toISOString(),
        };
  }

  private async create(
    draft: Omit<
      AgentOperationDraft,
      "id" | "createdAt" | "expiresAt" | "approval"
    >,
  ): Promise<AgentOperationDetail> {
    const at = this.clock();
    const approval = await this.approvalFor(
      draft.principal,
      draft.kind,
      draft.targets.length,
      at,
    );
    const created = await this.port.createOperation({
      ...draft,
      id: randomUUID(),
      approval,
      createdAt: at,
      expiresAt: new Date(at.getTime() + AGENT_OPERATION_PREPARED_LIFETIME_MS),
    });
    if (created === null)
      throw new CommunityConflictError(
        "Reused request identity with other content",
      );
    return created.operation;
  }

  /** A frozen selection of comments and one transition; states observed now are recorded. */
  async prepareComments(
    principal: string,
    body: unknown,
  ): Promise<AgentOperationDetail> {
    await this.authorize(principal, "comments:moderate");
    const command = parse(agentPrepareCommentsCommandSchema, body);
    const targets: AgentCommentTarget[] = [];
    for (const id of command.ids) {
      const current = await this.deps.commentPort.findOperatorComment(
        id as Parameters<CommunityCommentPort["findOperatorComment"]>[0],
      );
      targets.push({ id, prior: current?.moderation ?? null });
    }
    return this.create({
      principal,
      requestId: command.requestId,
      kind: "comments.moderate",
      action: command.action,
      targets,
      fingerprint: await fingerprintOf([
        "comments.moderate",
        command.action,
        command.ids,
      ]),
      undoOf: null,
    });
  }

  /** A frozen set of recommendation rows to write; current rows are recorded for undo. */
  async prepareFeatured(
    principal: string,
    body: unknown,
  ): Promise<AgentOperationDetail> {
    await this.authorize(principal, "featured:write");
    const command = parse(agentPrepareFeaturedCommandSchema, body);
    const states = await this.port.readFeaturedStates(
      command.items.map((item) => item.target),
    );
    const targets: AgentFeaturedTarget[] = command.items.map((item) => ({
      target: item.target,
      enabled: item.enabled,
      position: item.position,
      prior: states.get(featuredKey(item.target)) ?? null,
    }));
    return this.create({
      principal,
      requestId: command.requestId,
      kind: "featured.set",
      action: null,
      targets,
      fingerprint: await fingerprintOf(["featured.set", command.items]),
      undoOf: null,
    });
  }

  // ---------------------------------------------------------------- lifecycle

  private async owned(
    principal: string,
    operationId: string,
  ): Promise<AgentOperationDetail> {
    const operation = await this.port.findOperation(operationId);
    if (operation === null || operation.principal !== principal)
      throw new CommunityNotFoundError("Operation was not found");
    return operation;
  }

  async get(principal: string, body: unknown): Promise<AgentOperationDetail> {
    await this.authorize(principal, "operations:execute");
    const { operationId } = parse(agentOperationReadSchema, body);
    return this.owned(principal, operationId);
  }

  /** Owner-side reads: every principal's operations. */
  async readOperations(query: unknown): Promise<AgentOperationPage> {
    return this.port.readOperations(
      parse(agentOperationQuerySchema, query ?? {}),
    );
  }

  async readOperation(body: unknown): Promise<AgentOperationDetail> {
    const { operationId } = parse(agentOperationReadSchema, body);
    const operation = await this.port.findOperation(operationId);
    if (operation === null)
      throw new CommunityNotFoundError("Operation was not found");
    return operation;
  }

  /** The Owner approves a prepared operation from the Admin; anything else is a conflict. */
  async approve(body: unknown): Promise<AgentOperation> {
    const { operationId } = parse(agentOperationCommandSchema, body);
    const at = this.clock();
    const current = await this.port.findOperation(operationId);
    if (current === null)
      throw new CommunityNotFoundError("Operation was not found");
    if (current.state !== "prepared")
      throw new CommunityConflictError(`Operation is ${current.state}`);
    if (new Date(current.expiresAt).getTime() <= at.getTime())
      throw new CommunityConflictError("Operation expired before approval");
    const approved = await this.port.approveOperation(
      operationId,
      {
        kind: "owner",
        by: this.ownerLabel,
        delegationId: null,
        at: at.toISOString(),
      },
      at,
    );
    if (approved === null)
      throw new CommunityConflictError("Operation changed");
    return approved;
  }

  /** Owner-side cancel of any principal's operation. */
  async cancelAsOwner(body: unknown): Promise<AgentOperation> {
    const { operationId } = parse(agentOperationCommandSchema, body);
    const current = await this.port.findOperation(operationId);
    if (current === null)
      throw new CommunityNotFoundError("Operation was not found");
    return this.cancelCurrent(current);
  }

  async cancel(principal: string, body: unknown): Promise<AgentOperation> {
    await this.authorize(principal, "operations:execute");
    const { operationId } = parse(agentOperationCommandSchema, body);
    return this.cancelCurrent(await this.owned(principal, operationId));
  }

  private async cancelCurrent(
    current: AgentOperationDetail,
  ): Promise<AgentOperation> {
    if (
      current.state === "completed" ||
      current.state === "cancelled" ||
      current.state === "failed"
    )
      return current;
    const cancelled = await this.port.cancelOperation(current.id, this.clock());
    if (cancelled === null)
      throw new CommunityConflictError("Operation changed");
    return cancelled;
  }

  /**
   * Runs the operation forward. An approved operation starts; an executing one
   * whose lease is free or expired resumes from its cursor (a lost response
   * never re-applies a target: each target's request identity is fixed). At
   * most `chunksPerCall` chunks run per call, then the lease is handed back
   * with the current progress so the caller keeps calling until finished.
   */
  async execute(
    principal: string,
    body: unknown,
  ): Promise<AgentOperationDetail> {
    await this.authorize(principal, "operations:execute");
    const { operationId } = parse(agentOperationCommandSchema, body);
    const current = await this.owned(principal, operationId);
    return this.run(current, principal);
  }

  /** The Owner runs an approved operation from the Admin, under the operation's principal. */
  async executeAsOwner(body: unknown): Promise<AgentOperationDetail> {
    const { operationId } = parse(agentOperationCommandSchema, body);
    const current = await this.port.findOperation(operationId);
    if (current === null)
      throw new CommunityNotFoundError("Operation was not found");
    return this.run(current, this.ownerLabel);
  }

  private async run(
    current: AgentOperationDetail,
    executor: string,
  ): Promise<AgentOperationDetail> {
    if (
      current.state === "completed" ||
      current.state === "cancelled" ||
      current.state === "failed"
    )
      return current;
    if (current.state === "prepared")
      throw new CommunityConflictError("Operation is not approved");
    const leaseOwner = `${executor}.${randomUUID()}`;
    const claim = await this.port.claimExecution(
      current.id,
      leaseOwner,
      this.clock(),
      this.leaseMs,
    );
    if (claim === null) throw new CommunityConflictError("Operation changed");
    if (!claim.claimed) return claim.operation;
    let operation = claim.operation;
    const services = this.servicesFor(operation.principal);
    for (let chunk = 0; chunk < this.chunksPerCall; chunk += 1) {
      if (operation.cancelRequestedAt !== null) {
        const remaining = operation.targets
          .slice(operation.nextIndex)
          .map((target, offset) =>
            this.result(
              operation.nextIndex + offset,
              target,
              "cancelled",
              null,
            ),
          );
        return this.record(
          operation,
          leaseOwner,
          remaining,
          operation.targetCount,
          {
            finalState: "cancelled",
            release: true,
          },
        );
      }
      const end = Math.min(
        operation.nextIndex + AGENT_OPERATION_CHUNK_SIZE,
        operation.targetCount,
      );
      const results: AgentOperationResult[] = [];
      let storeDown = false;
      for (let index = operation.nextIndex; index < end; index += 1) {
        const target = operation.targets[index]!;
        if (storeDown) {
          results.push(
            this.result(index, target, "failed", "STORE_UNAVAILABLE"),
          );
          continue;
        }
        const outcome = await this.apply(operation, index, target, services);
        results.push(outcome.result);
        storeDown = outcome.storeDown;
      }
      const finished = end >= operation.targetCount;
      const recorded = await this.record(operation, leaseOwner, results, end, {
        ...(storeDown
          ? { finalState: "failed" as const }
          : finished
            ? { finalState: "completed" as const }
            : {}),
        release: storeDown || finished || chunk === this.chunksPerCall - 1,
      });
      operation = recorded;
      if (storeDown || finished) return operation;
    }
    return operation;
  }

  private async record(
    operation: AgentOperationDetail,
    leaseOwner: string,
    results: readonly AgentOperationResult[],
    nextIndex: number,
    options: {
      readonly finalState?: "completed" | "cancelled" | "failed";
      readonly release: boolean;
    },
  ): Promise<AgentOperationDetail> {
    const recorded = await this.port.recordChunk(
      operation.id,
      leaseOwner,
      results,
      nextIndex,
      this.clock(),
      { ...options, leaseMs: this.leaseMs },
    );
    // The lease was taken over (this executor stalled past it): nothing of
    // this chunk was persisted here, and the new holder repeats it with the
    // same request identities, so no target is applied twice.
    if (recorded === null) throw new CommunityConflictError("Lease lost");
    return recorded;
  }

  private result(
    index: number,
    target: AgentOperationTarget,
    outcome: AgentOperationResult["outcome"],
    detail: string | null,
  ): AgentOperationResult {
    return {
      index,
      id: isCommentTarget(target) ? target.id : featuredKey(target.target),
      outcome,
      detail,
    };
  }

  /** One target through the existing services; the outcome classification mirrors bulk moderation. */
  private async apply(
    operation: AgentOperationDetail,
    index: number,
    target: AgentOperationTarget,
    services: ReturnType<AgentAdministrationService["servicesFor"]>,
  ): Promise<{ result: AgentOperationResult; storeDown: boolean }> {
    try {
      if (isCommentTarget(target)) {
        const moderated = await services.moderation.moderateComment(
          target.id as Parameters<
            CommunityModerationService["moderateComment"]
          >[0],
          { action: operation.action },
        );
        return {
          result: this.result(index, target, "applied", moderated.moderation),
          storeDown: false,
        };
      }
      const written = await services.content.setFeatured({
        requestId: await targetRequestId(operation.id, index),
        target: target.target,
        enabled: target.enabled,
        position: target.position,
        expectedVersion: target.prior?.version ?? 0,
      });
      return {
        result: this.result(index, target, "applied", String(written.version)),
        storeDown: false,
      };
    } catch (error) {
      if (isCommunityConflictError(error))
        return {
          result: this.result(index, target, "conflict", null),
          storeDown: false,
        };
      if (isCommunityNotFoundError(error))
        return {
          result: this.result(index, target, "not_found", null),
          storeDown: false,
        };
      if (isCommunityStoreUnavailableError(error))
        return {
          result: this.result(index, target, "failed", "STORE_UNAVAILABLE"),
          storeDown: true,
        };
      return {
        result: this.result(index, target, "failed", null),
        storeDown: false,
      };
    }
  }

  // --------------------------------------------------------------------- undo

  /**
   * A conditional inverse of a finished operation over its applied targets:
   * hide <-> unhide for comments (approve and reject have no inverse edge and
   * are refused), the recorded prior row for recommendations, each guarded by
   * the state or version the original left behind, so anything changed since
   * reports a conflict instead of being overwritten. The undo is a new
   * operation and needs its own approval.
   */
  async prepareUndo(
    principal: string,
    body: unknown,
  ): Promise<AgentOperationDetail> {
    await this.authorize(principal, "operations:undo");
    const command = parse(agentOperationCommandSchema, body);
    const original = await this.owned(principal, command.operationId);
    if (original.state !== "completed" && original.state !== "cancelled")
      throw new CommunityConflictError("Operation has not finished");
    if (original.undoOf !== null)
      throw new CommunityConflictError("An undo cannot be undone");
    const applied = original.results.filter(
      (result) => result.outcome === "applied",
    );
    if (applied.length === 0)
      throw new CommunityConflictError("Nothing was applied");
    if (original.kind === "comments.moderate") {
      const action = original.action;
      if (action !== "hide" && action !== "unhide")
        throw new CommunityConflictError("UNDO_NOT_AVAILABLE");
      const targets: AgentCommentTarget[] = applied.map((result) => {
        const target = original.targets[result.index] as AgentCommentTarget;
        return {
          id: target.id,
          prior: result.detail as AgentCommentTarget["prior"],
        };
      });
      return this.create({
        principal,
        requestId: command.requestId,
        kind: "comments.moderate",
        action: inverseAction[action],
        targets,
        fingerprint: await fingerprintOf(["undo", original.id]),
        undoOf: original.id,
      });
    }
    const targets: AgentFeaturedTarget[] = applied.map((result) => {
      const target = original.targets[result.index] as AgentFeaturedTarget;
      const afterVersion = Number(result.detail);
      return {
        target: target.target,
        // No prior row: the inverse disables the entry at position 0 (rows
        // are never deleted by the operator surface).
        enabled: target.prior?.enabled ?? false,
        position: target.prior?.position ?? 0,
        prior: {
          enabled: target.enabled,
          position: target.position,
          version: Number.isInteger(afterVersion) ? afterVersion : 0,
        },
      };
    });
    return this.create({
      principal,
      requestId: command.requestId,
      kind: "featured.set",
      action: null,
      targets,
      fingerprint: await fingerprintOf(["undo", original.id]),
      undoOf: original.id,
    });
  }
}
