import type {
  AgentDelegation,
  AgentOperation,
  AgentOperationApproval,
  AgentOperationDetail,
  AgentOperationKind,
  AgentOperationPage,
  AgentOperationQuery,
  AgentOperationResult,
  AgentOperationTarget,
  AgentPrincipal,
  AgentDelegationQuery,
} from "@moya/contracts/internal/community-operator";
import type { ContentIdentity } from "@moya/contracts";

/** The operation row to create; targets are frozen from here on. */
export interface AgentOperationDraft {
  readonly id: string;
  readonly principal: string;
  readonly requestId: string;
  readonly kind: AgentOperationKind;
  readonly action: "approve" | "reject" | "hide" | "unhide" | null;
  readonly targets: readonly AgentOperationTarget[];
  readonly fingerprint: string;
  readonly approval: AgentOperationApproval | null;
  readonly undoOf: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface AgentFeaturedState {
  readonly enabled: boolean;
  readonly position: number;
  readonly version: number;
}

/**
 * Persistence for Agent Administration V1. Every write is fenced: a lifecycle
 * transition names the state it leaves, an execution write names the lease it
 * holds, and a stale writer gets `null`, never a second effect.
 */
export interface AgentAdministrationPort {
  readPrincipals(): Promise<readonly AgentPrincipal[]>;
  findPrincipal(label: string): Promise<AgentPrincipal | null>;
  /** Creates at expectedVersion 0, otherwise updates that exact version; null on a version mismatch. */
  writePrincipal(
    input: {
      readonly label: string;
      readonly displayName: string;
      readonly scopes: readonly string[];
      readonly enabled: boolean;
      readonly expectedVersion: number;
    },
    at: Date,
  ): Promise<AgentPrincipal | null>;
  revokePrincipal(
    label: string,
    expectedVersion: number,
    at: Date,
  ): Promise<AgentPrincipal | null>;

  readDelegations(
    query: AgentDelegationQuery,
    at: Date,
  ): Promise<readonly AgentDelegation[]>;
  createDelegation(
    input: {
      readonly id: string;
      readonly principal: string;
      readonly kind: AgentOperationKind;
      readonly maxTargets: number;
      readonly expiresAt: Date;
      readonly createdBy: string;
    },
    at: Date,
  ): Promise<AgentDelegation>;
  revokeDelegation(
    id: string,
    by: string,
    at: Date,
  ): Promise<AgentDelegation | null>;
  /** The active delegation that covers this many targets, if any. */
  findActiveDelegation(
    principal: string,
    kind: AgentOperationKind,
    targetCount: number,
    at: Date,
  ): Promise<AgentDelegation | null>;

  /** The current recommendation rows for these targets (missing: no row). */
  readFeaturedStates(
    targets: readonly ContentIdentity[],
  ): Promise<ReadonlyMap<string, AgentFeaturedState>>;

  /**
   * Inserts the operation, or returns the existing one for the same
   * (principal, requestId) when its fingerprint matches; a different
   * fingerprint under a reused request identity is a conflict (null).
   */
  createOperation(
    draft: AgentOperationDraft,
  ): Promise<{ operation: AgentOperationDetail; created: boolean } | null>;
  findOperation(id: string): Promise<AgentOperationDetail | null>;
  readOperations(query: AgentOperationQuery): Promise<AgentOperationPage>;
  /** prepared -> approved; null unless the operation is prepared. */
  approveOperation(
    id: string,
    approval: AgentOperationApproval,
    at: Date,
  ): Promise<AgentOperation | null>;
  /**
   * prepared/approved -> cancelled at once; executing -> cancel requested (the
   * executor stops after its current chunk). Null when already finished.
   */
  cancelOperation(id: string, at: Date): Promise<AgentOperation | null>;
  /**
   * approved -> executing under this lease, or a resumed executing operation
   * whose lease is free or expired. `claimed: false` when another executor
   * holds a live lease; null when the operation is not executable.
   */
  claimExecution(
    id: string,
    leaseOwner: string,
    at: Date,
    leaseMs: number,
  ): Promise<{ operation: AgentOperationDetail; claimed: boolean } | null>;
  /**
   * Appends one chunk's results and advances the cursor under the lease; the
   * lease is released when `release` is set, and the state moves to `finalState`
   * when given. Null when the lease is no longer held (a stale executor).
   */
  recordChunk(
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
  ): Promise<AgentOperationDetail | null>;
}
