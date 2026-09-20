/**
 * Agent Connections V1 (Issue #141 r14 §4) — the canonical connection
 * authority, in PostgreSQL.
 *
 * r13 built the tables and r10 built the ports, and nothing joined them: the
 * only `ConnectionStore` in the repository was a `MemoryStore` in a unit test,
 * and no production code read `community.agent_connections` at all. This is
 * that join.
 *
 * Three things here are deliberate and load-bearing.
 *
 *  1. **An outage is not an absence.** `read` returns `null` only when the
 *     database answered and there was no such row. Anything else throws, so a
 *     pool timeout cannot be mistaken for "no connection" — which is the
 *     difference between failing closed and failing open.
 *  2. **A lost race is not an error.** `compareAndSet` returns `null` when the
 *     conditional UPDATE matched nothing, because the authority's retry loop
 *     reads `null` as "somebody moved first, re-decide" and reads a throw as
 *     "the authority is unavailable, stop". Reporting contention as an
 *     exception would silently disable the whole retry protocol.
 *  3. **Every row is parsed, not trusted.** The tables are shared state; a row
 *     that does not parse is a refusal, never a partially-populated object.
 *     The column set is projected explicitly because the connection table
 *     carries six columns the consented shape has no field for.
 *
 * Identity is read from the GRANT, never from the connection. The connection's
 * `oauth_client_id` and `human_account_id` stay writable by design and no
 * trigger freezes them; the grant snapshot is frozen at consent. That rule is
 * recorded as a `COMMENT ON TABLE` in migration 20260918040000 and is enforced
 * here by `readForAuthorization` returning the grant alongside the connection.
 */

/** The three states a connection is ever in. */
export type StoredConnectionStatus =
  "awaiting-consent" | "authorized" | "revoked";

/** The two consent presets, spelled exactly as the CHECK constraint spells them. */
export type StoredConnectionPreset = "read-only" | "management";

/** Descriptive vendor family. Never identity. */
export type StoredConnectionClient = "claude" | "codex" | "cursor";

/**
 * The connection as the consented shape sees it. Field names match
 * `AgentConnection` in `apps/admin/src/agent-connections/contracts.ts`
 * structurally, so the Admin can hand this straight to `agentConnectionSchema`
 * without a second mapping layer inventing a third spelling of the same row.
 */
export interface StoredConnection {
  readonly id: string;
  readonly principalLabel: string;
  readonly humanAccountId: string;
  readonly client: StoredConnectionClient;
  readonly oauthClientId: string;
  readonly environment: string;
  readonly preset: StoredConnectionPreset;
  readonly status: StoredConnectionStatus;
  readonly generation: number;
  readonly revokedAt: string | null;
  readonly consentedAt: string | null;
}

/** A connection with the version its state was read at. */
export interface VersionedStoredConnection {
  readonly connection: StoredConnection;
  readonly version: number;
}

/**
 * The immutable consent snapshot. This — not the connection row — is what
 * authorization compares a token's subject and client against.
 */
export interface StoredConsentGrant {
  readonly grantId: string;
  readonly connectionId: string;
  readonly generationAtConsent: number;
  readonly oauthClientId: string;
  readonly humanSubject: string;
  readonly issuer: string;
  readonly resource: string;
  readonly capabilityScopes: readonly string[];
  readonly protocolScopes: readonly string[];
  readonly presetAtConsent: StoredConnectionPreset;
  readonly consentedAt: string;
  readonly destroyStatus: "not-requested" | "pending" | "done" | "failed";
  readonly destroyedAt: string | null;
}

/**
 * What authorization needs in one read: the connection whose CURRENT state
 * decides revocation, and the frozen grant whose identity decides who.
 * `grant` is null when the connection has no current grant — which is a
 * refusal at the boundary, not a permissive default.
 */
export interface ConnectionForAuthorization {
  readonly connection: StoredConnection;
  readonly grant: StoredConsentGrant | null;
}

/** A row that does not parse. Never a partially-populated object. */
export class AgentConnectionRowError extends Error {
  readonly code: string;
  constructor(code: string, detail: string) {
    super(`agent connection row refused: ${code} (${detail})`);
    this.name = "AgentConnectionRowError";
    this.code = code;
  }
}

/**
 * A write the database refused on an invariant, as opposed to a write that
 * lost a race and as opposed to an outage. The triggers raise
 * `restrict_violation` (23001); the CHECK constraints raise 23514. Both are
 * the database saying no, and neither means the authority is unavailable.
 *
 * Worth being exact about what this buys TODAY, because the r14 review was
 * right that it is less than it looks: `ConnectionAuthority.transition`
 * catches ANY throw from `compareAndSet` and reports
 * CONNECTION_AUTHORITY_UNAVAILABLE, so to that one consumer this is currently
 * indistinguishable from an outage. The distinction is carried here so a
 * consumer CAN tell them apart, and the authority's port is the thing that
 * would have to change for it to matter. That is a port change, not a store
 * change, and it is not made here.
 */
export class AgentConnectionInvariantError extends Error {
  readonly sqlState: string;
  constructor(sqlState: string, detail: string) {
    super(`agent connection invariant refused the write: ${detail}`);
    this.name = "AgentConnectionInvariantError";
    this.sqlState = sqlState;
  }
}

const CONNECTION_COLUMNS = [
  "id",
  "principal_label",
  "human_account_id",
  "client_family",
  "oauth_client_id",
  "environment",
  "preset",
  "status",
  "generation",
  "version",
  "revoked_at",
  "consented_at",
] as const;

const GRANT_COLUMNS = [
  "grant_id",
  "connection_id",
  "generation_at_consent",
  "oauth_client_id",
  "human_subject",
  "issuer",
  "resource",
  "capability_scopes",
  "protocol_scopes",
  "preset_at_consent",
  "consented_at",
  "destroy_status",
  "destroyed_at",
] as const;

const CONNECTION_SELECT = CONNECTION_COLUMNS.join(", ");

const STATUSES = new Set(["awaiting-consent", "authorized", "revoked"]);
const PRESETS = new Set(["read-only", "management"]);
const CLIENTS = new Set(["claude", "codex", "cursor"]);
const DESTROY_STATUSES = new Set([
  "not-requested",
  "pending",
  "done",
  "failed",
]);

/**
 * `BIGINT` arrives from node-postgres as a STRING, and the consented shape
 * wants a `number` — zod rejects `"3"` outright. Converting is not enough:
 * a value past `Number.MAX_SAFE_INTEGER` would convert silently and compare
 * wrongly forever after, so it is refused instead.
 */
const bigintToNumber = (value: unknown, column: string): number => {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value !== "string")
    throw new AgentConnectionRowError("NOT_A_BIGINT", column);
  if (!/^\d{1,19}$/u.test(value))
    throw new AgentConnectionRowError("NOT_A_BIGINT", column);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new AgentConnectionRowError("BIGINT_OUT_OF_SAFE_RANGE", column);
  return parsed;
};

/** `TIMESTAMPTZ` arrives as a `Date`; the consented shape wants an offset ISO string. */
const instantOrNull = (value: unknown, column: string): string | null => {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Date))
    throw new AgentConnectionRowError("NOT_A_TIMESTAMP", column);
  const ms = value.getTime();
  if (!Number.isFinite(ms))
    throw new AgentConnectionRowError("INVALID_TIMESTAMP", column);
  return value.toISOString();
};

const instant = (value: unknown, column: string): string => {
  const parsed = instantOrNull(value, column);
  if (parsed === null)
    throw new AgentConnectionRowError("TIMESTAMP_REQUIRED", column);
  return parsed;
};

const text = (value: unknown, column: string): string => {
  if (typeof value !== "string" || value.length === 0)
    throw new AgentConnectionRowError("NOT_TEXT", column);
  return value;
};

/**
 * `principal_label` and `oauth_client_id` were the two fields where this
 * parse was LAXER than `agentConnectionSchema`, which the r14 review found
 * while the header claimed the boundary parse was total. The database CHECK
 * on `oauth_client_id` counts characters, not the UTF-8 bytes the consented
 * schema bounds, so a row can be storable and still be refused on read-back.
 * Refusing it here is the honest place: a value the consented shape will not
 * accept is not a connection, whatever the column allows.
 */
const PRINCIPAL_LABEL = /^agent-[a-z0-9-]{2,57}$/u;
const CLIENT_ID_MAX_BYTES = 1024;

const shaped = (value: unknown, pattern: RegExp, column: string): string => {
  const parsed = text(value, column);
  if (!pattern.test(parsed))
    throw new AgentConnectionRowError("MALFORMED", column);
  return parsed;
};

const boundedBytes = (value: unknown, max: number, column: string): string => {
  const parsed = text(value, column);
  if (new TextEncoder().encode(parsed).length > max)
    throw new AgentConnectionRowError("TOO_MANY_BYTES", column);
  return parsed;
};

const member = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  column: string,
): T => {
  const parsed = text(value, column);
  if (!allowed.has(parsed))
    throw new AgentConnectionRowError("NOT_IN_ALLOWED_SET", column);
  return parsed as T;
};

const textArray = (value: unknown, column: string): readonly string[] => {
  if (!Array.isArray(value))
    throw new AgentConnectionRowError("NOT_AN_ARRAY", column);
  return value.map((entry, index) => text(entry, `${column}[${index}]`));
};

/**
 * Total parsing. Anything the database returns that does not fit the consented
 * shape is a refusal; nothing is coerced, defaulted or dropped.
 */
export const parseConnectionRow = (
  row: Record<string, unknown>,
): VersionedStoredConnection => ({
  connection: {
    id: text(row.id, "id"),
    principalLabel: shaped(
      row.principal_label,
      PRINCIPAL_LABEL,
      "principal_label",
    ),
    humanAccountId: text(row.human_account_id, "human_account_id"),
    client: member<StoredConnectionClient>(
      row.client_family,
      CLIENTS,
      "client_family",
    ),
    oauthClientId: boundedBytes(
      row.oauth_client_id,
      CLIENT_ID_MAX_BYTES,
      "oauth_client_id",
    ),
    environment: text(row.environment, "environment"),
    preset: member<StoredConnectionPreset>(row.preset, PRESETS, "preset"),
    status: member<StoredConnectionStatus>(row.status, STATUSES, "status"),
    generation: bigintToNumber(row.generation, "generation"),
    revokedAt: instantOrNull(row.revoked_at, "revoked_at"),
    consentedAt: instantOrNull(row.consented_at, "consented_at"),
  },
  version: bigintToNumber(row.version, "version"),
});

export const parseGrantRow = (
  row: Record<string, unknown>,
): StoredConsentGrant => ({
  grantId: text(row.grant_id, "grant_id"),
  connectionId: text(row.connection_id, "connection_id"),
  generationAtConsent: bigintToNumber(
    row.generation_at_consent,
    "generation_at_consent",
  ),
  oauthClientId: text(row.oauth_client_id, "oauth_client_id"),
  humanSubject: text(row.human_subject, "human_subject"),
  issuer: text(row.issuer, "issuer"),
  resource: text(row.resource, "resource"),
  capabilityScopes: textArray(row.capability_scopes, "capability_scopes"),
  protocolScopes: textArray(row.protocol_scopes, "protocol_scopes"),
  presetAtConsent: member<StoredConnectionPreset>(
    row.preset_at_consent,
    PRESETS,
    "preset_at_consent",
  ),
  consentedAt: instant(row.consented_at, "consented_at"),
  destroyStatus: member<StoredConsentGrant["destroyStatus"]>(
    row.destroy_status,
    DESTROY_STATUSES,
    "destroy_status",
  ),
  destroyedAt: instantOrNull(row.destroyed_at, "destroyed_at"),
});

/** Strips one table's alias prefix back to bare column names for parsing. */
const unprefix = (
  row: Record<string, unknown>,
  prefix: string,
): Record<string, unknown> => {
  const bare: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row))
    if (key.startsWith(prefix)) bare[key.slice(prefix.length)] = value;
  return bare;
};

/** The narrow slice of `pg.Pool` this store uses. */
type Queryable = {
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};

export interface AgentConnectionStoreOptions {
  /**
   * The connection this store issues its statements on. Which ROLE it
   * authenticates as is the whole least-privilege story: the resource-server
   * pool may only read, while lifecycle changes need the narrowly privileged
   * consent control-plane pool. This type cannot tell them apart, so the
   * composition root must, and a read-only pool will simply be refused by
   * PostgreSQL with 42501 rather than silently succeeding.
   */
  readonly pool: Queryable;
}

const SQLSTATE_INVARIANT = new Set([
  // BEFORE UPDATE triggers: the freezes, the monotonic guard, consume-once.
  "23001",
  // CHECK constraints: the id and label shapes, the enums, the CASE couplings.
  "23514",
  // Composite foreign keys. No statement in THIS file can raise one today —
  // the r14 review checked and was right — but `create` and `compareAndSet`
  // both write `agent_connections`, which carries the `current_grant_id`
  // foreign key the moment a caller sets that column through a widened port.
  // Listed so the mapping does not have to be remembered later.
  "23503",
]);

const asInvariant = (error: unknown): never => {
  const sqlState =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (SQLSTATE_INVARIANT.has(sqlState))
    throw new AgentConnectionInvariantError(
      sqlState,
      // The constraint NAME is safe to surface: it names a rule, never a value.
      typeof error === "object" && error !== null && "constraint" in error
        ? String((error as { constraint?: unknown }).constraint)
        : sqlState,
    );
  throw error;
};

export const createAgentConnectionStore = (
  options: AgentConnectionStoreOptions,
) => {
  const { pool } = options;

  return {
    /**
     * `ConnectionStore.read`. Returns null ONLY for a row that is genuinely
     * not there. A failure propagates, because the authority turns a throw
     * into CONNECTION_AUTHORITY_UNAVAILABLE and a null into
     * CONNECTION_NOT_FOUND, and those are opposite decisions.
     */
    async read(
      connectionId: string,
    ): Promise<VersionedStoredConnection | null> {
      const { rows } = await pool.query(
        `SELECT ${CONNECTION_SELECT} FROM community.agent_connections WHERE id=$1`,
        [connectionId],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : parseConnectionRow(row);
    },

    /**
     * `ConnectionStore.compareAndSet`, as ONE conditional UPDATE. The
     * authority calls this repeatedly under contention, so a
     * read-modify-write here would reintroduce exactly the race the version
     * column exists to close.
     *
     * `version` is bumped by the statement itself rather than by the caller,
     * so a caller cannot hold it still. The RETURNING clause gives back the
     * NEW version, which is what the authority hands to its own caller.
     */
    async compareAndSet(
      connectionId: string,
      expectedVersion: number,
      next: StoredConnection,
    ): Promise<VersionedStoredConnection | null> {
      if (next.id !== connectionId)
        throw new AgentConnectionRowError("ID_MISMATCH", "next.id");
      let result;
      try {
        result = await pool.query(
          `UPDATE community.agent_connections
              SET principal_label=$3,
                  human_account_id=$4,
                  client_family=$5,
                  oauth_client_id=$6,
                  environment=$7,
                  preset=$8,
                  status=$9,
                  generation=$10,
                  revoked_at=$11,
                  consented_at=$12,
                  version = version + 1
            WHERE id=$1 AND version=$2
        RETURNING ${CONNECTION_SELECT}`,
          [
            connectionId,
            expectedVersion,
            next.principalLabel,
            next.humanAccountId,
            next.client,
            next.oauthClientId,
            next.environment,
            next.preset,
            next.status,
            next.generation,
            next.revokedAt,
            next.consentedAt,
          ],
        );
      } catch (error) {
        return asInvariant(error);
      }
      const row = result.rows[0] as Record<string, unknown> | undefined;
      // No row matched: another writer moved first. NOT an error — the
      // authority reads null as "re-decide against what is actually there".
      return row === undefined ? null : parseConnectionRow(row);
    },

    /**
     * The creation path the port does not have. `ConnectionStore` is `read`
     * and `compareAndSet` only, so `openConnection` produced a value nothing
     * could persist.
     *
     * Ids are never reused, and this is where that is enforced rather than
     * hoped for: `ON CONFLICT DO NOTHING` plus a null result means the id
     * already exists, and re-opening it would reset `generation` to 0 and
     * revalidate a generation-1 token from that id's previous life.
     */
    async create(
      connection: StoredConnection,
    ): Promise<VersionedStoredConnection | null> {
      let result;
      try {
        result = await pool.query(
          `INSERT INTO community.agent_connections
             (id, principal_label, human_account_id, client_family,
              oauth_client_id, environment, preset, status, generation,
              revoked_at, consented_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO NOTHING
        RETURNING ${CONNECTION_SELECT}`,
          [
            connection.id,
            connection.principalLabel,
            connection.humanAccountId,
            connection.client,
            connection.oauthClientId,
            connection.environment,
            connection.preset,
            connection.status,
            connection.generation,
            connection.revokedAt,
            connection.consentedAt,
          ],
        );
      } catch (error) {
        return asInvariant(error);
      }
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : parseConnectionRow(row);
    },

    /**
     * What authorization reads: the connection whose CURRENT state decides
     * revocation, joined to the FROZEN grant whose identity decides who.
     *
     * The join is on `current_grant_id`, and it is a LEFT join on purpose —
     * a connection with no current grant must reach the boundary as
     * `grant: null` and be refused there with a reason, rather than
     * disappearing from this read and being reported as "no such connection".
     */
    async readForAuthorization(
      connectionId: string,
    ): Promise<ConnectionForAuthorization | null> {
      const { rows } = await pool.query(
        `SELECT ${CONNECTION_COLUMNS.map((c) => `c.${c} AS "c_${c}"`).join(", ")},
                ${GRANT_COLUMNS.map((c) => `g.${c} AS "g_${c}"`).join(", ")}
           FROM community.agent_connections c
           LEFT JOIN community.agent_connection_grants g
             ON g.connection_id = c.id AND g.grant_id = c.current_grant_id
          WHERE c.id=$1`,
        [connectionId],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      if (row === undefined) return null;
      // Every column is aliased because the two tables share four names —
      // `oauth_client_id`, `consented_at`, `connection_id`/`id` and
      // `generation`. Unaliased, node-postgres keeps only the LAST of each,
      // so the grant's frozen identity would overwrite the connection's
      // mutable one and this read would report the opposite of what it says.
      const { connection } = parseConnectionRow(unprefix(row, "c_"));
      // A LEFT join with no match leaves every grant column NULL. The primary
      // key cannot be null in a real row, so it is the honest discriminator.
      const grant =
        row.g_grant_id === null || row.g_grant_id === undefined
          ? null
          : parseGrantRow(unprefix(row, "g_"));
      return { connection, grant };
    },

    /** One frozen consent snapshot, by its provider grant id. */
    async readGrant(grantId: string): Promise<StoredConsentGrant | null> {
      const { rows } = await pool.query(
        `SELECT ${GRANT_COLUMNS.join(", ")}
           FROM community.agent_connection_grants WHERE grant_id=$1`,
        [grantId],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : parseGrantRow(row);
    },
  };
};

export type AgentConnectionStore = ReturnType<
  typeof createAgentConnectionStore
>;
