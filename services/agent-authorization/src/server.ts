import http from "node:http";

import { createAuthorizationProvider } from "./provider.js";
import { RESUME_PATH, resumeInteraction } from "./resume.js";
import { installAccessTokenWrapper } from "./wrap.js";

import type { AuthorizationConfig } from "./config.js";
import type { ProviderBundle } from "./provider.js";
import type { Pool } from "pg";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — the listener.
 *
 * Loopback only, Development only, and explicitly opted in. It binds
 * 127.0.0.1 because this service has no authorization to be reachable from a
 * network, and binding is where that is enforced rather than promised.
 *
 * `/healthz` answers whether the process is up and which build it is. It
 * deliberately carries NO configuration: an issuer, a resource, a client id or
 * a database name in a health response is a map of the deployment handed to
 * anything that can reach the port.
 */

export interface AuthorizationServer {
  readonly origin: string;
  readonly bundle: ProviderBundle;
  close: () => Promise<void>;
}

export interface StartOptions {
  readonly config: AuthorizationConfig;
  readonly pool: Pool;
  readonly environment: NodeJS.ProcessEnv;
  /** Build identity, so evidence can name what actually ran. */
  readonly buildId: string;
  readonly recordFailure?: (code: string) => void;
  /** Server-side diagnostics for resumes. A bare code, never a credential. */
  readonly recordResume?: (code: string) => void;
}

export const startAuthorizationServer = async (
  options: StartOptions,
): Promise<AuthorizationServer> => {
  const { config, pool, environment, buildId } = options;

  const bundle = await createAuthorizationProvider({
    config,
    pool,
    environment,
  });
  installAccessTokenWrapper(
    bundle,
    options.recordFailure === undefined
      ? {}
      : { recordFailure: options.recordFailure },
  );

  const callback = bundle.provider.callback();
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      // Liveness and identity. Nothing that describes the configuration.
      response.end(JSON.stringify({ status: "ok", buildId }));
      return;
    }
    // Where the browser comes back after the Owner decided in the Admin. It
    // carries only the uid; the authority is this provider's own interaction
    // cookie plus the decision row the control plane wrote.
    const resume = RESUME_PATH.exec(
      new URL(request.url ?? "/", "http://127.0.0.1").pathname,
    );
    if (resume !== null && request.method === "GET") {
      void resumeInteraction(bundle, request, response, resume[1]!)
        .then((outcome) => {
          options.recordResume?.(outcome.code);
        })
        .catch(() => {
          // A resume that throws must not leave a socket open and must not
          // report a reason: every refusal here looks the same from outside.
          options.recordFailure?.("RESUME_FAILED");
          if (!response.headersSent) {
            response.statusCode = 500;
            response.end();
          }
        });
      return;
    }
    callback(request, response);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  return {
    origin: `http://${config.host}:${config.port}`,
    bundle,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
};
