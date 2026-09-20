import {
  AgentConnectionRowError,
  asInvariant,
  bigintToNumber,
  boundedBytes,
  instant,
  instantOrNull,
  member,
  text,
  textArray,
} from "./agent-connection-store.js";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — the browser consent transaction.
 *
 * The provider hands a browser an interaction uid. That uid arrives in a URL,
 * so it is a NAME and never an authorization: it proves nothing about who is
 * holding it. This store is where the uid becomes a decision an authenticated
 * human made, and the shape of it is dictated by one measured fact.
 *
 * **The Owner's Payload session cookie is `SameSite=Strict`, and a
 * cross-site navigation from the provider does not carry it.** Measured in
 * headless Chromium, one context, host-only cookie, no `Domain`:
 *
 *   admin.localhost sees                    probe_strict=S
 *   auth.localhost sees                     (none)
 *   admin after cross-site nav from auth    (none)
 *   admin after a same-site step            probe_strict=S
 *
 * So the landing page the provider redirects to CANNOT authenticate anybody,
 * and no redirect chain fixes that — the fourth line is the provider's
 * redirect, and it is empty. The human takes one same-origin step of their
 * own, and only the page after it sees a session. That is why a consent is
 * two rows-worth of state rather than one request:
 *
 *  1. the review page, authenticated, mints a ticket and stores its DIGEST;
 *  2. the POST must produce the ticket itself.
 *
 * A POST that cannot produce it did not come from a page this server rendered
 * to this human, which is the CSRF property — obtained without touching a
 * cookie attribute and without a same-site bounce nobody tested.
 *
 * The four methods below are TWO roles' halves, and the split is the design:
 *
 *   `open`   PROVIDER. Writes only what the provider will enforce — the exact
 *            client, resource, scopes and deadline of a live interaction. It
 *            never authenticates a human, so it cannot say who consented, and
 *            it holds no privilege on `decision`.
 *   `arm`    CONTROL PLANE. Writes who is deciding, about which connection,
 *            and the digest of the secret it just handed that browser.
 *   `decide` CONTROL PLANE. The decision, once.
 *   `resume` PROVIDER. Marks the interaction spent and records its grant.
 *
 * So there is no shared secret between the Admin and the provider and no HTTP
 * hop where one asserts the other's facts: the row IS the integration, and
 * each half is bounded by a column grant rather than by trust.
 *
 * Three refusals are the database's, not this module's, and that is on
 * purpose (probed on the live schema, r15):
 *
 *   * `preset = 'management'`        -> CHECK `..._read_only_milestone`
 *   * a second decision              -> trigger "a consent decision is final"
 *   * a second resume                -> trigger "a resumed interaction is spent"
 *
 * The single-use property is therefore not a `SELECT ... then UPDATE` this
 * code could lose a race on. Two concurrent approvals both reach the UPDATE;
 * one wins and the other is refused by the trigger.
 */

/** A decision, spelled exactly as the CHECK constraint spells it. */
export type ConsentDecision = "approved" | "denied";

/** The presets the column allows. Only one is reachable this milestone. */
export type ConsentPreset = "read-only" | "management";

/**
 * A consent as the Admin reads it back. Nothing here is a credential: the
 * ticket exists only as a digest, and no token or cookie value is stored.
 */
export interface StoredConsent {
  readonly interactionUid: string;
  /** Null until the review page says which connection this is about. */
  readonly connectionId: string | null;
  /** Null until the review page authenticates somebody. */
  readonly humanAccountId: string | null;
  readonly oauthClientId: string;
  readonly resource: string;
  readonly capabilityScopes: readonly string[];
  readonly protocolScopes: readonly string[];
  readonly preset: ConsentPreset;
  /** Null until the review page mints one. The provider never sees it. */
  readonly ticketArmed: boolean;
  readonly grantedGeneration: number | null;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly decidedAt: string | null;
  readonly decision: ConsentDecision | null;
  readonly resumedAt: string | null;
  readonly grantId: string | null;
}

/**
 * What the PROVIDER writes when an interaction starts: the facts it will
 * enforce, and nothing about any human. There is deliberately no field here
 * for who is consenting, because the provider does not know and must not say.
 */
export interface ConsentOpening {
  readonly interactionUid: string;
  readonly oauthClientId: string;
  readonly resource: string;
  readonly capabilityScopes: readonly string[];
  readonly protocolScopes: readonly string[];
  readonly preset: ConsentPreset;
  readonly expiresAt: string;
}

/**
 * What the CONTROL PLANE writes when the review page renders: who is
 * deciding, about which connection, and the digest of the single-use secret
 * handed to that browser.
 */
export interface ConsentArming {
  readonly interactionUid: string;
  /** SHA-256 of the ticket, lowercase hex. The ticket itself is never stored. */
  readonly ticketDigest: string;
  readonly connectionId: string;
  readonly humanAccountId: string;
}

const DECISIONS = new Set<string>(["approved", "denied"]);
const PRESETS = new Set<string>(["read-only", "management"]);
const DIGEST = /^[0-9a-f]{64}$/u;

const UID_MAX_BYTES = 256;
const CLIENT_ID_MAX_BYTES = 1024;
const RESOURCE_MAX_BYTES = 512;
const ACCOUNT_MAX_BYTES = 128;

const CONSENT_COLUMNS = [
  "interaction_uid",
  // Presence, never the value: a digest is not a credential, but there is no
  // reason for one to travel further than the WHERE clause that checks it.
  "(ticket_digest IS NOT NULL) AS ticket_armed",
  "connection_id",
  "human_account_id",
  "oauth_client_id",
  "resource",
  "capability_scopes",
  "protocol_scopes",
  "preset",
  "granted_generation",
  "issued_at",
  "expires_at",
  "decided_at",
  "decision",
  "resumed_at",
  "grant_id",
] as const;

const CONSENT_SELECT = CONSENT_COLUMNS.join(", ");

/**
 * Total parsing, like every other row in this package. A consent that does
 * not parse is a refusal, never a half-populated object somebody then decides
 * from.
 */
export const parseConsentRow = (
  row: Record<string, unknown>,
): StoredConsent => {
  const decision =
    row.decision === null || row.decision === undefined
      ? null
      : member<ConsentDecision>(row.decision, DECISIONS, "decision");
  const decidedAt = instantOrNull(row.decided_at, "decided_at");
  // The column pair the CHECK constraint couples. Parsing it as two
  // independent fields would let a row that somehow escaped the constraint
  // read back as "decided at no time".
  if ((decision === null) !== (decidedAt === null))
    throw new AgentConnectionRowError("DECISION_NOT_RECORDED", "decision");
  const grantedGeneration =
    row.granted_generation === null || row.granted_generation === undefined
      ? null
      : bigintToNumber(row.granted_generation, "granted_generation");
  if ((grantedGeneration === null) !== (decision !== "approved"))
    throw new AgentConnectionRowError(
      "GENERATION_NOT_COUPLED_TO_APPROVAL",
      "granted_generation",
    );
  const resumedAt = instantOrNull(row.resumed_at, "resumed_at");
  if (resumedAt !== null && decision !== "approved")
    throw new AgentConnectionRowError("RESUME_WITHOUT_APPROVAL", "resumed_at");
  const grantId =
    row.grant_id === null || row.grant_id === undefined
      ? null
      : boundedBytes(row.grant_id, 256, "grant_id");
  if (grantId !== null && resumedAt === null)
    throw new AgentConnectionRowError("GRANT_WITHOUT_RESUME", "grant_id");
  const ticketArmed = row.ticket_armed;
  if (typeof ticketArmed !== "boolean")
    throw new AgentConnectionRowError("NOT_A_BOOLEAN", "ticket_armed");
  // The three columns the CHECK constraint couples to a decision. A decided
  // row that reads back unattributed would be a decision nobody made.
  if (
    decision !== null &&
    (!ticketArmed ||
      row.human_account_id === null ||
      row.connection_id === null)
  )
    throw new AgentConnectionRowError("DECISION_NOT_ATTRIBUTED", "decision");
  return {
    interactionUid: boundedBytes(
      row.interaction_uid,
      UID_MAX_BYTES,
      "interaction_uid",
    ),
    ticketArmed,
    connectionId:
      row.connection_id === null || row.connection_id === undefined
        ? null
        : text(row.connection_id, "connection_id"),
    humanAccountId:
      row.human_account_id === null || row.human_account_id === undefined
        ? null
        : boundedBytes(
            row.human_account_id,
            ACCOUNT_MAX_BYTES,
            "human_account_id",
          ),
    oauthClientId: boundedBytes(
      row.oauth_client_id,
      CLIENT_ID_MAX_BYTES,
      "oauth_client_id",
    ),
    resource: boundedBytes(row.resource, RESOURCE_MAX_BYTES, "resource"),
    capabilityScopes: textArray(row.capability_scopes, "capability_scopes"),
    protocolScopes: textArray(row.protocol_scopes, "protocol_scopes"),
    preset: member<ConsentPreset>(row.preset, PRESETS, "preset"),
    grantedGeneration,
    issuedAt: instant(row.issued_at, "issued_at"),
    expiresAt: instant(row.expires_at, "expires_at"),
    decidedAt,
    decision,
    resumedAt,
    grantId,
  };
};

/** The narrow slice of `pg.Pool` this store uses. */
type Queryable = {
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};

export interface ConsentStoreOptions {
  /**
   * WHICH ROLE this pool authenticates as is the whole story, and the two
   * halves of the consent path deliberately cannot do each other's job:
   *
   *   consent/control-plane role  -- INSERT, and UPDATE (decision, decided_at,
   *                                  granted_generation). Cannot resume, cannot
   *                                  write a grant, cannot touch a token store.
   *   provider role               -- SELECT, and UPDATE (resumed_at, grant_id).
   *                                  Cannot record a decision at all.
   *
   * Probed on the live schema (r15): a provider-role decision write and a
   * consent-role resume write are both refused with 42501, so calling the
   * wrong method on the wrong pool fails loudly rather than succeeding.
   */
  readonly pool: Queryable;
}

export const createConsentStore = (options: ConsentStoreOptions) => {
  const { pool } = options;

  return {
    /**
     * Opens an interaction. The PROVIDER's method, called once when the
     * authorization request produces an interaction, writing only the facts
     * the provider itself will enforce.
     *
     * `ON CONFLICT DO NOTHING` plus a zero rowCount reports a uid that already
     * exists: the first interaction stands and this returns null, rather than
     * a second set of enforced facts quietly replacing the first.
     */
    async open(opening: ConsentOpening): Promise<StoredConsent | null> {
      let result;
      try {
        result = await pool.query(
          `INSERT INTO community.agent_connection_consents
             (interaction_uid, oauth_client_id, resource, capability_scopes,
              protocol_scopes, preset, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (interaction_uid) DO NOTHING
           RETURNING ${CONSENT_SELECT}`,
          [
            opening.interactionUid,
            opening.oauthClientId,
            opening.resource,
            [...opening.capabilityScopes],
            [...opening.protocolScopes],
            opening.preset,
            opening.expiresAt,
          ],
        );
      } catch (error) {
        return asInvariant(error);
      }
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : parseConsentRow(row);
    },

    /**
     * Arms an undecided interaction with the identity it will be decided
     * under. The CONTROL PLANE's method, called by the review page AFTER it
     * has authenticated the Owner session.
     *
     * Re-arming an undecided interaction is deliberately allowed and
     * deliberately destructive: reloading the review page mints a fresh
     * ticket and kills the previous one, which is what single-use means for a
     * page somebody opened twice. `decided_at IS NULL` and the live deadline
     * are in the WHERE clause, so a decided or expired interaction cannot be
     * re-armed at all.
     */
    async arm(arming: ConsentArming): Promise<StoredConsent | null> {
      if (!DIGEST.test(arming.ticketDigest))
        throw new AgentConnectionRowError("MALFORMED", "ticket_digest");
      let result;
      try {
        result = await pool.query(
          `UPDATE community.agent_connection_consents
              SET ticket_digest=$2,
                  human_account_id=$3,
                  connection_id=$4
            WHERE interaction_uid=$1
              AND decided_at IS NULL
              AND expires_at > CURRENT_TIMESTAMP
          RETURNING ${CONSENT_SELECT}`,
          [
            arming.interactionUid,
            arming.ticketDigest,
            arming.humanAccountId,
            arming.connectionId,
          ],
        );
      } catch (error) {
        return asInvariant(error);
      }
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : parseConsentRow(row);
    },

    /**
     * Reads one consent. Null ONLY for a row that is genuinely absent; an
     * outage throws, because "no such interaction" and "the control plane
     * cannot answer" are opposite decisions and must not collapse.
     */
    async read(interactionUid: string): Promise<StoredConsent | null> {
      const { rows } = await pool.query(
        `SELECT ${CONSENT_SELECT}
           FROM community.agent_connection_consents
          WHERE interaction_uid=$1`,
        [interactionUid],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : parseConsentRow(row);
    },

    /**
     * Records the human's decision. The control-plane role's method.
     *
     * Every binding is in the WHERE clause rather than checked beforehand, so
     * there is no window between the check and the write:
     *
     *   * `ticket_digest` — the POST produced the ticket this server rendered;
     *   * `human_account_id` — the SAME human the review page armed it for,
     *      so a foreign session holding a leaked ticket still writes nothing;
     *   * `decided_at IS NULL` — single use;
     *   * `expires_at > now()` — an abandoned tab is not a standing permission.
     *
     * A null return means one of those did not hold. It deliberately does not
     * say WHICH: the caller has no legitimate use for a distinction that would
     * also tell a prober whether a ticket was merely expired or wrong.
     */
    async decide(input: {
      readonly interactionUid: string;
      readonly ticketDigest: string;
      readonly humanAccountId: string;
      readonly decision: ConsentDecision;
      readonly grantedGeneration: number | null;
    }): Promise<StoredConsent | null> {
      if (!DIGEST.test(input.ticketDigest))
        throw new AgentConnectionRowError("MALFORMED", "ticket_digest");
      if (
        (input.grantedGeneration === null) !==
        (input.decision !== "approved")
      )
        throw new AgentConnectionRowError(
          "GENERATION_NOT_COUPLED_TO_APPROVAL",
          "granted_generation",
        );
      let result;
      try {
        result = await pool.query(
          `UPDATE community.agent_connection_consents
              SET decision=$4,
                  decided_at=CURRENT_TIMESTAMP,
                  granted_generation=$5
            WHERE interaction_uid=$1
              AND ticket_digest=$2
              AND human_account_id=$3
              AND decided_at IS NULL
              AND expires_at > CURRENT_TIMESTAMP
          RETURNING ${CONSENT_SELECT}`,
          [
            input.interactionUid,
            input.ticketDigest,
            input.humanAccountId,
            input.decision,
            input.grantedGeneration,
          ],
        );
      } catch (error) {
        return asInvariant(error);
      }
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : parseConsentRow(row);
    },

    /**
     * Marks an approved interaction spent, and records the grant it produced.
     * The PROVIDER role's method, and the only write it has on this table.
     *
     * `resumed_at IS NULL` in the WHERE clause is the replay defence; the
     * trigger is the same defence one layer down, for a caller holding a role
     * that can write the column at all.
     */
    async resume(input: {
      readonly interactionUid: string;
      readonly grantId: string;
    }): Promise<StoredConsent | null> {
      let result;
      try {
        result = await pool.query(
          `UPDATE community.agent_connection_consents
              SET resumed_at=CURRENT_TIMESTAMP,
                  grant_id=$2
            WHERE interaction_uid=$1
              AND decision='approved'
              AND resumed_at IS NULL
          RETURNING ${CONSENT_SELECT}`,
          [input.interactionUid, input.grantId],
        );
      } catch (error) {
        return asInvariant(error);
      }
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row === undefined ? null : parseConsentRow(row);
    },
  };
};

export type ConsentStore = ReturnType<typeof createConsentStore>;
