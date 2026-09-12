import process from "node:process";
import console from "node:console";
import path from "node:path";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const migrationDirectory = path.join(root, "database", "community-migrations");
const migrationVariable = "APP_MIGRATION_DATABASE_URL";

const localYoyiDev = (value) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/yoyi_dev" ||
    !url.username ||
    url.hash ||
    [...url.searchParams].some(
      ([key, entry]) => key !== "sslmode" || entry !== "disable",
    )
  )
    return undefined;
  return url;
};

/**
 * The community family is separate from legacy/payload and is never selected
 * by MOYA_CONTENT_SOURCE. It runs only with migration-privileged credentials.
 */
export function communityMigrationPlan(environment, args = []) {
  if (args.some((arg) => arg !== "--development"))
    throw new Error("Unsupported migration argument");
  if (!environment[migrationVariable])
    throw new Error(`Missing migration setting: ${migrationVariable}`);
  if (args.includes("--development")) {
    // The same loopback preflight as scripts/migrate.mjs: the migration role
    // must target the local yoyi_dev database and be distinct from the runtime
    // roles. The App runtime role itself is read only by the composition root.
    const migration = localYoyiDev(environment[migrationVariable]);
    const runtimes = [
      environment.DATABASE_URL ?? "",
      environment.CMS_DATABASE_URL ?? "",
    ].map(localYoyiDev);
    if (migration === undefined || runtimes.some((url) => url === undefined))
      throw new Error(
        "Development community migrations require the isolated loopback yoyi_dev database",
      );
    if (
      runtimes.some(
        (url) =>
          url.host !== migration.host || url.username === migration.username,
      )
    )
      throw new Error(
        "Development community migrations require one database and a migration role distinct from the runtime roles",
      );
  }
  return { variable: migrationVariable, directory: migrationDirectory };
}

export async function migrateCommunity(
  environment = process.env,
  args = process.argv.slice(2),
) {
  const plan = communityMigrationPlan(environment, args);
  // Build the shared server packages first. No startup command invokes this
  // explicit DDL path.
  const { parsePostgresConfig, createPostgresPool, closePostgresPool } =
    await import("../services/catalog-postgres/dist/index.js");
  const { runCommunityMigrations } =
    await import("../services/community-postgres/dist/index.js");
  const pool = createPostgresPool(
    parsePostgresConfig({
      DATABASE_URL: environment[plan.variable],
      DATABASE_SSL_CA_FILE: environment.APP_MIGRATION_DATABASE_SSL_CA_FILE,
    }),
  );
  try {
    const applied = await runCommunityMigrations(pool, plan.directory);
    console.info(`Migration community: PASS (${applied.length} applied)`);
    return 0;
  } finally {
    await closePostgresPool(pool);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    process.exitCode = await migrateCommunity();
  } catch {
    // Driver errors can echo connection strings; expose only the outcome.
    console.error("Community migration configuration or execution failed");
    process.exitCode = 1;
  }
}
