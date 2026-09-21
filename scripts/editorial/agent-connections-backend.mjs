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
 *   3. The database URL must be loopback, name an explicit port, and carry
 *      no override — the hostname is not where `pg` connects if a query
 *      parameter says otherwise, and an absent port defers to `PGPORT`.
 *   4. The database name must be one this harness owns, by pattern.
 *   5. The disposable marker is verified ON THE DATABASE ACTUALLY CONNECTED
 *      TO, not on the name in the URL — `assertDisposableTestTarget` compares
 *      `current_database()` with the expected name and refuses `yoyi_dev` by
 *      name whatever else is true.
 *   6. The role it connects as must NOT be the one the provider, the resource
 *      server or the control plane uses, and all three of those must be
 *      named. The split is the point; sharing one superuser-ish connection
 *      would make the grant plan decorative, and a check that is skipped
 *      because a variable is absent is not a check.
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
  // THE HOSTNAME IS NOT WHERE `pg` CONNECTS. `pg-connection-string` treats
  // every query parameter as a config key and lets `?host=`, `?port=` and
  // `?user=` OVERRIDE the URL's own authority -- so a URL whose hostname
  // reads 127.0.0.1 can open a socket to an arbitrary host as an arbitrary
  // role, with the loopback check above answering true the whole way.
  // Measured, not inferred: parsing
  // `…@127.0.0.1:5432/x?host=203.0.113.9&port=6543&user=postgres` yields
  // host 203.0.113.9, port 6543, user postgres.
  //
  // `services/backend-production/src/composition.ts` already closes this with
  // a whitelist (`isLocalYoyiDevUrl`); this file was written without
  // inheriting it. An independent review found the gap.
  if (
    url.hash !== "" ||
    ![...url.searchParams].every(
      ([key, value]) => key === "sslmode" && value === "disable",
    )
  )
    return refuse("DATABASE_URL_CARRIES_OVERRIDES");
  // And an explicit port, for the same reason one level down: `pg` falls back
  // to `PGPORT` whenever the parsed port is empty, so a URL that simply omits
  // the port is steerable by an ambient variable. Weaker than the override
  // above -- the host stays pinned, the name must still match and the marker
  // must still be present -- and unreachable under the harness, which strips
  // every `PG*` variable from its children. Held anyway, so safeguard #3 is
  // true end to end rather than true in the configuration that happens to
  // call it.
  if (url.port === "") return refuse("DATABASE_PORT_REQUIRED");
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

  // The role must be its own, and the check must be capable of failing.
  //
  // Two corrections from an independent review, both of which made this weaker
  // than the comment above it claimed:
  //
  //   * the PROVIDER role was not compared at all, and it is the most
  //     privileged of the three -- it is the only one that writes the token
  //     store and the wrappers. Starting this Backend as the provider was
  //     therefore permitted.
  //   * a missing peer variable was skipped with `continue`, so running this
  //     script without them ran NO check while still printing that it had
  //     started. A gate that is silently absent is not a gate, so all three
  //     are now REQUIRED.
  //
  // The comparison is against `current_user`, which is what the server says
  // this connection actually authenticated as -- not the username in the URL,
  // which `?user=` can override (refused above in any case).
  let actingRole;
  try {
    actingRole = (await pool.query("SELECT current_user AS role")).rows[0]
      ?.role;
  } catch {
    await pool.end().catch(() => undefined);
    return refuse("ACTING_ROLE_UNREADABLE");
  }
  if (typeof actingRole !== "string" || actingRole === "") {
    await pool.end().catch(() => undefined);
    return refuse("ACTING_ROLE_UNREADABLE");
  }
  for (const other of [
    "AGENT_AUTHORIZATION_DATABASE_URL",
    "AGENT_RESOURCE_DATABASE_URL",
    "AGENT_CONSENT_DATABASE_URL",
  ]) {
    const value = process.env[other];
    if (!value) {
      await pool.end().catch(() => undefined);
      return refuse("PEER_ROLE_URLS_REQUIRED");
    }
    let theirs;
    try {
      theirs = decodeURIComponent(new URL(value).username);
    } catch {
      theirs = "";
    }
    if (theirs === "" || theirs === actingRole) {
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

// A bare `void main()` turned any unexpected throw into an unhandled
// rejection with a stack on stderr and no code, which is exactly the
// diagnosis problem the harness's refusal extractor exists to solve.
const CODE = /^[A-Z][A-Z0-9_]{2,63}$/u;
void main().catch((error) => {
  // `error.code` before the generic, because Node puts the identifier THERE:
  // an `ERR_MODULE_NOT_FOUND` or an `EADDRINUSE` carries a human message and
  // a machine code, and reading only the message threw away the one the
  // harness's extractor names in its own comment. `ERR_MODULE_NOT_FOUND` is
  // the failure this harness lost the most time to; reporting it as a
  // generic would have cost that time again.
  const message = error instanceof Error ? error.message : "";
  const code = typeof error?.code === "string" ? error.code : "";
  refuse(
    CODE.test(message)
      ? message
      : CODE.test(code)
        ? code
        : "ACCEPTANCE_BACKEND_FAILED",
  );
});
