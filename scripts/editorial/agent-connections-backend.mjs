import process from "node:process";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

/**
 * Agent Connections V1 (Issue #141) — a Backend the acceptance harness may
 * start, and only the acceptance harness.
 *
 * WHY THIS EXISTS. `services/backend-production` refuses any local
 * development database not named exactly `yoyi_dev`
 * (`assertLocalDevelopmentDatabase`), which is correct and stays untouched: it
 * is what stops a development Backend being pointed somewhere it should not
 * be. The consequence was that a DISPOSABLE harness could not run a real
 * Backend at all, so the acceptance run reported `backendToolRead: NOT_RUN`
 * and the milestone could not claim a business read.
 *
 * So this composes the SAME `createBackendApplication` the repository's own
 * PostgreSQL integration suite composes, with the real router, the real
 * `AgentAdministrationService` and the real PostgreSQL adapter — no mock port,
 * no duplicated handler, no SQL standing in for MCP. What it adds is a
 * narrower gate of its own, because a disposable target needs MORE proof than
 * a fixed name, not less:
 *
 *   1. NODE_ENV must be development, and an explicit opt-in must be present.
 *      A name or a flag alone is never authorization.
 *   2. The listener binds 127.0.0.1 and nothing else.
 *   3. The database URL must be loopback.
 *   4. The database name must be one this harness owns, by pattern.
 *   5. The disposable marker is verified ON THE DATABASE ACTUALLY CONNECTED
 *      TO, not on the name in the URL — `assertDisposableTestTarget` compares
 *      `current_database()` with the expected name and refuses `yoyi_dev` by
 *      name whatever else is true.
 *   6. The role it connects as must NOT be the one the resource server or the
 *      control plane uses. The split is the point; sharing one superuser-ish
 *      connection would make the grant plan decorative.
 *
 * Any of those failing is a refusal to start, never a warning.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));

const ENABLED = "AGENT_ACCEPTANCE_BACKEND_ENABLED";
const DATABASE = "AGENT_ACCEPTANCE_BACKEND_DATABASE_URL";
const PORT = "AGENT_ACCEPTANCE_BACKEND_PORT";
const CREDENTIAL = "COMMUNITY_OPERATOR_TOKEN";

/** Only a database this harness made. Never a wildcard, never `yoyi_dev`. */
const OWNED_DATABASE = /^[a-z][a-z0-9_]*_agent_conn_[0-9a-f]{8}$/u;

const refuse = (code) => {
  process.stderr.write(`acceptance backend refused: ${code}\n`);
  process.exitCode = 78;
  return null;
};

const main = async () => {
  if (process.env.NODE_ENV !== "development") return refuse("NOT_DEVELOPMENT");
  if (process.env[ENABLED] !== "true") return refuse("NOT_ENABLED");

  const raw = process.env[DATABASE];
  if (!raw) return refuse("DATABASE_REQUIRED");
  let url;
  try {
    url = new URL(raw);
  } catch {
    return refuse("DATABASE_MALFORMED");
  }

  const guard = await import(
    new URL("../disposable-test-target.mjs", import.meta.url).href
  );
  if (!guard.isLoopbackHostname(url.hostname))
    return refuse("DATABASE_NOT_LOOPBACK");
  // `databaseNameFromUrl` answers a DESCRIPTOR, not a string. Testing the
  // object against the pattern silently compared "[object Object]" and
  // refused every legitimate database -- a gate that fails closed, but for
  // the wrong reason and on every run.
  let name;
  try {
    ({ name } = guard.databaseNameFromUrl(raw));
  } catch {
    return refuse("DATABASE_MALFORMED");
  }
  if (!OWNED_DATABASE.test(name)) return refuse("DATABASE_NOT_HARNESS_OWNED");

  const credential = process.env[CREDENTIAL];
  if (!credential || credential.length < 32)
    return refuse("OPERATOR_CREDENTIAL_REQUIRED");
  const port = Number(process.env[PORT]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535)
    return refuse("PORT_INVALID");

  const { createPostgresPool, parsePostgresConfig } = await import(
    path.join(root, "services/catalog-postgres/dist/index.js")
  );
  const {
    PostgresAgentAdministrationAdapter,
    PostgresCommunityCommentAdapter,
    PostgresCommunityIdentityAdapter,
  } = await import(
    path.join(root, "services/community-postgres/dist/index.js")
  );
  const { createBackendApplication, startBackendProcess } = await import(
    path.join(root, "services/backend-runtime/dist/index.js")
  );

  const pool = createPostgresPool(
    parsePostgresConfig({ DATABASE_URL: raw, DATABASE_POOL_MAX: "4" }),
  );

  // The marker, read from the connection itself. A URL can say anything; this
  // asks the server which database it actually opened and whether that
  // database carries the disposable comment.
  try {
    const probe = await pool.query(guard.disposableTestTargetProbeSql);
    guard.assertDisposableTestTarget(probe.rows, name);
  } catch (error) {
    await pool.end().catch(() => undefined);
    return refuse(
      error instanceof Error && /^[A-Z_]+$/u.test(error.message)
        ? error.message
        : "DISPOSABLE_TARGET_PROBE_FAILED",
    );
  }

  // The role must be its own. Sharing the resource server's or the control
  // plane's connection here would defeat the split those roles exist for.
  const actingRole = (await pool.query("SELECT current_user AS role")).rows[0]
    ?.role;
  for (const other of [
    "AGENT_RESOURCE_DATABASE_URL",
    "AGENT_CONSENT_DATABASE_URL",
  ]) {
    const value = process.env[other];
    if (!value) continue;
    let theirs;
    try {
      theirs = decodeURIComponent(new URL(value).username);
    } catch {
      theirs = "";
    }
    if (theirs !== "" && theirs === actingRole) {
      await pool.end().catch(() => undefined);
      return refuse("BACKEND_ROLE_SHARED_WITH_ANOTHER_SERVICE");
    }
  }

  const handle = await startBackendProcess({
    closeResources: () => pool.end(),
    listen: { host: "127.0.0.1", port },
    requestListener: createBackendApplication({
      nodeEnv: "development",
      // The real service, the real adapters, the real router. The agent user
      // lookup reads `community.public_users` through the same PostgreSQL
      // adapter the Production composition root wires, which is what makes
      // the acceptance read a business read rather than a fixture.
      //
      // The identity and comment ports are not decoration: `resolveCommunity`
      // composes no community router at all without an identity port, and
      // `agentAdministrationService` is composed only when a comment port is
      // present too. Without both, the agent boundary this acceptance depends
      // on would simply not be mounted, and every call would 404 — which is
      // how a "Backend started" line can be true while the read is impossible.
      communityIdentityPort: new PostgresCommunityIdentityAdapter(pool),
      communityCommentPort: new PostgresCommunityCommentAdapter(pool),
      agentAdministrationPort: new PostgresAgentAdministrationAdapter(pool),
      communityOperatorCredential: credential,
    }),
  });

  process.stdout.write(
    `acceptance backend listening on http://127.0.0.1:${handle.address.port}\n`,
  );

  // `shutdown()` runs `closeResources` above, which ends the pool once.
  const shutdown = () => {
    void (async () => {
      await handle.shutdown().catch(() => undefined);
      process.exit(0);
    })();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return handle;
};

void main();
