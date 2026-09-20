import {
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import {
  createAgentConnectionStore,
  createWrapperStore,
  wrapperKeysFrom,
} from "@moya/community-postgres";

import { connectionsEnabled } from "./composition";

import type { ConnectionAuthDependencies } from "./authorization";
import type { ConnectionRecord, VerifiedGrant } from "./contracts";

/**
 * Agent Connections V1 (Issue #141 r15 §7) — the RESOURCE server's half.
 *
 * This is the third pool and the third role, and the separation is the point:
 *
 *   provider role        mints tokens, owns the protocol's storage.
 *   consent role         records decisions, moves a connection's generation.
 *   resource role        may only READ a connection, its grant and a wrapper.
 *
 * The resource server authenticates requests and decides nothing about
 * authority. The runtime grant plan gives its role SELECT on those three
 * tables and one column of UPDATE (`last_verified_at`), so an injection on
 * this path reaches a role that cannot mint, cannot consent and cannot
 * revoke. (Named in prose rather than by filename: an Admin source file
 * carrying a direct data-file reference is itself a boundary violation, and
 * the architecture test is right to say so.)
 *
 * WHAT VERIFICATION MEANS HERE, stated exactly, because the honest boundary is
 * narrower than "the provider says yes":
 *
 *   * the presented value must resolve to a wrapper row, which requires the
 *     index key — a guessed or foreign token finds nothing;
 *   * the sealed provider identifier must OPEN, and its authenticated data
 *     binds the format version, the lookup digest, the grant, the connection
 *     and the generation. An edited grant_id, connection_id or generation
 *     fails the tag check and the row simply will not open;
 *   * the wrapper must not be expired or invalidated;
 *   * the frozen grant must exist, and every identity claim is read from IT.
 *
 * What it does NOT do, and must not be described as doing: it does not ask the
 * authorization service whether the underlying provider token still exists.
 * Those are separate processes with separate roles, and this one has no read
 * on the provider's token store by design. A provider-side revocation reaches
 * this boundary when the grant destroyer invalidates the wrappers, which is
 * what a disconnect runs — not instantly by lookup.
 */

export const RESOURCE_DATABASE_SETTING = "AGENT_RESOURCE_DATABASE_URL";

export class ResourceRuntimeError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`agent resource runtime refused: ${code}`);
    this.name = "ResourceRuntimeError";
    this.code = code;
  }
}

export interface ResourceRuntime extends ConnectionAuthDependencies {
  close(): Promise<void>;
}

const frozen = (value: string | undefined, code: string): URL => {
  if (!value) throw new ResourceRuntimeError(code);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ResourceRuntimeError(code);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new ResourceRuntimeError(code);
  return url;
};

/**
 * Builds the resource-server boundary, or refuses. `null` only when the
 * connection surface is OFF — which is the composition gate, not a failure.
 */
export const createResourceRuntime = (
  environment: NodeJS.ProcessEnv = process.env,
): ResourceRuntime | null => {
  if (!connectionsEnabled(environment)) return null;

  const databaseUrl = environment[RESOURCE_DATABASE_SETTING];
  if (!databaseUrl)
    throw new ResourceRuntimeError("RESOURCE_DATABASE_REQUIRED");
  let connectionString: URL;
  try {
    connectionString = new URL(databaseUrl);
  } catch {
    throw new ResourceRuntimeError("RESOURCE_DATABASE_MALFORMED");
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(connectionString.hostname))
    throw new ResourceRuntimeError("RESOURCE_DATABASE_NOT_LOOPBACK");

  const issuer = frozen(
    environment.AGENT_AUTHORIZATION_ISSUER,
    "ISSUER_REQUIRED",
  );
  if (issuer.pathname !== "/")
    throw new ResourceRuntimeError("ISSUER_MUST_BE_ORIGIN");
  const resource = frozen(
    environment.AGENT_AUTHORIZATION_RESOURCE,
    "RESOURCE_REQUIRED",
  );

  // A missing key is a startup refusal, never a silently generated one: a new
  // key would make every previously sealed wrapper unreadable, which looks
  // exactly like every connection being revoked at once.
  const keys = wrapperKeysFrom(environment);

  const pool = createPostgresPool(
    parsePostgresConfig({ DATABASE_URL: databaseUrl, DATABASE_POOL_MAX: "4" }),
  );
  const connections = createAgentConnectionStore({ pool });
  const wrappers = createWrapperStore({ pool, keys });

  const verifyAccessToken = async (
    presented: string,
  ): Promise<VerifiedGrant | null> => {
    const wrapper = await wrappers.resolve(presented);
    if (wrapper === undefined) return null;
    if (wrapper.invalidatedAt !== null) return null;
    // Carried through to `admitGrant`, which checks it again against its own
    // clock. Checked here too so an expired wrapper never reaches a lookup.
    if (Date.parse(wrapper.expiresAt) <= Date.now()) return null;

    const grant = await connections.readGrant(wrapper.grantId);
    if (grant === null) return null;
    // The wrapper's own authenticated data already binds these, so a
    // disagreement here means the two rows were written apart rather than
    // edited — still a refusal, and never a reconciliation.
    if (
      grant.connectionId !== wrapper.connectionId ||
      grant.generationAtConsent !== wrapper.generation
    )
      return null;

    // Every identity claim comes from the FROZEN grant. Nothing is read from
    // the presented value, and nothing is read from the connection's mutable
    // columns — which is the r14 defect (`readForAuthorization` once let the
    // connection's current identity overwrite the grant's frozen one).
    return {
      connectionId: grant.connectionId,
      subject: grant.humanSubject,
      clientId: grant.oauthClientId,
      resource: grant.resource,
      issuer: grant.issuer,
      scopes: [...grant.capabilityScopes],
      generation: grant.generationAtConsent,
      expiresAt: wrapper.expiresAt,
    };
  };

  const readConnection = async (
    connectionId: string,
  ): Promise<ConnectionRecord | null> => {
    const stored = await connections.readForAuthorization(connectionId);
    if (stored === null) return null;
    return {
      connection: stored.connection,
      grant: stored.grant,
    } as ConnectionRecord;
  };

  return {
    verifyAccessToken,
    readConnection,
    issuer: issuer.origin,
    resource: resource.href,
    environment: environment.CMS_ENVIRONMENT ?? "development",
    // The boundary answers one shape on the wire whatever went wrong, so an
    // operator has no way to tell a store outage from a forged signature from
    // a revoked connection unless the code is recorded HERE. Nothing was
    // recording it: `connectionAuth` has always called `recordRefusal`, and
    // the composition root never supplied one. A bare code, never a token.
    recordRefusal: (code: string) =>
      process.stderr.write(`agent-connection refused: ${code}\n`),
    // The one column this role may write, and until r15 nothing wrote it:
    // the page's "last observed authenticated request" was permanently empty
    // and the grant for it was dead. Fire-and-forget, and never before
    // admission -- an observation must not claim a request that was refused.
    recordVerified: (connectionId: string) => {
      void connections.markVerified(connectionId).catch(() => {
        process.stderr.write("agent-connection observation not recorded\n");
      });
    },
    close: () => closePostgresPool(pool),
  };
};

/** One runtime per process, built lazily so importing never opens a pool. */
let cached: ResourceRuntime | null | undefined;

export const resourceRuntime = (): ResourceRuntime | null => {
  if (cached === undefined) cached = createResourceRuntime();
  return cached;
};

/** Testing seam. Never called by the composition root. */
export const resetResourceRuntime = (): void => {
  cached = undefined;
};

/**
 * What `mcp.ts` passes to `connectionOverrideAuth`.
 *
 * `null` is the CLOSED DOOR: a request presenting a connection token is
 * refused outright rather than falling through to the API-key resolver.
 * Wiring the real boundary did not remove that door; it gave it a hinge.
 *
 * A REFUSAL HERE MUST NOT TAKE DOWN THE ADMIN. This is called inside
 * `buildConfig`, during module evaluation of the Payload config, so a thrown
 * `ResourceRuntimeError` — a missing wrapper key, say — would stop editorial,
 * media, community and every legacy API-key caller from starting at all.
 * `connectionOverrideAuth(null)` could never do that, and an independent
 * review pointed out that wiring it had quietly introduced the possibility
 * while a comment still promised legacy callers were unaffected.
 *
 * So a misconfiguration fails CLOSED and LOUD rather than fatal: the
 * connection surface is absent, connection tokens are refused, everything
 * else starts, and the operator gets a bare code on stderr. Silence would be
 * the wrong trade in the other direction.
 */
export const connectionAuthDependencies = (
  report: (code: string) => void = (code) =>
    process.stderr.write(`agent-connections composition refused: ${code}\n`),
): ConnectionAuthDependencies | null => {
  try {
    return resourceRuntime();
  } catch (error) {
    report(
      error instanceof ResourceRuntimeError
        ? error.code
        : "RESOURCE_UNAVAILABLE",
    );
    return null;
  }
};
