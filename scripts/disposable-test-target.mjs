/**
 * Explicit identification of disposable test databases.
 *
 * The PostgreSQL suites already refuse a TEST_DATABASE_URL whose database name
 * carries no whole "test" or "synthetic" segment
 * (tests/integration/postgres/synthetic-test-database.ts). A name is only a
 * convention: a variable called TEST_DATABASE_URL, a loopback host or a
 * familiar name proves nothing about what the database holds. Preparation
 * entry points (`node scripts/verify.mjs test`, `pnpm db:migrate` under that
 * entry, `pnpm test:cms`) therefore also require the target itself to carry a
 * database-level marker that an operator or the disposable container set on
 * purpose. The marker lives in the PostgreSQL database comment, so it survives
 * TRUNCATE/DELETE, never travels with a URL and never appears in a dump of the
 * schema's rows.
 *
 * Every function here is pure over strings and query rows. Connections are the
 * caller's concern; see scripts/test-target.mjs for the command entry.
 */

import { URL } from "node:url";

export const DISPOSABLE_TEST_TARGET_MARKER = "yoyi-disposable-test-target";

/** The one environment key that makes scripts/migrate.mjs require the marker. */
export const DISPOSABLE_TARGET_VARIABLE = "MOYA_EXPECT_DISPOSABLE_TARGET";

/** Refused by name whatever a marker says; mirrors the suite guard. */
export const REFUSED_DATABASE_NAMES = Object.freeze(["yoyi_dev"]);

/** Reads the connected database's own name and comment; no writes. */
export const disposableTestTargetProbeSql = `SELECT current_database() AS database,
  shobj_description(d.oid, 'pg_database') AS comment
FROM pg_database d WHERE d.datname = current_database()`;

/**
 * Marks the CURRENT database as disposable. The block re-checks the name so a
 * misdirected psql session cannot mark the live Development database.
 */
export const markCurrentDatabaseDisposableSql = `DO $$
BEGIN
  IF lower(current_database()) IN ('yoyi_dev') THEN
    RAISE EXCEPTION 'yoyi_dev is the live local Development database and is never a disposable test target';
  END IF;
  IF current_database() !~* '(^|_)(test|synthetic)(_|$)' THEN
    RAISE EXCEPTION 'database % carries no whole "test" or "synthetic" name segment; refusing to mark it disposable', current_database();
  END IF;
  EXECUTE format('COMMENT ON DATABASE %I IS %L', current_database(), '${DISPOSABLE_TEST_TARGET_MARKER}');
END $$;`;

export const isLoopbackHostname = (hostname) =>
  ["127.0.0.1", "localhost", "[::1]"].includes(hostname);

/** The database a PostgreSQL URL names, read the way node-postgres reads it. */
export function databaseNameFromUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("INVALID_DATABASE_URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("INVALID_DATABASE_URL");
  const name = decodeURIComponent(url.pathname.slice(1));
  if (name === "" || name.includes("/"))
    throw new Error("DATABASE_NAME_MISSING");
  return {
    name,
    hostname: url.hostname,
    loopback: isLoopbackHostname(url.hostname),
  };
}

/**
 * Accepts the probe rows only when exactly one row names the expected
 * database, that name is not refused, and the comment is the marker.
 */
export function assertDisposableTestTarget(rows, expectedDatabase) {
  if (typeof expectedDatabase !== "string" || expectedDatabase === "")
    throw new Error("DATABASE_NAME_MISSING");
  if (REFUSED_DATABASE_NAMES.includes(expectedDatabase.toLowerCase()))
    throw new Error("REFUSED_TEST_DATABASE_NAME");
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : undefined;
  if (!row || typeof row.database !== "string")
    throw new Error("DISPOSABLE_TARGET_PROBE_FAILED");
  if (row.database !== expectedDatabase)
    throw new Error("CONNECTED_DATABASE_MISMATCH");
  if (REFUSED_DATABASE_NAMES.includes(row.database.toLowerCase()))
    throw new Error("REFUSED_TEST_DATABASE_NAME");
  if (row.comment !== DISPOSABLE_TEST_TARGET_MARKER)
    throw new Error("DISPOSABLE_TEST_TARGET_REQUIRED");
  return row.database;
}

export const disposableTargetRequired = (environment) =>
  environment?.[DISPOSABLE_TARGET_VARIABLE] === "1";

/** The categories these checks raise; anything else is a probe failure. */
export const TARGET_CATEGORIES = Object.freeze([
  "INVALID_DATABASE_URL",
  "DATABASE_NAME_MISSING",
  "REFUSED_TEST_DATABASE_NAME",
  "SYNTHETIC_DATABASE_NAME_REQUIRED",
  "LOOPBACK_REQUIRED",
  "DISPOSABLE_TARGET_PROBE_FAILED",
  "CONNECTED_DATABASE_MISMATCH",
  "DISPOSABLE_TEST_TARGET_REQUIRED",
]);

export const isTargetCategory = (message) =>
  typeof message === "string" && TARGET_CATEGORIES.includes(message);

/** One remedy sentence per category; never echoes a connection string. */
export const remedyFor = (category) =>
  ({
    INVALID_DATABASE_URL:
      "Set the variable to a PostgreSQL URL naming a disposable synthetic database.",
    DATABASE_NAME_MISSING: "The URL names no database.",
    REFUSED_TEST_DATABASE_NAME:
      "That database is the live local Development database and is refused by name.",
    SYNTHETIC_DATABASE_NAME_REQUIRED:
      'Use a database whose name is moya_synthetic_test or carries a whole "test" or "synthetic" segment.',
    LOOPBACK_REQUIRED:
      "Point the variable at a loopback host; remote targets need their own explicit synthetic preflight.",
    DISPOSABLE_TARGET_PROBE_FAILED:
      "The target did not answer the read-only probe; check that the database is reachable and the shared packages are built.",
    CONNECTED_DATABASE_MISMATCH:
      "The connected database differs from the one the URL names; do not proceed.",
    DISPOSABLE_TEST_TARGET_REQUIRED: `The database carries no "${DISPOSABLE_TEST_TARGET_MARKER}" comment. Use the compose.postgres.yml container (its init script marks it) or mark a database you know is disposable with: node scripts/test-target.mjs mark <VARIABLE> --yes`,
  })[category] ?? "Test preparation refused the target.";
