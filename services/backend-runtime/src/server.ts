import { createServer } from "node:http";

import { createRouter } from "./http/router.js";

import type { RequestListener, Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface InternalListenOptions {
  readonly host: string;
  /** Internal listeners accept 0 for OS-assigned test ports. Environment config does not. */
  readonly port: number;
}

export interface ShutdownOptions {
  readonly timeoutMs?: number;
}

const defaultShutdownTimeoutMs = 10_000;

const assertInternalListenOptions = ({
  host,
  port,
}: InternalListenOptions): void => {
  if (host === "" || host.trim() !== host || /\s/.test(host)) {
    throw new Error("Listen host must be a non-empty value without whitespace");
  }
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Internal listen port must be an integer from 0 to 65535");
  }
};

export const createBackendServer = (
  requestListener: RequestListener = createRouter(),
): Server => {
  const server = createServer(requestListener);
  server.on("request", (_request, response) => {
    response.once("finish", () => {
      if (!server.listening) server.closeIdleConnections();
    });
  });
  return server;
};

export const startServer = async (
  server: Server,
  options: InternalListenOptions,
): Promise<AddressInfo> => {
  assertInternalListenOptions(options);

  return new Promise<AddressInfo>((resolve, reject) => {
    const handleStartupError = (error: Error): void => {
      reject(error);
    };

    server.once("error", handleStartupError);
    server.listen(options.port, options.host, () => {
      server.off("error", handleStartupError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("HTTP server did not expose a TCP listening address"));
        return;
      }
      resolve(address);
    });
  });
};

export const stopServer = async (
  server: Server,
  { timeoutMs = defaultShutdownTimeoutMs }: ShutdownOptions = {},
): Promise<void> => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Shutdown timeout must be a positive integer");
  }
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    const forceCloseTimer = setTimeout(() => {
      server.closeAllConnections();
    }, timeoutMs);
    forceCloseTimer.unref();

    server.close((error) => {
      clearTimeout(forceCloseTimer);
      if (error === undefined) resolve();
      else reject(error);
    });
    server.closeIdleConnections();
  });
};
