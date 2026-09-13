import process from "node:process";
import console from "node:console";
import { pathToFileURL } from "node:url";
import { assertSyntheticTestDatabaseUrl } from "../tests/integration/postgres/synthetic-test-database.ts";
import {
  assertDisposableTestTarget,
  databaseNameFromUrl,
  disposableTestTargetProbeSql,
  markCurrentDatabaseDisposableSql,
  remedyFor,
} from "./disposable-test-target.mjs";

/**
 * Static checks that need no connection: the variable exists, the URL names a
 * synthetic database by the suite rule and the host is loopback. Throws a
 * category string; the caller decides how to report it.
 */
export function staticTargetCheck(variable, environment = process.env) {
  if (typeof variable !== "string" || !/^[A-Z][A-Z0-9_]*$/u.test(variable))
    throw new Error("USAGE");
  const value = environment[variable];
  if (value === undefined || value === "") throw new Error("VARIABLE_MISSING");
  const target = databaseNameFromUrl(value);
  try {
    assertSyntheticTestDatabaseUrl(value, variable);
  } catch (error) {
    throw new Error(
      /refused by name/u.test(error?.message ?? "")
        ? "REFUSED_TEST_DATABASE_NAME"
        : "SYNTHETIC_DATABASE_NAME_REQUIRED",
      { cause: error },
    );
  }
  if (!target.loopback) throw new Error("LOOPBACK_REQUIRED");
  return { variable, value, database: target.name };
}

/** Connects with the already built shared adapter; the caller closes nothing. */
async function withPool(value, run) {
  let dist;
  try {
    dist = await import("../services/catalog-postgres/dist/index.js");
  } catch {
    throw new Error("DISPOSABLE_TARGET_PROBE_FAILED");
  }
  const pool = dist.createPostgresPool(
    dist.parsePostgresConfig({ DATABASE_URL: value, DATABASE_POOL_MAX: "1" }),
  );
  try {
    return await run((sql) => pool.query(sql));
  } finally {
    await dist.closePostgresPool(pool);
  }
}

export async function checkTarget(variable, environment = process.env, query) {
  const target = staticTargetCheck(variable, environment);
  const probe = async (run) => {
    let result;
    try {
      result = await run(disposableTestTargetProbeSql);
    } catch {
      throw new Error("DISPOSABLE_TARGET_PROBE_FAILED");
    }
    return assertDisposableTestTarget(result.rows, target.database);
  };
  const database = query
    ? await probe(query)
    : await withPool(target.value, probe);
  return { variable, database, result: "PASS" };
}

export async function markTarget(
  variable,
  args,
  environment = process.env,
  query,
) {
  if (!args.includes("--yes")) throw new Error("CONFIRMATION_REQUIRED");
  const target = staticTargetCheck(variable, environment);
  const mark = async (run) => {
    try {
      await run(markCurrentDatabaseDisposableSql);
    } catch {
      throw new Error("MARK_FAILED");
    }
    const result = await run(disposableTestTargetProbeSql);
    return assertDisposableTestTarget(result.rows, target.database);
  };
  const database = query
    ? await mark(query)
    : await withPool(target.value, mark);
  return { variable, database, result: "MARKED" };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, variable, ...rest] = process.argv.slice(2);
  try {
    if (!["check", "mark"].includes(command) || !variable)
      throw new Error("USAGE");
    if (rest.some((arg) => arg !== "--yes")) throw new Error("USAGE");
    const outcome =
      command === "check"
        ? await checkTarget(variable)
        : await markTarget(variable, rest);
    console.log(JSON.stringify(outcome));
  } catch (error) {
    const category =
      error instanceof Error && /^[A-Z_]+$/u.test(error.message)
        ? error.message
        : "TEST_TARGET_CHECK_FAILED";
    // Never print the URL: it can carry a password.
    console.error(
      JSON.stringify({
        variable: variable ?? null,
        result: "REFUSED",
        category,
        remedy:
          category === "USAGE"
            ? "Usage: node scripts/test-target.mjs check <VARIABLE> | mark <VARIABLE> --yes"
            : remedyFor(category),
      }),
    );
    process.exitCode = 1;
  }
}
