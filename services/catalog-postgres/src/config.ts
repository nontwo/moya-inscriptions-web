import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { checkServerIdentity, createSecureContext } from "node:tls";

export type PostgresEnvironment = Readonly<Record<string, string | undefined>>;

export interface PostgresConfig {
  readonly connectionString: string;
  readonly connectionTimeoutMillis: number;
  readonly max: number;
  readonly idleTimeoutMillis: number;
  readonly ssl:
    | false
    | {
        readonly rejectUnauthorized: true;
        readonly ca?: string;
        readonly checkServerIdentity?: typeof checkServerIdentity;
      };
}

const connectionTimeoutMillis = 5_000;

const positiveInteger = (
  value: string | undefined,
  name: string,
  fallback: number,
): number => {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`${name} must be a positive safe integer`);
  return Number(value);
};

const verifiedTLS = (
  url: URL,
  caFile: string | undefined,
): PostgresConfig["ssl"] => {
  const modes = url.searchParams.getAll("sslmode");
  if (
    modes.length > 1 ||
    [...url.searchParams.keys()].some(
      (key) =>
        key !== "sslmode" && (/^ssl/i.test(key) || key === "uselibpqcompat"),
    )
  )
    throw new Error("Invalid PostgreSQL TLS configuration");
  const mode = modes[0];
  if (
    mode !== undefined &&
    !["disable", "require", "verify-ca", "verify-full"].includes(mode)
  )
    throw new Error("PostgreSQL TLS must verify the certificate authority");
  if (mode === "disable" && caFile !== undefined)
    throw new Error("PostgreSQL TLS CA conflicts with disabled TLS");
  if (caFile === undefined && (mode === undefined || mode === "disable"))
    return false;
  if (caFile === undefined) return { rejectUnauthorized: true };
  try {
    if (!caFile.trim()) throw new Error();
    const ca = readFileSync(caFile, "utf8");
    // Reject empty/invalid trust material now, without opening a connection.
    if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error();
    createSecureContext({ ca });
    return { rejectUnauthorized: true, ca };
  } catch {
    throw new Error("Invalid PostgreSQL TLS CA file");
  }
};

export const parsePostgresConfig = (
  environment: PostgresEnvironment,
): PostgresConfig => {
  const value = environment.DATABASE_URL;
  if (value === undefined || value === "") {
    throw new Error("DATABASE_URL is required");
  }
  if (value.trim() !== value || /\s/.test(value)) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    url.hostname === "" ||
    url.username === "" ||
    url.pathname.length <= 1
  ) {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }

  const verified = verifiedTLS(url, environment.DATABASE_SSL_CA_FILE);
  const hostname = url.hostname.startsWith("[")
    ? url.hostname.slice(1, -1)
    : url.hostname;
  // pg omits SNI for a literal IP and Node otherwise falls back to localhost.
  // Keep CA verification and bind only this identity check to the URL's IP SAN.
  const ssl: PostgresConfig["ssl"] =
    verified && isIP(hostname)
      ? {
          ...verified,
          checkServerIdentity: (_defaultName, certificate) => {
            const error = checkServerIdentity(hostname, certificate);
            // Some Node 24 minors apply domainToASCII to IPv6, which produces
            // an empty DNS name. OpenSSL's native IP SAN check remains exact.
            if (error && isIP(hostname) === 6) {
              try {
                if (new X509Certificate(certificate.raw).checkIP(hostname))
                  return undefined;
              } catch {
                // Missing/malformed peer DER must retain the verification error.
              }
            }
            return error;
          },
        }
      : verified;
  // pg's URL parser replaces the explicit ssl object when URL SSL options are
  // present. Strip the validated mode so certificate verification stays final.
  url.searchParams.delete("sslmode");
  return Object.freeze({
    connectionString: url.toString(),
    connectionTimeoutMillis,
    max: positiveInteger(environment.DATABASE_POOL_MAX, "DATABASE_POOL_MAX", 5),
    idleTimeoutMillis: positiveInteger(
      environment.DATABASE_IDLE_TIMEOUT_MS,
      "DATABASE_IDLE_TIMEOUT_MS",
      10_000,
    ),
    ssl,
  });
};
