import process from "node:process";
import console from "node:console";
import { spawn } from "node:child_process";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Select exactly one immutable schema family; never infer from a URL. */
export function migrationPlan(environment, args = []) {
  const source = environment.MOYA_CONTENT_SOURCE;
  if (source !== "legacy" && source !== "payload")
    throw new Error(
      "MOYA_CONTENT_SOURCE must explicitly select legacy or payload",
    );
  if (
    args.some(
      (arg) =>
        !["--development", "--expect=legacy", "--expect=payload"].includes(arg),
    )
  )
    throw new Error("Unsupported migration argument");
  if (
    args.some(
      (arg) => arg.startsWith("--expect=") && arg !== `--expect=${source}`,
    )
  )
    throw new Error("Migration command does not match MOYA_CONTENT_SOURCE");
  const variable = source === "payload" ? "CMS_DATABASE_URL" : "DATABASE_URL";
  if (!environment[variable])
    throw new Error(`Missing migration setting: ${variable}`);
  if (args.includes("--development")) {
    if (source !== "payload")
      throw new Error("Development migrations require payload");
    let cms, backend;
    try {
      cms = new URL(environment.CMS_DATABASE_URL);
      backend = new URL(environment.DATABASE_URL);
    } catch {
      throw new Error("Invalid development database configuration");
    }
    for (const url of [cms, backend]) {
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.pathname !== "/yoyi_dev" ||
        !url.username ||
        url.hash ||
        [...url.searchParams].some(
          ([key, value]) => key !== "sslmode" || value !== "disable",
        )
      )
        throw new Error(
          "Development migrations require the isolated loopback yoyi_dev database",
        );
    }
    if (cms.host !== backend.host || cms.username === backend.username)
      throw new Error(
        "Development CMS and Backend require one database and distinct roles",
      );
  }
  return {
    source,
    variable,
    command: "pnpm",
    args:
      source === "payload"
        ? ["--filter", "admin", "exec", "payload", "migrate"]
        : ["--filter", "@moya/catalog-postgres", "migrate"],
  };
}

export async function migrate(
  environment = process.env,
  args = process.argv.slice(2),
) {
  const plan = migrationPlan(environment, args);
  // Build the shared server packages first. No startup command invokes this
  // explicit DDL path. The target probe itself only reads PostgreSQL metadata.
  const {
    parsePostgresConfig,
    createPostgresPool,
    closePostgresPool,
    migrationTargetProbeSql,
    assertMigrationTarget,
  } = await import("../services/catalog-postgres/dist/index.js");
  const pool = createPostgresPool(
    parsePostgresConfig({
      ...environment,
      DATABASE_URL: environment[plan.variable],
      DATABASE_SSL_CA_FILE:
        plan.source === "payload"
          ? environment.CMS_DATABASE_SSL_CA_FILE
          : environment.DATABASE_SSL_CA_FILE,
    }),
  );
  try {
    const result = await pool.query(migrationTargetProbeSql);
    assertMigrationTarget(result.rows, plan.source);
  } finally {
    await closePostgresPool(pool);
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, {
      cwd: root,
      env: environment,
      stdio: ["inherit", "ignore", "ignore"],
    });
    // The native CLI can print raw driver/config errors; expose only the exit.
    child.once("error", reject);
    child.once("exit", (code) => {
      console.info(`Migration ${plan.source}: ${code === 0 ? "PASS" : "FAIL"}`);
      resolve(code ?? 1);
    });
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await migrate();
  } catch {
    console.error("Migration configuration, target check or execution failed");
    process.exitCode = 1;
  }
}
