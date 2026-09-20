/**
 * Agent Connections V1 (Issue #141 r15) — the identity rules two services have
 * to agree on, in the one package both already depend on.
 *
 * The Admin and the authorization service each need to know what a client id
 * is and which clients are registered. They cannot import each other, and a
 * copy on each side is not a shared rule: it is two rules that agree until the
 * day one is edited. A registry the Admin validated more loosely than the
 * provider would show the Owner one client while the provider authorized
 * another — which is exactly the disagreement a consent screen exists to
 * prevent.
 *
 * WHY HERE, and not in `@moya/contracts`: the Community V1 freeze (amendment
 * 2026-09-11, section 9) pins `packages/contracts/src/internal` to exactly
 * three subpaths, and a fourth is a policy change this task has no authority
 * to make. This package is the next-closest shared home — both consumers
 * already depend on it, and these rules bound values its own columns store
 * (`oauth_client_id` is CHECKed between 1 and 1024 characters right here).
 *
 * Carry-forward C2 from the r14 review named the move; the freeze named the
 * destination.
 *
 * Deliberately zod-free. This package has never depended on zod and there is
 * no reason a persistence package should start: the RULES live here as plain
 * predicates, and the one consumer that wants them as zod schemas builds those
 * from these predicates rather than the other way round.
 */

export class RegisteredClientError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`registered clients refused: ${code}`);
    this.name = "RegisteredClientError";
    this.code = code;
  }
}

/** Client surfaces the Owner connects from. Descriptive, never authenticated. */
export const CONNECTION_CLIENTS = Object.freeze([
  "claude",
  "codex",
  "cursor",
] as const);
export type ConnectionClient = (typeof CONNECTION_CLIENTS)[number];

export const isConnectionClient = (value: unknown): value is ConnectionClient =>
  typeof value === "string" &&
  (CONNECTION_CLIENTS as readonly string[]).includes(value);

/**
 * A client id is bounded because it is carried in a bearer claim, compared
 * against a frozen grant and written into a database column. An unbounded
 * identifier is a different problem in each of those places.
 */
export const CLIENT_ID_MAX_BYTES = 1024;

const utf8Bytes = (value: string): number =>
  new TextEncoder().encode(value).length;

/** Control characters have no place in an identifier presented as a bearer claim. */
const hasControlCharacters = (value: string): boolean =>
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point
  /[\u0000-\u001f\u007f]/u.test(value);

/** Form 1: a preregistered opaque identifier, matched exactly. */
export const isPreregisteredClientId = (value: string): boolean =>
  value.length > 0 &&
  value === value.trim() &&
  !hasControlCharacters(value) &&
  !value.includes("://") &&
  utf8Bytes(value) <= CLIENT_ID_MAX_BYTES;

/**
 * Form 2: a CIMD client id, which is a canonical HTTPS URL. No userinfo (it
 * would carry a credential), no fragment (it is not part of the identity the
 * provider recognizes), and canonical — the stored value must be exactly what
 * the provider recognized, so a non-canonical spelling is refused rather than
 * normalized into agreement.
 */
export const isCimdClientId = (value: string): boolean => {
  if (hasControlCharacters(value)) return false;
  if (utf8Bytes(value) > CLIENT_ID_MAX_BYTES) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.hash !== "") return false;
  // Canonical: what we were given must equal what the URL parser round-trips,
  // so two spellings of one URL cannot become two identities.
  return url.href === value;
};

/** The one rule: a bounded opaque identifier, or a canonical HTTPS CIMD URL. */
export const isOauthClientId = (value: unknown): value is string =>
  typeof value === "string" &&
  (isPreregisteredClientId(value) || isCimdClientId(value));

/** One registered client, as BOTH sides read it from one setting. */
export interface RegisteredClient {
  readonly clientId: string;
  readonly family: ConnectionClient;
  readonly label: string;
  /**
   * Where the provider may send this client back. The Admin never redirects
   * anywhere near it — it is validated here because this is ONE setting read
   * by both sides, and a registry validated differently on each side is a
   * registry that agrees right up until it matters.
   */
  readonly redirectUris: readonly string[];
}

/**
 * A client's redirect URIs, exactly as the provider will have to match them.
 *
 * A native client's loopback redirect is the only shape this milestone has a
 * use for, and anything else is refused rather than passed through: a redirect
 * target is where an authorization code is delivered, so a registry that
 * accepted a remote host would be the whole flow's weakest link.
 */
const parseRedirectUris = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0)
    throw new RegisteredClientError("CLIENTS_MALFORMED");
  return value.map((entry) => {
    if (typeof entry !== "string")
      throw new RegisteredClientError("CLIENTS_MALFORMED");
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new RegisteredClientError("CLIENTS_MALFORMED");
    }
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.hash !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      url.href !== entry
    )
      throw new RegisteredClientError("CLIENTS_REDIRECT_NOT_LOOPBACK");
    return entry;
  });
};

/**
 * Parses the registry, refusing anything it cannot read exactly.
 *
 * A malformed entry is a startup refusal rather than a skipped row: a registry
 * that silently dropped a client would make the Admin show nothing where the
 * provider will happily authorize something, and the Owner would be consenting
 * to a screen that had quietly omitted it.
 */
export const parseRegisteredClients = (
  value: string,
): ReadonlyMap<string, RegisteredClient> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new RegisteredClientError("CLIENTS_MALFORMED");
  }
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new RegisteredClientError("CLIENTS_REQUIRED");
  const clients = new Map<string, RegisteredClient>();
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry))
      throw new RegisteredClientError("CLIENTS_MALFORMED");
    const record = entry as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(",") !==
        "clientId,family,label,redirectUris" ||
      typeof record.label !== "string" ||
      record.label.trim() !== record.label ||
      record.label.length === 0 ||
      record.label.length > 64
    )
      throw new RegisteredClientError("CLIENTS_MALFORMED");
    const redirectUris = parseRedirectUris(record.redirectUris);
    if (!isOauthClientId(record.clientId) || !isConnectionClient(record.family))
      throw new RegisteredClientError("CLIENTS_MALFORMED");
    // Two entries for one client id is an ambiguity, not a later-wins rule.
    if (clients.has(record.clientId))
      throw new RegisteredClientError("CLIENTS_DUPLICATED");
    clients.set(record.clientId, {
      clientId: record.clientId,
      family: record.family,
      label: record.label,
      redirectUris,
    });
  }
  return clients;
};
