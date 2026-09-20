export { ConnectionAuthError } from "./contracts";
export type {
  ConnectionRecord,
  ConsentSnapshot,
  VerifiedGrant,
} from "./contracts";

import { ConnectionAuthError, scopesMatchPreset } from "./contracts";

import type {
  AgentConnection,
  ConnectionRecord,
  ConsentSnapshot,
  VerifiedGrant,
} from "./contracts";

/**
 * Agent Connections V1 (Issue #141 r14) — the admission decision, with no web
 * framework attached.
 *
 * Split out of `authorization.ts` for a measured reason, not a tidy one.
 * `authorization.ts` imports `UnauthorizedError` from `payload`, which is only
 * needed by `connectionAuth`'s outer catch — but it is a module-scope import,
 * so anything wanting `admitGrant` dragged the whole framework in with it.
 * When the r14 ten-step regression started calling the production function,
 * that pulled Payload into the PostgreSQL test lane and cost ~1.7s of extra
 * module loading, which was enough to tip load-sensitive hooks elsewhere in
 * the same file: measured at 3/3 green before and 1 failure in 3 after.
 *
 * The rule a resource server applies to a token should not depend on the
 * framework that happens to serve it. Now it does not.
 */

/**
 * What survives admission: the connection the request acts as, and the
 * consent it was admitted under. The consent travels with it because the
 * tools a request may call are the ones the human agreed to for THAT grant —
 * a preset edited on the connection afterwards is not consent, and must not
 * widen a token that already exists. Narrowing is done by revoking, which
 * bumps the generation and is the mechanism that already has tests.
 */
export interface AdmittedConnection {
  readonly connection: AgentConnection;
  readonly consent: ConsentSnapshot;
}

/**
 * Checks a verified token against its connection. Every mismatch is a refusal
 * with its own code, because "why was this refused" is the first question a
 * connection diagnostic has to answer.
 *
 * Expects an ALREADY-PARSED grant: the `verifiedGrantSchema` parse lives in
 * `connectionAuth`, so this function does not re-validate its own input. A
 * caller that has not parsed first is handing it untrusted data.
 *
 * That warning matters more now than it did, because r14 put this function on
 * a PUBLIC export subpath (`admin/agent-connections-admission`) so the
 * PostgreSQL test lane could reach it without dragging in the web framework.
 * Anything arriving that way must parse through `verifiedGrantSchema` itself.
 * The r14 ten-step witness hands over a hand-built grant assembled from the
 * provider's own AccessToken record — which is the deliberate-construction
 * case this paragraph allows, and it is worth knowing that is what it is.
 */
export const admitGrant = (
  grant: VerifiedGrant,
  record: ConnectionRecord | null,
  expected: { issuer: string; resource: string; environment: string },
  now: Date = new Date(),
): AdmittedConnection => {
  const connection = record?.connection ?? null;
  const consent = record?.grant ?? null;
  // NOTE: currently vacuous, and said here rather than only in a design doc,
  // because this is where a future reader will decide whether to trust it. The
  // provider's access token carries no `iss`, so the verifier fills
  // `grant.issuer` from the same configuration `expected.issuer` reads — the
  // comparison is `x !== x`. It is kept, not deleted, because a check removed
  // for being unfalsifiable tends to be re-added wrongly for the multi-issuer
  // case. Make it real by sourcing `grant.issuer` from the provider instance
  // that actually resolved the token, so the two sides arrive by different
  // routes and the comparison becomes a genuine consistency assertion.
  if (grant.issuer !== expected.issuer)
    throw new ConnectionAuthError("CONNECTION_ISSUER_MISMATCH");
  if (grant.resource !== expected.resource)
    throw new ConnectionAuthError("CONNECTION_RESOURCE_MISMATCH");
  if (connection === null)
    throw new ConnectionAuthError("CONNECTION_NOT_FOUND");
  if (connection.id !== grant.connectionId)
    throw new ConnectionAuthError("CONNECTION_MISMATCH");
  // Identity comes off the FROZEN consent snapshot, never off the connection.
  // r14 found these two comparisons reading `connection.humanAccountId` and
  // `connection.oauthClientId` — columns that stay writable by design and that
  // no trigger freezes — while the r13 migration's own COMMENT ON TABLE says
  // authorization MUST read identity from the grant row for exactly that
  // reason. The comment was right and the code was wrong.
  //
  // A connection with no current consent is refused HERE, with its own code,
  // rather than being reported as a missing connection.
  if (consent === null)
    throw new ConnectionAuthError("CONNECTION_CONSENT_MISSING");
  if (consent.connectionId !== connection.id)
    throw new ConnectionAuthError("CONNECTION_CONSENT_MISMATCH");
  // The consenting human. A token minted for one person must never act on
  // another person's connection, however well-formed it is.
  if (consent.humanSubject !== grant.subject)
    throw new ConnectionAuthError("CONNECTION_SUBJECT_MISMATCH");
  // The exact registered client, not the descriptive vendor family. Two
  // clients of the same family are two different authorizations.
  if (consent.oauthClientId !== grant.clientId)
    throw new ConnectionAuthError("CONNECTION_CLIENT_MISMATCH");
  if (connection.environment !== expected.environment)
    throw new ConnectionAuthError("CONNECTION_ENVIRONMENT_MISMATCH");
  if (connection.status === "revoked" || connection.revokedAt !== null)
    throw new ConnectionAuthError("CONNECTION_REVOKED");
  if (connection.status !== "authorized")
    throw new ConnectionAuthError("CONNECTION_NOT_AUTHORIZED");
  // The generation check is the revocation. A token minted before a disconnect
  // is refused here even though its own expiry has not arrived.
  if (connection.generation !== grant.generation)
    throw new ConnectionAuthError("CONNECTION_GENERATION_STALE");
  // Exact scope agreement, checked LAST so a scope mismatch cannot be used to
  // probe whether a connection exists. Extra, missing, unknown, duplicated or
  // malformed claims all fail, and an absent claim never inherits the preset.
  // Two agreements, not one. The token must match the preset the human chose,
  // AND the preset must match the scopes actually frozen at the provider. A
  // grant whose stored capability set disagrees with its own preset is a
  // record of a consent that never coherently happened, and admitting on the
  // preset alone would never have surfaced it.
  if (!scopesMatchPreset(consent.capabilityScopes, consent.presetAtConsent))
    throw new ConnectionAuthError("CONNECTION_CONSENT_INCOHERENT");
  if (!scopesMatchPreset(grant.scopes, consent.presetAtConsent))
    throw new ConnectionAuthError("CONNECTION_SCOPE_MISMATCH");
  // Freshness is this boundary's business. Leaving it to whatever the verifier
  // happens to enforce is the easiest obligation for the next implementer to
  // miss, and an expired token that still works is indistinguishable from no
  // expiry at all.
  // `Date.parse` answers NaN for anything it cannot read — including a JWT
  // `exp`, which is a NumericDate and therefore a NUMBER — and every NaN
  // comparison is false. Written as a bare `<=` this check silently admitted
  // exactly the value a real verifier is most likely to hand it. An
  // unreadable expiry is an expired token, not an absent constraint.
  const expiresAt = Date.parse(grant.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime())
    throw new ConnectionAuthError("CONNECTION_TOKEN_EXPIRED");
  return { connection, consent };
};
