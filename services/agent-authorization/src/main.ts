import pg from "pg";

import {
  AUTHORIZATION_ENABLED_SETTING,
  authorizationConfigFrom,
  authorizationEnabled,
} from "./config.js";
import { startAuthorizationServer } from "./server.js";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — the entry point.
 *
 * It refuses to run outside Development-plus-opt-in, refuses to start on
 * malformed configuration, and shuts the listener down before the pool so an
 * in-flight request cannot outlive the connection it is using.
 */
const main = async (): Promise<void> => {
  if (!authorizationEnabled()) {
    process.stderr.write(
      `agent authorization is composed only in development with ${AUTHORIZATION_ENABLED_SETTING}=true\n`,
    );
    process.exitCode = 78;
    return;
  }

  const config = authorizationConfigFrom(process.env);
  const pool = new pg.Pool({ connectionString: config.databaseUrl });

  const server = await startAuthorizationServer({
    config,
    pool,
    environment: process.env,
    buildId: process.env.AGENT_AUTHORIZATION_BUILD_ID ?? "unknown",
    recordFailure: (code) => process.stderr.write(`wrap-failure ${code}\n`),
  });

  process.stdout.write(`agent authorization listening on ${server.origin}\n`);

  const shutdown = () => {
    void (async () => {
      await server.close();
      await pool.end();
      process.exit(0);
    })();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
};

void main();
