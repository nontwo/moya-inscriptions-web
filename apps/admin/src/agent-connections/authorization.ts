import { UnauthorizedError } from "payload";

import {
  ConnectionAuthError,
  PRESET_TOOLS,
  isConnectionToken,
  scopesMatchPreset,
  toolGrantKey,
  verifiedGrantSchema,
} from "./contracts";

import type {
  AgentConnection,
  ConnectionPreset,
  ConnectionRecord,
  ConsentSnapshot,
  VerifiedGrant,
} from "./contracts";
import type { MCPAccessSettings } from "@payloadcms/plugin-mcp";
import type { PayloadRequest, TypedUser } from "payload";

/**
 * Agent Connections V1 (Issue #141 r10) — authenticating one MCP request.
 *
 * This is the seam where a browser-consented connection becomes a restricted
 * principal. It runs on EVERY protected request, not only on initialize:
 * `resolveAccessSettings` is called per request by the plugin, so a token
 * revoked a second ago is refused on the next tool call rather than at the
 * next handshake.
 *
 * Four rules hold here and are each covered by a regression:
 *
 *  1. A credential that claims to be ours succeeds on its own terms or is
 *     refused. It never falls back to the legacy API-key resolver, to an
 *     Owner session cookie, or to anonymous access.
 *  2. Every binding on the token is checked against the connection: the
 *     consenting human (`subject`), the exact registered OAuth client, the
 *     issuer, the resource, the environment and the scope set. A valid
 *     signature is not an authorization.
 *  3. What a connection may CALL is derived from its preset, never from the
 *     token's scope claim — the claim must equal the preset's canonical set,
 *     and the preset then decides the tools. A token can neither widen its
 *     connection nor silently narrow it.
 *  4. The connection's `generation` must match the token's. That is what
 *     makes disconnect effective against an unexpired token and a live
 *     session, without depending on a clock.
 */

/** Verifies the presented token's signature/format and returns its claims. */
export type AccessTokenVerifier = (
  presented: string,
) => Promise<VerifiedGrant | null>;

/**
 * Reads the current connection record together with its frozen consent
 * snapshot. Returns null when the connection does not exist.
 *
 * The record it returns is TRUSTED in the sense that it comes from ArtVenn's
 * own store rather than from a caller-supplied token — but "trusted" now
 * means "already parsed", not "unparsed". r14's PostgreSQL store parses every
 * row totally at the store boundary and refuses one that does not fit, which
 * is what the earlier version of this comment asked the persistence
 * implementer to do.
 */
export type ConnectionReader = (
  connectionId: string,
) => Promise<ConnectionRecord | null>;

export interface ConnectionAuthDependencies {
  readonly verifyAccessToken: AccessTokenVerifier;
  readonly readConnection: ConnectionReader;
  /** The issuer this deployment trusts. A token from any other is refused. */
  readonly issuer: string;
  /** The RFC 8707 resource this endpoint is. Audience binding, not decoration. */
  readonly resource: string;
  /** Which ArtVenn environment this endpoint serves. */
  readonly environment: string;
  /** Server-side refusal diagnostics. Receives a bare code, never a token. */
  readonly recordRefusal?: (code: string) => void;
}

const BEARER = /^bearer[ \t]+/iu;

const bearerOf = (req: PayloadRequest): string | null => {
  const header = req.headers.get("Authorization");
  if (header === null || !BEARER.test(header)) return null;
  const presented = header.replace(BEARER, "").trim();
  return presented === "" ? null : presented;
};

/**
 * The tool map the plugin gates on. Absent means absent from `tools/list` as
 * well as refused on call, so a read-only connection never even sees the
 * management tools.
 */
const toolGrants = (preset: ConnectionPreset): Record<string, boolean> =>
  Object.fromEntries(
    PRESET_TOOLS[preset].map((tool) => [toolGrantKey(tool), true]),
  );

/**
 * The identity the existing tools already understand. `agentPrincipalOf`
 * reads `agentPrincipal` off `req.user`, so a connection reuses the whole
 * Backend path — scopes, approvals, delegations, fencing, receipts — with no
 * second copy of the business rules and no new trust in the adapter.
 */
const connectionUser = (connection: AgentConnection): TypedUser =>
  ({
    id: connection.id,
    collection: "users",
    _strategy: "artvenn-connection",
    agentPrincipal: connection.principalLabel,
    // Deliberately NOT "owner": a connection is never a human Owner, whatever
    // the human who consented to it can do in the Admin.
    role: "agent-connection",
  }) as unknown as TypedUser;

/**
 * Checks a verified token against its connection. Every mismatch is a refusal
 * with its own code, because "why was this refused" is the first question a
 * connection diagnostic has to answer.
 *
 * Expects an ALREADY-PARSED grant: the `verifiedGrantSchema` parse lives in
 * `connectionAuth`, so this function does not re-validate its own input. It is
 * exported for tests that construct grants deliberately; a production caller
 * that has not parsed first is handing it untrusted data.
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

/**
 * Builds the plugin's `overrideAuth`. Legacy API-key callers are untouched:
 * a request with no bearer, or a bearer that is not one of ours, goes to the
 * plugin's own resolver exactly as before.
 */
export const connectionAuth =
  (dependencies: ConnectionAuthDependencies) =>
  async (
    req: PayloadRequest,
    getDefaultMcpAccessSettings: (
      overrideApiKey?: null | string,
    ) => Promise<MCPAccessSettings>,
  ): Promise<MCPAccessSettings> => {
    const presented = bearerOf(req);
    // Not ours: the legacy editorial and Agent Administration API-key path is
    // preserved verbatim, including its own refusals.
    if (presented === null || !isConnectionToken(presented))
      return getDefaultMcpAccessSettings();

    // From here the caller has claimed to be an ArtVenn connection. There is
    // no path back to the legacy resolver, so a forged or expired connection
    // token cannot be retried as an API key.
    try {
      const verified = await dependencies.verifyAccessToken(presented);
      if (verified === null)
        throw new ConnectionAuthError("CONNECTION_TOKEN_INVALID");
      // The verifier's return is untrusted data: its fields come from a token
      // a caller supplied, and the TypeScript type is erased at runtime. Parse
      // it rather than assume it, so a malformed claim is a refusal here
      // instead of a surprise inside a comparison.
      const parsed = verifiedGrantSchema.safeParse(verified);
      if (!parsed.success)
        throw new ConnectionAuthError("CONNECTION_GRANT_MALFORMED");
      const grant = parsed.data;
      const { connection, consent } = admitGrant(
        grant,
        await dependencies.readConnection(grant.connectionId),
        {
          issuer: dependencies.issuer,
          resource: dependencies.resource,
          environment: dependencies.environment,
        },
      );
      return {
        user: connectionUser(connection),
        // Nothing but the agent tools. Collections, globals, config, jobs and
        // the auth tools stay off for a connection, whatever the plugin's
        // defaults become in a later version.
        collections: {
          create: false,
          delete: false,
          find: false,
          update: false,
        },
        globals: { find: false, update: false },
        config: { find: false, update: false },
        jobs: { create: false, run: false, update: false },
        auth: {
          auth: false,
          forgotPassword: false,
          login: false,
          resetPassword: false,
          unlock: false,
          verify: false,
        },
        "payload-mcp-tool": toolGrants(consent.presetAtConsent),
      } satisfies MCPAccessSettings;
    } catch (error) {
      // One shape out, whatever went wrong, so a probe cannot tell a bad
      // signature from a revoked connection by watching the response. The
      // specific code is recorded server-side — a store outage, a forged
      // signature and a revoked connection must be distinguishable to the
      // operator even though they are identical on the wire. Never the token.
      try {
        dependencies.recordRefusal?.(
          error instanceof ConnectionAuthError
            ? error.code
            : "CONNECTION_ERROR",
        );
      } catch {
        // A diagnostics sink that throws must not replace the refusal with its
        // own error — that is exactly the probe-distinguishable outcome the
        // single external shape exists to prevent.
      }
      throw new UnauthorizedError();
    }
  };
