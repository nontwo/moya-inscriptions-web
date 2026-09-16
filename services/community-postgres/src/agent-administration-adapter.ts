import type {
  AgentAdministrationPort,
  AgentFeaturedState,
  AgentOperationDraft,
} from "@moya/api";
import type { ContentIdentity } from "@moya/contracts";
import type {
  AgentDelegation,
  AgentDelegationQuery,
  AgentOperation,
  AgentOperationApproval,
  AgentOperationDetail,
  AgentOperationKind,
  AgentOperationPage,
  AgentOperationQuery,
  AgentOperationResult,
  AgentOperationTarget,
  AgentPrincipal,
} from "@moya/contracts/internal/community-operator";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { asCommunityOperationError } from "./availability.js";

interface PrincipalRow {
  label: string;
  display_name: string;
  scopes: string[];
  enabled: boolean;
  version: string | number;
  created_at: Date;
  updated_at: Date;
  revoked_at: Date | null;
}

interface DelegationRow {
  id: string;
  principal_label: string;
  kind: AgentOperationKind;
  max_targets: number;
  expires_at: Date;
  created_by: string;
  created_at: Date;
  revoked_at: Date | null;
  revoked_by: string | null;
}

interface OperationRow {
  id: string;
  principal_label: string;
  request_id: string;
  kind: AgentOperationKind;
  action: AgentOperation["action"];
  state: AgentOperation["state"];
  targets: AgentOperationTarget[];
  target_count: number;
  fingerprint: string;
  approval: AgentOperationApproval | null;
  undo_of: string | null;
  next_index: number;
  results: AgentOperationResult[];
  lease_owner: string | null;
  lease_expires_at: Date | null;
  version: string | number;
  created_at: Date;
  expires_at: Date;
  approved_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  cancel_requested_at: Date | null;
  lease_live?: boolean;
}

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

const principal = (row: PrincipalRow): AgentPrincipal => ({
  label: row.label,
  displayName: row.display_name,
  scopes: row.scopes as AgentPrincipal["scopes"],
  enabled: row.enabled,
  version: Number(row.version),
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  revokedAt: isoOrNull(row.revoked_at),
});

const delegation = (row: DelegationRow): AgentDelegation => ({
  id: row.id,
  principal: row.principal_label,
  kind: row.kind,
  maxTargets: row.max_targets,
  expiresAt: iso(row.expires_at),
  createdBy: row.created_by,
  createdAt: iso(row.created_at),
  revokedAt: isoOrNull(row.revoked_at),
  revokedBy: row.revoked_by,
});

const tally = (results: readonly AgentOperationResult[]) => {
  const counts = {
    applied: 0,
    conflicts: 0,
    notFound: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const result of results) {
    if (result.outcome === "applied") counts.applied += 1;
    else if (result.outcome === "conflict") counts.conflicts += 1;
    else if (result.outcome === "not_found") counts.notFound += 1;
    else if (result.outcome === "failed") counts.failed += 1;
    else counts.cancelled += 1;
  }
  return counts;
};

const operation = (row: OperationRow, at: Date): AgentOperation => ({
  id: row.id,
  principal: row.principal_label,
  requestId: row.request_id,
  kind: row.kind,
  action: row.action,
  state: row.state,
  approval: row.approval,
  undoOf: row.undo_of,
  targetCount: row.target_count,
  nextIndex: row.next_index,
  results: row.results,
  tally: tally(row.results),
  version: Number(row.version),
  createdAt: iso(row.created_at),
  expiresAt: iso(row.expires_at),
  approvedAt: isoOrNull(row.approved_at),
  startedAt: isoOrNull(row.started_at),
  finishedAt: isoOrNull(row.finished_at),
  cancelRequestedAt: isoOrNull(row.cancel_requested_at),
  leaseHeld:
    row.lease_owner !== null &&
    row.lease_expires_at !== null &&
    row.lease_expires_at.getTime() > at.getTime(),
});

const detail = (row: OperationRow, at: Date): AgentOperationDetail => ({
  ...operation(row, at),
  targets: row.targets,
});

const operationColumns =
  "id,principal_label,request_id,kind,action,state,targets,target_count,fingerprint,approval,undo_of,next_index,results,lease_owner,lease_expires_at,version,created_at,expires_at,approved_at,started_at,finished_at,cancel_requested_at";

/**
 * PostgreSQL persistence for Agent Administration V1. Every lifecycle write
 * is one fenced statement: it names the state it leaves or the lease it
 * holds, so a stale executor or a repeated command finds zero rows and gets
 * null instead of a second effect. Targets, kind, action, fingerprint and the
 * request identity are never updated (the App role holds no UPDATE on them).
 */
export class PostgresAgentAdministrationAdapter implements AgentAdministrationPort {
  constructor(private readonly pool: Pool) {}

  private async query<Row extends QueryResultRow>(
    sql: string,
    values: readonly unknown[],
    db: Pool | PoolClient = this.pool,
  ): Promise<Row[]> {
    try {
      return (await db.query<Row>(sql, values as unknown[])).rows;
    } catch (error) {
      throw asCommunityOperationError(error, "query");
    }
  }

  private async transaction<T>(
    run: (db: PoolClient) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect().catch((error) => {
      throw asCommunityOperationError(error, "connect");
    });
    try {
      await db.query("BEGIN");
      const result = await run(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw asCommunityOperationError(error, "query");
    } finally {
      db.release();
    }
  }

  async readPrincipals(): Promise<readonly AgentPrincipal[]> {
    return (
      await this.query<PrincipalRow>(
        "SELECT * FROM community.agent_principals ORDER BY created_at, label",
        [],
      )
    ).map(principal);
  }

  async findPrincipal(label: string): Promise<AgentPrincipal | null> {
    const row = (
      await this.query<PrincipalRow>(
        "SELECT * FROM community.agent_principals WHERE label=$1",
        [label],
      )
    )[0];
    return row === undefined ? null : principal(row);
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
  ): Promise<AgentPrincipal | null> {
    return this.transaction(async (db) => {
      const existing = (
        await this.query<PrincipalRow>(
          "SELECT * FROM community.agent_principals WHERE label=$1 FOR UPDATE",
          [input.label],
          db,
        )
      )[0];
      if (existing === undefined) {
        if (input.expectedVersion !== 0) return null;
        const row = (
          await this.query<PrincipalRow>(
            "INSERT INTO community.agent_principals(label,display_name,scopes,enabled,created_at,updated_at) VALUES($1,$2,$3::text[],$4,$5,$5) RETURNING *",
            [input.label, input.displayName, input.scopes, input.enabled, at],
            db,
          )
        )[0]!;
        return principal(row);
      }
      if (
        Number(existing.version) !== input.expectedVersion ||
        existing.revoked_at !== null
      )
        return null;
      const row = (
        await this.query<PrincipalRow>(
          "UPDATE community.agent_principals SET display_name=$2,scopes=$3::text[],enabled=$4,version=version+1,updated_at=$5 WHERE label=$1 AND version=$6 AND revoked_at IS NULL RETURNING *",
          [
            input.label,
            input.displayName,
            input.scopes,
            input.enabled,
            at,
            input.expectedVersion,
          ],
          db,
        )
      )[0];
      return row === undefined ? null : principal(row);
    });
  }

  async revokePrincipal(
    label: string,
    expectedVersion: number,
    at: Date,
  ): Promise<AgentPrincipal | null> {
    const row = (
      await this.query<PrincipalRow>(
        "UPDATE community.agent_principals SET enabled=FALSE,revoked_at=$3,version=version+1,updated_at=$3 WHERE label=$1 AND version=$2 AND revoked_at IS NULL RETURNING *",
        [label, expectedVersion, at],
      )
    )[0];
    return row === undefined ? null : principal(row);
  }

  async readDelegations(
    query: AgentDelegationQuery,
    at: Date,
  ): Promise<readonly AgentDelegation[]> {
    return (
      await this.query<DelegationRow>(
        `SELECT * FROM community.agent_delegations
          WHERE ($1::text IS NULL OR principal_label=$1)
            AND ($2::boolean OR (revoked_at IS NULL AND expires_at>$3))
          ORDER BY created_at DESC, id DESC`,
        [query.principal ?? null, query.includeInactive, at],
      )
    ).map(delegation);
  }

  async createDelegation(
    input: {
      readonly id: string;
      readonly principal: string;
      readonly kind: AgentOperationKind;
      readonly maxTargets: number;
      readonly expiresAt: Date;
      readonly createdBy: string;
    },
    at: Date,
  ): Promise<AgentDelegation> {
    const row = (
      await this.query<DelegationRow>(
        "INSERT INTO community.agent_delegations(id,principal_label,kind,max_targets,expires_at,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          input.id,
          input.principal,
          input.kind,
          input.maxTargets,
          input.expiresAt,
          input.createdBy,
          at,
        ],
      )
    )[0]!;
    return delegation(row);
  }

  async revokeDelegation(
    id: string,
    by: string,
    at: Date,
  ): Promise<AgentDelegation | null> {
    const row = (
      await this.query<DelegationRow>(
        "UPDATE community.agent_delegations SET revoked_at=$2,revoked_by=$3 WHERE id=$1 AND revoked_at IS NULL RETURNING *",
        [id, at, by],
      )
    )[0];
    if (row !== undefined) return delegation(row);
    const already = (
      await this.query<DelegationRow>(
        "SELECT * FROM community.agent_delegations WHERE id=$1",
        [id],
      )
    )[0];
    return already === undefined ? null : delegation(already);
  }

  async findActiveDelegation(
    principalLabel: string,
    kind: AgentOperationKind,
    targetCount: number,
    at: Date,
  ): Promise<AgentDelegation | null> {
    const row = (
      await this.query<DelegationRow>(
        `SELECT * FROM community.agent_delegations
          WHERE principal_label=$1 AND kind=$2 AND max_targets>=$3
            AND revoked_at IS NULL AND expires_at>$4
          ORDER BY expires_at DESC, id LIMIT 1`,
        [principalLabel, kind, targetCount, at],
      )
    )[0];
    return row === undefined ? null : delegation(row);
  }

  async readFeaturedStates(
    targets: readonly ContentIdentity[],
  ): Promise<ReadonlyMap<string, AgentFeaturedState>> {
    const states = new Map<string, AgentFeaturedState>();
    if (targets.length === 0) return states;
    const rows = await this.query<{
      content_type: string;
      content_id: string;
      enabled: boolean;
      position: string | number;
      version: string | number;
    }>(
      `SELECT f.content_type,f.content_id,f.enabled,f.position,f.version
         FROM community.featured_content f
         JOIN unnest($1::text[],$2::text[]) AS t(content_type,content_id)
           ON t.content_type=f.content_type AND t.content_id=f.content_id`,
      [targets.map((t) => t.type), targets.map((t) => t.id)],
    );
    for (const row of rows)
      states.set(`${row.content_type}:${row.content_id}`, {
        enabled: row.enabled,
        position: Number(row.position),
        version: Number(row.version),
      });
    return states;
  }

  async createOperation(
    draft: AgentOperationDraft,
  ): Promise<{ operation: AgentOperationDetail; created: boolean } | null> {
    return this.transaction(async (db) => {
      const existing = (
        await this.query<OperationRow>(
          `SELECT ${operationColumns} FROM community.agent_operations WHERE principal_label=$1 AND request_id=$2`,
          [draft.principal, draft.requestId],
          db,
        )
      )[0];
      if (existing !== undefined)
        return existing.fingerprint === draft.fingerprint
          ? { operation: detail(existing, draft.createdAt), created: false }
          : null;
      const row = (
        await this.query<OperationRow>(
          `INSERT INTO community.agent_operations
             (id,principal_label,request_id,kind,action,state,targets,target_count,fingerprint,approval,undo_of,created_at,expires_at,approved_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11,$12,$13,$14)
           RETURNING ${operationColumns}`,
          [
            draft.id,
            draft.principal,
            draft.requestId,
            draft.kind,
            draft.action,
            draft.approval === null ? "prepared" : "approved",
            JSON.stringify(draft.targets),
            draft.targets.length,
            draft.fingerprint,
            draft.approval === null ? null : JSON.stringify(draft.approval),
            draft.undoOf,
            draft.createdAt,
            draft.expiresAt,
            draft.approval === null ? null : draft.createdAt,
          ],
          db,
        )
      )[0]!;
      return { operation: detail(row, draft.createdAt), created: true };
    });
  }

  async findOperation(id: string): Promise<AgentOperationDetail | null> {
    const row = (
      await this.query<OperationRow>(
        `SELECT ${operationColumns} FROM community.agent_operations WHERE id=$1`,
        [id],
      )
    )[0];
    return row === undefined ? null : detail(row, new Date());
  }

  async readOperations(
    query: AgentOperationQuery,
  ): Promise<AgentOperationPage> {
    const at = new Date();
    const filters = [
      "($1::text IS NULL OR state=$1)",
      "($2::text IS NULL OR principal_label=$2)",
    ].join(" AND ");
    const total = Number(
      (
        await this.query<{ n: string }>(
          `SELECT count(*) AS n FROM community.agent_operations WHERE ${filters}`,
          [query.state ?? null, query.principal ?? null],
        )
      )[0]!.n,
    );
    const rows = await this.query<OperationRow>(
      `SELECT ${operationColumns} FROM community.agent_operations WHERE ${filters}
        ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [
        query.state ?? null,
        query.principal ?? null,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ],
    );
    return {
      items: rows.map((row) => operation(row, at)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async approveOperation(
    id: string,
    approval: AgentOperationApproval,
    at: Date,
  ): Promise<AgentOperation | null> {
    const row = (
      await this.query<OperationRow>(
        `UPDATE community.agent_operations SET state='approved',approval=$2::jsonb,approved_at=$3,version=version+1
          WHERE id=$1 AND state='prepared' AND expires_at>$3 RETURNING ${operationColumns}`,
        [id, JSON.stringify(approval), at],
      )
    )[0];
    return row === undefined ? null : operation(row, at);
  }

  async cancelOperation(id: string, at: Date): Promise<AgentOperation | null> {
    const row = (
      await this.query<OperationRow>(
        `UPDATE community.agent_operations SET
            cancel_requested_at=COALESCE(cancel_requested_at,$2),
            state=CASE WHEN state IN ('prepared','approved') THEN 'cancelled' ELSE state END,
            finished_at=CASE WHEN state IN ('prepared','approved') THEN $2 ELSE finished_at END,
            version=version+1
          WHERE id=$1 AND state IN ('prepared','approved','executing') RETURNING ${operationColumns}`,
        [id, at],
      )
    )[0];
    return row === undefined ? null : operation(row, at);
  }

  async claimExecution(
    id: string,
    leaseOwner: string,
    at: Date,
    leaseMs: number,
  ): Promise<{ operation: AgentOperationDetail; claimed: boolean } | null> {
    const until = new Date(at.getTime() + leaseMs);
    const row = (
      await this.query<OperationRow>(
        `UPDATE community.agent_operations SET
            state='executing', lease_owner=$2, lease_expires_at=$3,
            started_at=COALESCE(started_at,$4), version=version+1
          WHERE id=$1 AND state IN ('approved','executing')
            AND (lease_owner IS NULL OR lease_expires_at<=$4)
          RETURNING ${operationColumns}`,
        [id, leaseOwner, until, at],
      )
    )[0];
    if (row !== undefined) return { operation: detail(row, at), claimed: true };
    const current = (
      await this.query<OperationRow>(
        `SELECT ${operationColumns} FROM community.agent_operations WHERE id=$1 AND state='executing'`,
        [id],
      )
    )[0];
    return current === undefined
      ? null
      : { operation: detail(current, at), claimed: false };
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
  ): Promise<AgentOperationDetail | null> {
    const release = options.release || options.finalState !== undefined;
    const row = (
      await this.query<OperationRow>(
        `UPDATE community.agent_operations SET
            results=results||$3::jsonb,
            next_index=$4::integer,
            state=COALESCE($5::text,state),
            finished_at=CASE WHEN $5::text IS NULL THEN finished_at ELSE $6::timestamptz END,
            lease_owner=CASE WHEN $7::boolean THEN NULL ELSE lease_owner END,
            lease_expires_at=CASE WHEN $7::boolean THEN NULL ELSE $8::timestamptz END,
            version=version+1
          WHERE id=$1 AND state='executing' AND lease_owner=$2 AND lease_expires_at>$6::timestamptz
          RETURNING ${operationColumns}`,
        [
          id,
          leaseOwner,
          JSON.stringify(results),
          nextIndex,
          options.finalState ?? null,
          at,
          release,
          new Date(at.getTime() + options.leaseMs),
        ],
      )
    )[0];
    return row === undefined ? null : detail(row, at);
  }
}
