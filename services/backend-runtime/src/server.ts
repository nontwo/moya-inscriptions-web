import { createServer } from "node:http";

import type { IncomingMessage, RequestListener, Server } from "node:http";
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

export interface BackendServerOptions {
  /**
   * Time a request may take to deliver its whole body; the default equals
   * Node's own `requestTimeout`. Streaming uploads are exempt and bound their
   * body by an idle timeout instead.
   */
  readonly requestDeadlineMs?: number;
}

const defaultRequestDeadlineMs = 300_000;
const deadlineExemptRequests = new WeakSet<IncomingMessage>();

/**
 * Exempts a request whose handler bounds its body itself (a component upload
 * that may stream far longer than the deadline while bytes keep arriving).
 */
export const exemptFromRequestDeadline = (request: IncomingMessage): void => {
  deadlineExemptRequests.add(request);
};

export const createBackendServer = (
  requestListener: RequestListener,
  { requestDeadlineMs = defaultRequestDeadlineMs }: BackendServerOptions = {},
): Server => {
  if (!Number.isSafeInteger(requestDeadlineMs) || requestDeadlineMs <= 0) {
    throw new Error("Request deadline must be a positive integer");
  }
  // Node's requestTimeout ends every request still receiving its body, even
  // while bytes flow; the same deadline is kept below for all other requests.
  const server = createServer(
    {
      requestTimeout: 0,
      // Node derives its default headersTimeout from requestTimeout. Keep
      // headers bounded before a route can identify a streaming upload.
      headersTimeout: Math.min(60_000, requestDeadlineMs),
    },
    requestListener,
  );
  server.on("request", (request, response) => {
    const deadline = setTimeout(() => {
      if (request.complete || deadlineExemptRequests.has(request)) return;
      request.socket.destroy();
    }, requestDeadlineMs);
    deadline.unref();
    response.once("close", () => {
      clearTimeout(deadline);
    });
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
