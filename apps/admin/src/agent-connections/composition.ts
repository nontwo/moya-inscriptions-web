import { UnauthorizedError } from "payload";

import { connectionAuth } from "./authorization";
import { isConnectionToken } from "./contracts";

import type { ConnectionAuthDependencies } from "./authorization";
import type { MCPAccessSettings } from "@payloadcms/plugin-mcp";
import type { PayloadRequest } from "payload";

/**
 * Agent Connections V1 (Issue #141 r10) — when the connection surface exists
 * at all.
 *
 * The connection surface is composed only where the Agent Administration
 * amendment already allows the agent boundary: `NODE_ENV=development`, and
 * then only when this deployment explicitly turns it on. Composition is the
 * gate, not a runtime branch inside a handler, so the surface is absent
 * rather than present-and-refusing when it is not wanted.
 *
 * The one runtime branch that does exist is deliberate: a request that
 * presents a connection token while the feature is OFF is refused outright.
 * It must not fall through to the legacy API-key resolver, because a caller
 * discovering that ArtVenn silently accepts its connection token as something
 * else is exactly the surprise this gate exists to prevent.
 */

export const CONNECTIONS_ENABLED_SETTING = "AGENT_CONNECTIONS_ENABLED";

/**
 * Development AND an explicit opt-in. Both, never either: a development
 * default that switches itself on is how a Development-only surface ends up
 * somewhere else.
 */
export const connectionsEnabled = (
  environment: NodeJS.ProcessEnv = process.env,
): boolean =>
  environment.NODE_ENV === "development" &&
  environment[CONNECTIONS_ENABLED_SETTING] === "true";

export type OverrideAuth = (
  req: PayloadRequest,
  getDefaultMcpAccessSettings: (
    overrideApiKey?: null | string,
  ) => Promise<MCPAccessSettings>,
) => Promise<MCPAccessSettings>;

const BEARER = /^bearer[ \t]+/iu;

const bearerOf = (req: PayloadRequest): string | null => {
  const header = req.headers.get("Authorization");
  if (header === null || !BEARER.test(header)) return null;
  const presented = header.replace(BEARER, "").trim();
  return presented === "" ? null : presented;
};

/**
 * The `overrideAuth` the plugin receives. When connections are off this is
 * the legacy resolver plus one closed door; when they are on it is the full
 * connection boundary.
 */
export const connectionOverrideAuth = (
  dependencies: ConnectionAuthDependencies | null,
): OverrideAuth => {
  if (dependencies === null)
    return async (req, getDefaultMcpAccessSettings) => {
      const presented = bearerOf(req);
      if (presented !== null && isConnectionToken(presented))
        throw new UnauthorizedError();
      return getDefaultMcpAccessSettings();
    };
  return connectionAuth(dependencies);
};
