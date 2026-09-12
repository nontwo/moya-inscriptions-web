/**
 * Guard for the PostgreSQL integration suites' database target.
 *
 * Every suite under tests/integration/postgres DELETEs, TRUNCATEs or drops
 * schemas in whatever database TEST_DATABASE_URL names. On 2026-09-12 the
 * suite was pointed at the live local Development database `yoyi_dev` by
 * mistake and the Owner's Development comment, audit and session rows were
 * lost. Each suite therefore calls this guard before it creates a pool, so a
 * wrong URL fails at collection time instead of after the first DELETE.
 *
 * The functions are pure over the URL string and need no database.
 */

/** The disposable database named by infra/env/test.env.example. */
export const SYNTHETIC_TEST_DATABASE_NAME = "moya_synthetic_test";

/**
 * Any other database qualifies only when a whole underscore-separated segment
 * of its name is `test` or `synthetic`: `moya_test` (CI), `moya_synthetic_test`
 * or `p204_cms_synthetic_test`, but not `testing`, `moya_tests` or `cms_qa`.
 */
export const SYNTHETIC_TEST_DATABASE_NAME_PATTERN =
  /(^|_)(test|synthetic)(_|$)/i;

/** Refused by name, whatever the pattern says. */
export const REFUSED_TEST_DATABASE_NAMES: readonly string[] = ["yoyi_dev"];

const remedy = (variable: string): string =>
  `The PostgreSQL suites DELETE and TRUNCATE rows in their target. Point ${variable} at a disposable synthetic database such as "${SYNTHETIC_TEST_DATABASE_NAME}" (see infra/env/test.env.example) or one whose name has a whole "_test" or "_synthetic" segment, for example "moya_test".`;

export const isSyntheticTestDatabaseName = (name: string): boolean =>
  !REFUSED_TEST_DATABASE_NAMES.includes(name.toLowerCase()) &&
  !name.includes("/") &&
  (name === SYNTHETIC_TEST_DATABASE_NAME ||
    SYNTHETIC_TEST_DATABASE_NAME_PATTERN.test(name));

/**
 * Parses a PostgreSQL URL and returns the database it names, or throws an
 * actionable error when that database is not a disposable synthetic one.
 * The name is read the way node-postgres reads it: the URL pathname without
 * its leading slash, URI-decoded.
 */
export const assertSyntheticTestDatabaseUrl = (
  value: string,
  variable = "TEST_DATABASE_URL",
): string => {
  let name: string;
  try {
    name = decodeURI(new URL(value).pathname.slice(1));
  } catch {
    throw new Error(
      `${variable} must be a PostgreSQL URL naming a disposable synthetic database, for example postgresql://role@127.0.0.1:54329/${SYNTHETIC_TEST_DATABASE_NAME}. ${remedy(variable)}`,
    );
  }
  if (name === "") {
    throw new Error(`${variable} names no database. ${remedy(variable)}`);
  }
  if (REFUSED_TEST_DATABASE_NAMES.includes(name.toLowerCase())) {
    throw new Error(
      `${variable} points at "${name}", the live local Development database, which is refused by name. ${remedy(variable)}`,
    );
  }
  if (!isSyntheticTestDatabaseName(name)) {
    throw new Error(
      `${variable} points at database "${name}", whose name carries no whole "test" or "synthetic" segment. ${remedy(variable)}`,
    );
  }
  return name;
};

/**
 * Reads TEST_DATABASE_URL, keeps the suites' existing missing-variable error
 * and returns the URL only after the database name has passed the guard.
 */
export const requireSyntheticTestDatabaseUrl = (
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string => {
  const value = environment.TEST_DATABASE_URL;
  if (value === undefined) {
    throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests");
  }
  assertSyntheticTestDatabaseUrl(value);
  return value;
};
