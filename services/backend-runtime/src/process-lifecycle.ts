import { createBackendServer, startServer, stopServer } from "./server.js";

import type { InternalListenOptions, ShutdownOptions } from "./server.js";
import type { RequestListener, Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface BackendProcessOptions {
  readonly closeResources?: () => Promise<void>;
  readonly listen: InternalListenOptions;
  readonly requestListener: RequestListener;
  readonly shutdown?: ShutdownOptions;
}

export interface BackendProcessHandle {
  readonly address: AddressInfo;
  readonly server: Server;
  readonly shutdown: () => Promise<void>;
}

export interface ProcessShutdownLogger {
  readonly error: (message: string) => void;
  readonly info: (message: string) => void;
}

const safeMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown runtime error";

export const startBackendProcess = async ({
  closeResources = async (): Promise<void> => undefined,
  listen,
  requestListener,
  shutdown: shutdownOptions,
}: BackendProcessOptions): Promise<BackendProcessHandle> => {
  const server = createBackendServer(requestListener);
  let closeResourcesPromise: Promise<void> | undefined;
  let shutdownPromise: Promise<void> | undefined;

  const closeResourcesOnce = (): Promise<void> => {
    closeResourcesPromise ??= closeResources();
    return closeResourcesPromise;
  };

  let address: AddressInfo;
  try {
    address = await startServer(server, listen);
  } catch (error) {
    await closeResourcesOnce();
    throw error;
  }

  const shutdown = (): Promise<void> => {
    shutdownPromise ??= (async () => {
      try {
        await stopServer(server, shutdownOptions);
      } finally {
        await closeResourcesOnce();
      }
    })();
    return shutdownPromise;
  };

  return { address, server, shutdown };
};

export const installProcessShutdownHandlers = (
  shutdown: () => Promise<void>,
  logger: ProcessShutdownLogger = console,
): (() => void) => {
  let requested = false;
  const handleSignal = (signal: "SIGINT" | "SIGTERM"): void => {
    if (requested) return;
    requested = true;
    logger.info(`[backend-runtime] ${signal} received; shutting down`);
    void shutdown()
      .then(() => {
        logger.info("[backend-runtime] shutdown complete");
      })
      .catch((error: unknown) => {
        logger.error(
          `[backend-runtime] shutdown failed: ${safeMessage(error)}`,
        );
        process.exitCode = 1;
      });
  };
  const handleSigint = (): void => {
    handleSignal("SIGINT");
  };
  const handleSigterm = (): void => {
    handleSignal("SIGTERM");
  };

  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);
  return () => {
    process.off("SIGINT", handleSigint);
    process.off("SIGTERM", handleSigterm);
  };
};
