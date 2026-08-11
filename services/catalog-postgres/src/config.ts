export type PostgresEnvironment = Readonly<Record<string, string | undefined>>;

export interface PostgresConfig {
  readonly connectionString: string;
  readonly connectionTimeoutMillis: number;
}

const connectionTimeoutMillis = 5_000;

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

  return Object.freeze({
    connectionString: value,
    connectionTimeoutMillis,
  });
};
