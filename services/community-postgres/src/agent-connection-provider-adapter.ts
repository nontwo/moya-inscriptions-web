import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { Pool } from "pg";

/**
 * Agent Connections V1 (Issue #141 r13): the `oidc-provider@9.12.2` adapter.
 *
 * Written against the contract the provider was OBSERVED to use, not against
 * documentation and not against the throwaway adapter an earlier round wrote,
 * which failed the contract while reporting a hit. The facts that shape this:
 *
 *  - Exactly six models are ever constructed under the configured feature set:
 *    Session, Interaction, AuthorizationCode, AccessToken, RefreshToken, Grant.
 *    One instance per model, cached for the provider's lifetime.
 *  - `upsert(id, payload, expiresIn)` always arrives with three arguments, and
 *    it is a genuine UPSERT: an Interaction is written twice under one id.
 *  - `payload.jti` always equals the `id` argument.
 *  - For five of the six models the id IS the credential — the interaction
 *    cookie, the authorization code, the session cookie, the access token and
 *    the refresh token are each exactly their own row key. So ids are stored
 *    as keyed digests and payloads as authenticated ciphertext.
 *  - `find` receives one argument. The provider's own `{ignoreExpiration}` is
 *    NOT forwarded, so expiry is the adapter's business.
 *  - `revokeByGrantId` is called on AuthorizationCode, AccessToken and
 *    RefreshToken — never on Grant. Grant destruction arrives as
 *    `Grant.adapter.destroy(grantId)`, directly on the adapter.
 *  - Session `destroy` must tolerate an id that is already gone: session
 *    rotation destroys the old id before saving the new one.
 *  - `findByUserCode` is never called under this configuration; it is the one
 *    method that may be a stub, and it throws rather than pretending.
 */

/** The allowlist. A new provider feature is a migration, not a new row type. */
const MODELS = [
  "Session",
  "Interaction",
  "AuthorizationCode",
  "AccessToken",
  "RefreshToken",
  "Grant",
] as const;
export type ProviderModel = (typeof MODELS)[number];

const FORMAT_VERSION = 1;

export class ProviderAdapterKeyError extends Error {
  override readonly name = "ProviderAdapterKeyError";
}

export interface ProviderAdapterKeys {
  /** Keys ids for lookup. Server-held; never derived from the id itself. */
  readonly indexKey: Buffer;
  /** Seals payloads. Server-held, versioned, outside the repository. */
  readonly sealKey: Buffer;
}

/**
 * Reads the keys from the environment. They are deliberately NOT defaulted:
 * an adapter that silently invents a key would encrypt everything under a
 * value an attacker also knows, which is worse than refusing to start.
 */
export const providerAdapterKeysFrom = (
  environment: NodeJS.ProcessEnv,
): ProviderAdapterKeys => {
  const read = (name: string): Buffer => {
    const raw = environment[name];
    if (raw === undefined || raw === "")
      throw new ProviderAdapterKeyError(`${name} is required`);
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32)
      throw new ProviderAdapterKeyError(`${name} must be 32 bytes, base64`);
    return key;
  };
  return {
    indexKey: read("AGENT_CONNECTION_PROVIDER_INDEX_KEY"),
    sealKey: read("AGENT_CONNECTION_PROVIDER_SEAL_KEY"),
  };
};

/** Domain-separated so a digest from one model cannot match another's row. */
const digestOf = (keys: ProviderAdapterKeys, model: string, value: string) =>
  createHmac("sha256", keys.indexKey)
    .update(`artvenn-agent-connection-provider-v1|${model}|${value}`)
    .digest("hex");

/**
 * The AAD binds a payload to the row it lives in. It uses the LOOKUP DIGEST
 * rather than the raw id: the digest is derived from (model, id) so it carries
 * the same anti-relocation property, and unlike the id it is available on BOTH
 * lookup paths. `find` knows the id; `findByUid` does not, and binding to the
 * id would leave a uid lookup unable to open its own row.
 */
const aadFor = (model: string, lookupDigest: string): Buffer =>
  Buffer.from(`${FORMAT_VERSION}|${model}|${lookupDigest}`);

const seal = (
  keys: ProviderAdapterKeys,
  model: string,
  lookupDigest: string,
  payload: unknown,
): Buffer => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.sealKey, nonce);
  cipher.setAAD(aadFor(model, lookupDigest));
  const body = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]);
};

const open = (
  keys: ProviderAdapterKeys,
  model: string,
  lookupDigest: string,
  sealed: Buffer,
): unknown => {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keys.sealKey,
    sealed.subarray(0, 12),
  );
  decipher.setAAD(aadFor(model, lookupDigest));
  decipher.setAuthTag(sealed.subarray(12, 28));
  const plaintext = Buffer.concat([
    decipher.update(sealed.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as unknown;
};

/** Used where a comparison happens outside an indexed lookup. */
export const digestsMatch = (a: string, b: string): boolean => {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
};

/**
 * A corrupt or tampered row is a MISS, not a throw: failing closed is what
 * keeps an altered row from being treated as authority.
 */
const unseal = (
  keys: ProviderAdapterKeys,
  model: string,
  lookupDigest: string,
  sealed: Buffer,
  consumedAt: Date | null,
): Record<string, unknown> | undefined => {
  let payload: Record<string, unknown>;
  try {
    payload = open(keys, model, lookupDigest, sealed) as Record<
      string,
      unknown
    >;
  } catch {
    return undefined;
  }
  // The provider reads `consumed` back to tell a replay from a miss.
  return consumedAt === null
    ? payload
    : { ...payload, consumed: Math.floor(consumedAt.getTime() / 1000) };
};

const TABLE = "community.agent_connection_provider_artifacts";

export interface ProviderAdapterOptions {
  readonly pool: Pick<Pool, "query">;
  readonly keys: ProviderAdapterKeys;
  readonly now?: () => Date;
}

/**
 * Builds the adapter class the provider constructs as `new Adapter(name)`.
 * The provider caches one instance per model, so per-instance state is safe.
 */
export const createProviderAdapter = (options: ProviderAdapterOptions) => {
  const { pool, keys } = options;
  const now = options.now ?? (() => new Date());

  return class ProviderArtifactAdapter {
    /** Readonly rather than private: the class is returned from a factory, and
     * TypeScript cannot emit a declaration for a private member of an
     * anonymous exported class. */
    readonly model: ProviderModel;

    constructor(name: string) {
      if (!(MODELS as readonly string[]).includes(name))
        // Refusing is the point: an unexpected model means a provider feature
        // was enabled without the migration that bounds its storage.
        throw new Error(`unsupported provider model ${name}`);
      this.model = name as ProviderModel;
    }

    async upsert(
      id: string,
      payload: Record<string, unknown>,
      expiresIn: number,
    ): Promise<void> {
      const expiresAt = new Date(now().getTime() + expiresIn * 1000);
      const uid = typeof payload.uid === "string" ? payload.uid : undefined;
      await pool.query(
        `INSERT INTO ${TABLE}
           (lookup_digest, model, sealed_payload, format_version, grant_id,
            uid_digest, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (lookup_digest) DO UPDATE SET
           sealed_payload = EXCLUDED.sealed_payload,
           format_version = EXCLUDED.format_version,
           grant_id = EXCLUDED.grant_id,
           uid_digest = EXCLUDED.uid_digest,
           expires_at = EXCLUDED.expires_at`,
        [
          digestOf(keys, this.model, id),
          this.model,
          seal(keys, this.model, digestOf(keys, this.model, id), payload),
          FORMAT_VERSION,
          typeof payload.grantId === "string" ? payload.grantId : null,
          uid === undefined || this.model !== "Session"
            ? null
            : digestOf(keys, "Session:uid", uid),
          expiresAt,
        ],
      );
    }

    /**
     * Expiry is enforced here because the provider does not forward its own
     * `{ignoreExpiration}` option to the adapter. A corrupt or unopenable row
     * is a miss, not a throw: failing closed is the behaviour that keeps a
     * tampered row from being treated as authority.
     */
    /**
     * Expiry is enforced here because the provider does not forward its own
     * `{ignoreExpiration}` option to the adapter.
     */
    async find(id: string): Promise<Record<string, unknown> | undefined> {
      const digest = digestOf(keys, this.model, id);
      const { rows } = await pool.query(
        `SELECT sealed_payload, consumed_at, expires_at FROM ${TABLE}
          WHERE lookup_digest=$1 AND model=$2`,
        [digest, this.model],
      );
      const row = rows[0] as
        | { sealed_payload: Buffer; consumed_at: Date | null; expires_at: Date }
        | undefined;
      if (row === undefined) return undefined;
      if (row.expires_at.getTime() <= now().getTime()) return undefined;
      return unseal(
        keys,
        this.model,
        digest,
        row.sealed_payload,
        row.consumed_at,
      );
    }

    /** Session only. The uid is a second identifier the provider looks up by. */
    async findByUid(uid: string): Promise<Record<string, unknown> | undefined> {
      const { rows } = await pool.query(
        `SELECT lookup_digest, sealed_payload, consumed_at, expires_at
           FROM ${TABLE} WHERE uid_digest=$1 AND model='Session'`,
        [digestOf(keys, "Session:uid", uid)],
      );
      const row = rows[0] as
        | {
            lookup_digest: string;
            sealed_payload: Buffer;
            consumed_at: Date | null;
            expires_at: Date;
          }
        | undefined;
      if (row === undefined) return undefined;
      if (row.expires_at.getTime() <= now().getTime()) return undefined;
      return unseal(
        keys,
        this.model,
        row.lookup_digest,
        row.sealed_payload,
        row.consumed_at,
      );
    }

    /** Atomic: the row is marked consumed in one statement, never read-modify-write. */
    async consume(id: string): Promise<void> {
      await pool.query(
        `UPDATE ${TABLE} SET consumed_at=$3
          WHERE lookup_digest=$1 AND model=$2 AND consumed_at IS NULL`,
        [digestOf(keys, this.model, id), this.model, now()],
      );
    }

    /** Tolerates an id that is already gone: session rotation destroys first. */
    async destroy(id: string): Promise<void> {
      await pool.query(
        `DELETE FROM ${TABLE} WHERE lookup_digest=$1 AND model=$2`,
        [digestOf(keys, this.model, id), this.model],
      );
    }

    /**
     * Called on AuthorizationCode, AccessToken and RefreshToken. Idempotent by
     * construction — a second sweep deletes nothing and creates no authority.
     */
    async revokeByGrantId(grantId: string): Promise<void> {
      await pool.query(`DELETE FROM ${TABLE} WHERE grant_id=$1 AND model=$2`, [
        grantId,
        this.model,
      ]);
    }

    /** Never called under this configuration. It refuses rather than pretending. */
    async findByUserCode(): Promise<never> {
      throw new Error(
        "findByUserCode is not supported: the device grant is not enabled",
      );
    }
  };
};
