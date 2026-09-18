import { ConnectionAuthError, canonicalInstant } from "./contracts";

import type { AgentConnection, ConnectionPreset } from "./contracts";

/**
 * Agent Connections V1 (Issue #141 r10) — connect, disconnect, reconnect.
 *
 * These are pure transitions over one connection record. Persistence is the
 * caller's; keeping the rules here means the same rules hold whether a
 * transition arrives from the Admin view, an operator endpoint or a test.
 *
 * The invariant the whole disconnect story rests on: **generation only ever
 * increases, and every token carries the generation it was minted under.**
 * That is what makes a disconnect deny an unexpired access token, its refresh
 * token and an already-open MCP session, without any of them being found and
 * deleted, and without trusting a clock. Reconnecting increases it again, so
 * tokens from before a disconnect can never be resurrected by reconnecting.
 */

export interface ConsentRecord {
  /** The human who consented, authenticated by the Admin, not by the agent. */
  readonly humanAccountId: string;
  /** What they consented to. Presets, not free-form scope lists. */
  readonly preset: ConnectionPreset;
  /** When, so the record can say how old a consent is. */
  readonly at: string;
}

/**
 * A new connection begins unconsented and powerless. It holds a principal
 * label and a client, and grants nothing until a human says so in a browser.
 *
 * Connection ids are never reused. This resets `generation` to 0, so
 * re-opening an existing id would make a generation-1 token from that id's
 * previous life valid again after the next consent. The authority owns no
 * creation path today, which is why this is a trap rather than a bug — it is
 * written down so it stays one.
 */
export const openConnection = (fields: {
  readonly id: string;
  readonly principalLabel: string;
  readonly humanAccountId: string;
  readonly client: AgentConnection["client"];
  /** The exact registered OAuth client this connection will authorize. */
  readonly oauthClientId: string;
  readonly environment: string;
  readonly preset?: ConnectionPreset;
}): AgentConnection => ({
  id: fields.id,
  principalLabel: fields.principalLabel,
  humanAccountId: fields.humanAccountId,
  client: fields.client,
  oauthClientId: fields.oauthClientId,
  environment: fields.environment,
  // Read-only unless the human deliberately chose otherwise. A connection
  // never acquires management by default or by omission.
  preset: fields.preset ?? "read-only",
  status: "awaiting-consent",
  generation: 0,
  revokedAt: null,
  consentedAt: null,
});

/**
 * The browser consent landing. It binds the consenting human to the
 * connection: consent by somebody else is not consent, and is refused rather
 * than silently re-pointing the connection at a new owner.
 */
export const authorizeConnection = (
  connection: AgentConnection,
  consent: ConsentRecord,
): AgentConnection => {
  // Both, not just status: a record carrying `revokedAt` under a non-revoked
  // status must not be laundered clean by a consent. `admitGrant` and
  // `admitWrite` already check both, and the asymmetry is what turns into a
  // resurrection later.
  if (connection.status === "revoked" || connection.revokedAt !== null)
    throw new ConnectionAuthError("CONNECTION_REVOKED");
  if (connection.humanAccountId !== consent.humanAccountId)
    throw new ConnectionAuthError("CONNECTION_CONSENT_SUBJECT_MISMATCH");
  return {
    ...connection,
    preset: consent.preset,
    status: "authorized",
    revokedAt: null,
    consentedAt: canonicalInstant(consent.at),
    // A first authorization starts the first generation that can mint tokens.
    generation: connection.generation + 1,
  };
};

/**
 * Raising a connection's permission is a NEW consent, never an edit. The
 * generation bump is deliberate: tokens minted under the narrower preset stop
 * working rather than silently widening, so what a live session can do never
 * changes underneath it.
 */
export const reconsentConnection = (
  connection: AgentConnection,
  consent: ConsentRecord,
): AgentConnection => {
  if (connection.status !== "authorized")
    throw new ConnectionAuthError("CONNECTION_NOT_AUTHORIZED");
  return authorizeConnection(
    { ...connection, status: "awaiting-consent" },
    consent,
  );
};

/**
 * Disconnect. Idempotent, because a second click must not look like a failure
 * and must not churn the generation of an already-dead connection.
 */
export const revokeConnection = (
  connection: AgentConnection,
  at: string,
): AgentConnection => {
  // Validated before the idempotent branch, so a malformed timestamp is
  // refused whatever the current state is rather than throwing on a live
  // connection and passing silently on an already-revoked one.
  const revokedAt = canonicalInstant(at);
  return connection.status === "revoked"
    ? connection
    : {
        ...connection,
        status: "revoked",
        revokedAt,
        generation: connection.generation + 1,
      };
};

/**
 * Reconnect is a fresh consent, not a restoration. It produces a generation
 * strictly greater than the one the revocation produced, so no token, refresh
 * token or session from before the disconnect is valid again — which is the
 * difference between reconnecting and undoing a disconnect.
 */
export const reconnectConnection = (
  connection: AgentConnection,
  consent: ConsentRecord,
): AgentConnection => {
  if (connection.status !== "revoked")
    throw new ConnectionAuthError("CONNECTION_NOT_REVOKED");
  if (connection.humanAccountId !== consent.humanAccountId)
    throw new ConnectionAuthError("CONNECTION_CONSENT_SUBJECT_MISMATCH");
  return {
    ...connection,
    preset: consent.preset,
    status: "authorized",
    revokedAt: null,
    consentedAt: canonicalInstant(consent.at),
    generation: connection.generation + 1,
  };
};

/**
 * Write admission. A mutation may only BEGIN under a connection that is still
 * authorized at the generation its token was minted under.
 *
 * This is deliberately about starting work, not about finishing it. A
 * mutation that already committed keeps its receipt: revoke is not undo, and
 * pretending otherwise would put the tally and the audit row into exactly the
 * disagreement the r7 receipt work exists to prevent.
 */
export const admitWrite = (
  connection: AgentConnection,
  tokenGeneration: number,
): void => {
  if (connection.status === "revoked" || connection.revokedAt !== null)
    throw new ConnectionAuthError("CONNECTION_REVOKED");
  if (connection.status !== "authorized")
    throw new ConnectionAuthError("CONNECTION_NOT_AUTHORIZED");
  if (connection.generation !== tokenGeneration)
    throw new ConnectionAuthError("CONNECTION_GENERATION_STALE");
};
