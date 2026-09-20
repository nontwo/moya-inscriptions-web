import {
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import {
  createAgentConnectionStore,
  createConsentStore,
} from "@moya/community-postgres";

import { ConnectionAuthority } from "./authority";
import { connectionsEnabled } from "./composition";
import { parseRegisteredClients } from "./consent";

import type { RegisteredClient } from "./consent";

import type { ConsentStore } from "@moya/community-postgres";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — the Admin's control-plane
 * composition.
 *
 * The Admin already holds a Payload pool. This is deliberately NOT that pool.
 * The control plane authenticates as its own narrowly privileged role, which
 * is the point of splitting the roles at all: the Admin's consent path may
 * record a decision and move a connection's generation, and may not mint a
 * grant, touch a token store, or create an interaction. A pool that could do
 * those would make the grant file decorative.
 *
 * A misconfiguration is a refusal at composition time, never a runtime branch
 * inside a handler: if this cannot be built, the endpoints are absent rather
 * than present-and-failing.
 */

export const CONSENT_DATABASE_SETTING = "AGENT_CONSENT_DATABASE_URL";
export const AUTHORIZATION_ISSUER_SETTING = "AGENT_AUTHORIZATION_ISSUER";
export const AUTHORIZATION_RESOURCE_SETTING = "AGENT_AUTHORIZATION_RESOURCE";
export const AUTHORIZATION_CLIENTS_SETTING = "AGENT_AUTHORIZATION_CLIENTS";

export class ConsentRuntimeError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`consent runtime refused: ${code}`);
    this.name = "ConsentRuntimeError";
    this.code = code;
  }
}

export interface ConsentRuntime {
  readonly consents: ConsentStore;
  readonly clients: ReadonlyMap<string, RegisteredClient>;
  readonly authority: ConnectionAuthority;
  readonly connections: ReturnType<typeof createAgentConnectionStore>;
  /** The frozen issuer origin. Never derived from a request. */
  readonly issuer: string;
  /** The frozen resource this Admin is the resource server for. */
  readonly resource: string;
  readonly environment: string;
  close(): Promise<void>;
}

/**
 * The exact origin/URL rules, applied once at startup rather than per request.
 *
 * An issuer with a path, query or fragment is refused rather than trimmed: a
 * silently normalized issuer is how two spellings of one audience appear, and
 * the audience is the thing a token is checked against.
 */
const frozenOrigin = (value: string, code: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConsentRuntimeError(code);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.pathname !== "/"
  )
    throw new ConsentRuntimeError(code);
  return url.origin;
};

const frozenResource = (value: string, code: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConsentRuntimeError(code);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new ConsentRuntimeError(code);
  return url.href;
};

/**
 * Builds the control plane, or refuses. Returns `null` only when the feature
 * is OFF, which is the composition gate — not a failure, and not something a
 * handler recovers from by doing less.
 */
export const createConsentRuntime = (
  environment: NodeJS.ProcessEnv = process.env,
): ConsentRuntime | null => {
  if (!connectionsEnabled(environment)) return null;

  const databaseUrl = environment[CONSENT_DATABASE_SETTING];
  if (!databaseUrl) throw new ConsentRuntimeError("CONSENT_DATABASE_REQUIRED");
  const issuer = frozenOrigin(
    environment[AUTHORIZATION_ISSUER_SETTING] ?? "",
    "ISSUER_REQUIRED",
  );
  const resource = frozenResource(
    environment[AUTHORIZATION_RESOURCE_SETTING] ?? "",
    "RESOURCE_REQUIRED",
  );
  // The issuer and the resource server are separate origins on purpose: a
  // provider sharing an origin with the Admin would share its cookie jar, and
  // the whole cross-site measurement this design rests on would be void.
  if (new URL(resource).origin === issuer)
    throw new ConsentRuntimeError("ISSUER_AND_RESOURCE_SHARE_AN_ORIGIN");

  let connectionString: URL;
  try {
    connectionString = new URL(databaseUrl);
  } catch {
    throw new ConsentRuntimeError("CONSENT_DATABASE_MALFORMED");
  }
  // Development-only surface, loopback-only database. This is not a
  // convenience: the gate above already required development, and a control
  // plane reaching a database somewhere else would be the first step of
  // exactly the exposure this milestone is fenced against.
  if (!["127.0.0.1", "localhost", "[::1]"].includes(connectionString.hostname))
    throw new ConsentRuntimeError("CONSENT_DATABASE_NOT_LOOPBACK");

  const clients = parseRegisteredClients(
    environment[AUTHORIZATION_CLIENTS_SETTING] ?? "",
  );

  const pool = createPostgresPool(
    parsePostgresConfig({
      DATABASE_URL: databaseUrl,
      DATABASE_POOL_MAX: "4",
    }),
  );
  const connections = createAgentConnectionStore({ pool });
  return {
    consents: createConsentStore({ pool }),
    clients,
    connections,
    authority: new ConnectionAuthority({ store: connections }),
    issuer,
    resource,
    environment: environment.CMS_ENVIRONMENT ?? "development",
    close: () => closePostgresPool(pool),
  };
};

/**
 * One runtime per process. Built lazily so importing this module never opens a
 * pool, and memoized so a page render and an endpoint share one.
 */
let cached: ConsentRuntime | null | undefined;

export const consentRuntime = (): ConsentRuntime | null => {
  if (cached === undefined) cached = createConsentRuntime();
  return cached;
};

/** Testing seam. Never called by the composition root. */
export const resetConsentRuntime = (): void => {
  cached = undefined;
};
