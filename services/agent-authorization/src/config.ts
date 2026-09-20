/**
 * Agent Connections V1 (Issue #141 r15 §5) — what the authorization service
 * refuses to start without.
 *
 * Every value here is read once, at startup, and validated before anything
 * listens. There are no defaults for anything that decides authority: a
 * service that invents an issuer, a resource or a sealing key would be
 * authorising against values nobody chose.
 *
 * The composition gate is Development AND an explicit opt-in, the same shape
 * `connectionsEnabled` uses in the Admin, and for the same reason: a
 * Development default that switches itself on is how a Development-only
 * surface ends up somewhere else.
 */

export class AuthorizationConfigError extends Error {
  readonly code: string;
  constructor(code: string, detail: string) {
    super(`agent authorization configuration refused: ${code} (${detail})`);
    this.name = "AuthorizationConfigError";
    this.code = code;
  }
}

export const AUTHORIZATION_ENABLED_SETTING = "AGENT_AUTHORIZATION_ENABLED";

export interface AuthorizationConfig {
  /** The canonical issuer. Must be an exact origin with no path. */
  readonly issuer: string;
  /** The RFC 8707 resource indicator this provider mints tokens for. */
  readonly resource: string;
  /** Where the Owner consents, on a DIFFERENT host from the issuer. */
  readonly consentBaseUrl: string;
  readonly host: string;
  readonly port: number;
  /** The one registered client this milestone admits. */
  readonly clientId: string;
  readonly redirectUri: string;
  readonly environment: string;
  readonly databaseUrl: string;
}

const origin = (raw: string | undefined, name: string): URL => {
  if (raw === undefined || raw === "")
    throw new AuthorizationConfigError("REQUIRED", name);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AuthorizationConfigError("NOT_A_URL", name);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new AuthorizationConfigError("NOT_HTTP", name);
  if (url.username !== "" || url.password !== "")
    throw new AuthorizationConfigError("USERINFO_NOT_ALLOWED", name);
  if (url.hash !== "") throw new AuthorizationConfigError("FRAGMENT", name);
  return url;
};

const required = (raw: string | undefined, name: string): string => {
  if (raw === undefined || raw === "")
    throw new AuthorizationConfigError("REQUIRED", name);
  return raw;
};

/**
 * Development AND an explicit opt-in. Both, never either.
 */
export const authorizationEnabled = (
  environment: NodeJS.ProcessEnv = process.env,
): boolean =>
  environment.NODE_ENV === "development" &&
  environment[AUTHORIZATION_ENABLED_SETTING] === "true";

export const authorizationConfigFrom = (
  environment: NodeJS.ProcessEnv,
): AuthorizationConfig => {
  const issuer = origin(
    environment.AGENT_AUTHORIZATION_ISSUER,
    "AGENT_AUTHORIZATION_ISSUER",
  );
  // An issuer with a path is a different issuer from the one a token will
  // claim, and the mismatch surfaces only when a client refuses a token that
  // looks correct. Refusing here is cheaper than discovering it there.
  if (issuer.pathname !== "/")
    throw new AuthorizationConfigError(
      "ISSUER_MUST_BE_ORIGIN",
      "AGENT_AUTHORIZATION_ISSUER",
    );

  const resource = origin(
    environment.AGENT_AUTHORIZATION_RESOURCE,
    "AGENT_AUTHORIZATION_RESOURCE",
  );
  const consent = origin(
    environment.AGENT_AUTHORIZATION_CONSENT_URL,
    "AGENT_AUTHORIZATION_CONSENT_URL",
  );

  // The cookie boundary this design rests on. r12 recorded that cookies are
  // host-scoped and not port-scoped, so an issuer and a consent page sharing a
  // host would share a cookie jar however different their ports look. This is
  // the one check that makes the separation real rather than decorative.
  if (issuer.hostname === consent.hostname)
    throw new AuthorizationConfigError(
      "ISSUER_AND_CONSENT_SHARE_A_HOST",
      `${issuer.hostname}`,
    );

  const redirect = origin(
    environment.AGENT_AUTHORIZATION_REDIRECT_URI,
    "AGENT_AUTHORIZATION_REDIRECT_URI",
  );

  const port = Number(
    required(environment.AGENT_AUTHORIZATION_PORT, "AGENT_AUTHORIZATION_PORT"),
  );
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    throw new AuthorizationConfigError(
      "NOT_A_PORT",
      "AGENT_AUTHORIZATION_PORT",
    );
  if (issuer.port !== "" && Number(issuer.port) !== port)
    throw new AuthorizationConfigError(
      "ISSUER_PORT_DISAGREES_WITH_LISTENER",
      `${issuer.port} vs ${port}`,
    );

  return {
    issuer: issuer.origin,
    resource: resource.href,
    consentBaseUrl: consent.origin,
    // Loopback only. This service has no authorization to listen anywhere a
    // network can reach, and binding is where that is enforced rather than
    // assumed.
    host: "127.0.0.1",
    port,
    clientId: required(
      environment.AGENT_AUTHORIZATION_CLIENT_ID,
      "AGENT_AUTHORIZATION_CLIENT_ID",
    ),
    redirectUri: redirect.href,
    environment: required(
      environment.AGENT_AUTHORIZATION_ENVIRONMENT,
      "AGENT_AUTHORIZATION_ENVIRONMENT",
    ),
    databaseUrl: required(
      environment.AGENT_AUTHORIZATION_DATABASE_URL,
      "AGENT_AUTHORIZATION_DATABASE_URL",
    ),
  };
};
