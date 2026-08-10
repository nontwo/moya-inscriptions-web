import {
  createBackendApplication,
  createBackendServer,
  parseRuntimeConfig,
  startServer,
  stopServer,
} from "./index.js";

import type { Server } from "node:http";

const shutdownTimeoutMs = 10_000;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown runtime error";

const installShutdownHandlers = (server: Server): void => {
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (signal: "SIGINT" | "SIGTERM"): void => {
    if (shutdownPromise !== undefined) return;

    console.info(`[backend-runtime] ${signal} received; shutting down`);
    shutdownPromise = stopServer(server, { timeoutMs: shutdownTimeoutMs })
      .then(() => {
        console.info("[backend-runtime] shutdown complete");
      })
      .catch((error: unknown) => {
        console.error(
          `[backend-runtime] shutdown failed: ${errorMessage(error)}`,
        );
        process.exitCode = 1;
      });
  };

  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });
};

const main = async (): Promise<void> => {
  const config = parseRuntimeConfig(process.env);
  const requestListener = createBackendApplication({
    nodeEnv: config.nodeEnv,
  });
  const server = createBackendServer(requestListener);
  const address = await startServer(server, config);

  installShutdownHandlers(server);
  console.info(
    `[backend-runtime] listening on http://${address.address}:${address.port} (${config.nodeEnv})`,
  );
};

main().catch((error: unknown) => {
  console.error(`[backend-runtime] startup failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
