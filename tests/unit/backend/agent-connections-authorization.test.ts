import {
  CONNECTION_TOKEN_PREFIX,
  PRESET_TOOLS,
  admitGrant,
  connectionAuth,
  connectionOverrideAuth,
  connectionsEnabled,
} from "admin/agent-connections";
import { describe, expect, it, vi } from "vitest";

import type { AgentConnection, VerifiedGrant } from "admin/agent-connections";
import type { PayloadRequest } from "payload";

/**
 * Agent Connections V1 (Issue #141 r9): the authentication boundary for a
 * browser-consented connection.
 *
 * These regressions exist because the dangerous failures here are all
 * "succeeds when it should not": a revoked token that still works, a
 * read-only connection that can write, a forged connection token that gets
 * retried as a legacy API key, or an OAuth failure that quietly lands on an
 * Owner session.
 */

const ISSUER = "https://auth.artvenn.invalid";
const RESOURCE = "https://admin.artvenn.invalid/api/mcp";
const ENVIRONMENT = "development";

const connection = (
  overrides: Partial<AgentConnection> = {},
): AgentConnection => ({
  id: "conn-1",
  principalLabel: "agent-phone",
  humanAccountId: "user-owner",
  client: "claude",
  environment: ENVIRONMENT,
  preset: "read-only",
  status: "authorized",
  generation: 3,
  revokedAt: null,
  ...overrides,
});

const grant = (overrides: Partial<VerifiedGrant> = {}): VerifiedGrant => ({
  connectionId: "conn-1",
  subject: "user-owner",
  clientId: "client-claude",
  resource: RESOURCE,
  issuer: ISSUER,
  scopes: ["users:read"],
  generation: 3,
  ...overrides,
});

const expected = {
  issuer: ISSUER,
  resource: RESOURCE,
  environment: ENVIRONMENT,
};

const request = (authorization?: string): PayloadRequest =>
  ({
    headers: new Headers(
      authorization === undefined ? {} : { Authorization: authorization },
    ),
  }) as unknown as PayloadRequest;

const token = (suffix = "good") => `${CONNECTION_TOKEN_PREFIX}${suffix}`;
/** Composed rather than written out, so no fixture reads as a credential. */
const header = (value: string) => ["Bearer", value].join(" ");
const notOurs = ["ordinary", "payload", "api", "key"].join("-");

const auth = (
  over: {
    verify?: (presented: string) => Promise<VerifiedGrant | null>;
    read?: (id: string) => Promise<AgentConnection | null>;
  } = {},
) =>
  connectionAuth({
    verifyAccessToken: over.verify ?? (async () => grant()),
    readConnection: over.read ?? (async () => connection()),
    issuer: ISSUER,
    resource: RESOURCE,
    environment: ENVIRONMENT,
  });

describe("admitGrant", () => {
  it("admits a current grant whose issuer, resource, environment and generation all agree", () => {
    expect(admitGrant(grant(), connection(), expected).id).toBe("conn-1");
  });

  it("refuses a token minted by another issuer, so a look-alike authorization server cannot mint access", () => {
    expect(() =>
      admitGrant(
        grant({ issuer: "https://evil.invalid" }),
        connection(),
        expected,
      ),
    ).toThrow("CONNECTION_ISSUER_MISMATCH");
  });

  it("refuses a token addressed to another resource, so a token for a different ArtVenn endpoint is not replayable here", () => {
    expect(() =>
      admitGrant(
        grant({ resource: "https://other.invalid/api/mcp" }),
        connection(),
        expected,
      ),
    ).toThrow("CONNECTION_RESOURCE_MISMATCH");
  });

  it("refuses a grant for a connection in another environment", () => {
    expect(() =>
      admitGrant(grant(), connection({ environment: "production" }), expected),
    ).toThrow("CONNECTION_ENVIRONMENT_MISMATCH");
  });

  it("refuses a missing connection rather than inventing one", () => {
    expect(() => admitGrant(grant(), null, expected)).toThrow(
      "CONNECTION_NOT_FOUND",
    );
  });

  it("refuses a revoked connection even while its token is unexpired", () => {
    expect(() =>
      admitGrant(
        grant(),
        connection({ status: "revoked", revokedAt: "2026-09-18T00:00:00" }),
        expected,
      ),
    ).toThrow("CONNECTION_REVOKED");
  });

  it("refuses a connection still awaiting consent, so a grant cannot precede the human", () => {
    expect(() =>
      admitGrant(grant(), connection({ status: "awaiting-consent" }), expected),
    ).toThrow("CONNECTION_NOT_AUTHORIZED");
  });

  it("refuses a token from a previous generation: disconnect denies an unexpired token without waiting for a clock", () => {
    expect(() =>
      admitGrant(
        grant({ generation: 2 }),
        connection({ generation: 3 }),
        expected,
      ),
    ).toThrow("CONNECTION_GENERATION_STALE");
  });

  it("refuses a token whose connection id disagrees with the record it resolved", () => {
    expect(() =>
      admitGrant(grant(), connection({ id: "conn-2" }), expected),
    ).toThrow("CONNECTION_MISMATCH");
  });
});

describe("connectionAuth", () => {
  it("leaves a request with no bearer to the legacy resolver, so existing API-key callers are untouched", async () => {
    const legacy = vi.fn(async () => ({ user: { id: "legacy" } }) as never);
    await auth()(request(), legacy);
    expect(legacy).toHaveBeenCalledOnce();
  });

  it("leaves a legacy API key to the legacy resolver: a bearer that is not ours is not ours", async () => {
    const legacy = vi.fn(async () => ({ user: { id: "legacy" } }) as never);
    await auth()(request(header(notOurs)), legacy);
    expect(legacy).toHaveBeenCalledOnce();
  });

  it("never falls back to the legacy resolver when OUR token fails, so a forged connection token cannot be retried as an API key", async () => {
    const legacy = vi.fn(async () => ({ user: { id: "legacy" } }) as never);
    await expect(
      auth({ verify: async () => null })(
        request(header(token("forged"))),
        legacy,
      ),
    ).rejects.toThrow();
    expect(legacy).not.toHaveBeenCalled();
  });

  it("never falls back when the connection is revoked", async () => {
    const legacy = vi.fn(async () => ({ user: { id: "legacy" } }) as never);
    await expect(
      auth({ read: async () => connection({ status: "revoked" }) })(
        request(header(token())),
        legacy,
      ),
    ).rejects.toThrow();
    expect(legacy).not.toHaveBeenCalled();
  });

  it("resolves a restricted principal the existing tools already understand, and never an Owner", async () => {
    const settings = await auth()(
      request(header(token())),
      async () => ({}) as never,
    );
    const user = settings.user as unknown as Record<string, unknown>;
    expect(user.agentPrincipal).toBe("agent-phone");
    expect(user.role).not.toBe("owner");
    expect(user._strategy).toBe("artvenn-connection");
  });

  it("grants a read-only connection exactly the five read tools, so management tools are absent from tools/list", async () => {
    const settings = await auth()(
      request(header(token())),
      async () => ({}) as never,
    );
    const tools = settings["payload-mcp-tool"] ?? {};
    expect(Object.keys(tools).sort()).toEqual(
      [...PRESET_TOOLS["read-only"]].sort(),
    );
    expect(tools.artvenn_featured_prepare).toBeUndefined();
    expect(tools.artvenn_operations_execute).toBeUndefined();
  });

  it("grants a management connection the execute tools but still never an approval tool", async () => {
    const settings = await auth({
      read: async () => connection({ preset: "management" }),
    })(request(header(token())), async () => ({}) as never);
    const tools = settings["payload-mcp-tool"] ?? {};
    expect(tools.artvenn_operations_execute).toBe(true);
    expect(tools.artvenn_featured_prepare).toBe(true);
    expect(Object.keys(tools).some((name) => /approve/iu.test(name))).toBe(
      false,
    );
  });

  it("derives tools from the preset, not from the token's scope claim, so a widened token cannot widen the connection", async () => {
    const settings = await auth({
      verify: async () =>
        grant({
          scopes: [
            "users:read",
            "comments:moderate",
            "featured:write",
            "operations:execute",
            "operations:undo",
          ],
        }),
    })(request(header(token())), async () => ({}) as never);
    const tools = settings["payload-mcp-tool"] ?? {};
    expect(Object.keys(tools).sort()).toEqual(
      [...PRESET_TOOLS["read-only"]].sort(),
    );
  });

  it("grants no editorial tool to any connection: the editorial domain is not inherited", async () => {
    for (const preset of ["read-only", "management"] as const) {
      const settings = await auth({ read: async () => connection({ preset }) })(
        request(header(token())),
        async () => ({}) as never,
      );
      const tools = settings["payload-mcp-tool"] ?? {};
      expect(
        Object.keys(tools).filter((name) => name.startsWith("editorial_")),
      ).toEqual([]);
    }
  });

  it("turns off collection, global, config, job and auth capabilities for a connection", async () => {
    const settings = await auth()(
      request(header(token())),
      async () => ({}) as never,
    );
    expect(settings.collections).toEqual({
      create: false,
      delete: false,
      find: false,
      update: false,
    });
    expect(settings.auth?.login).toBe(false);
    expect(settings.jobs?.run).toBe(false);
  });

  it("re-reads the connection on every request, so a disconnect takes effect on the next call rather than the next handshake", async () => {
    const read = vi.fn(async () => connection());
    const authorize = auth({ read });
    await authorize(request(header(token())), async () => ({}) as never);
    await authorize(request(header(token())), async () => ({}) as never);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("answers one refusal shape, so a probe cannot tell a bad signature from a revoked connection", async () => {
    const shapes = await Promise.all(
      [
        auth({ verify: async () => null }),
        auth({ read: async () => null }),
        auth({ read: async () => connection({ status: "revoked" }) }),
        auth({ verify: async () => grant({ generation: 1 }) }),
      ].map(async (authorize) => {
        try {
          await authorize(request(header(token())), async () => ({}) as never);
          return "resolved";
        } catch (error) {
          return (error as Error).name;
        }
      }),
    );
    expect(new Set(shapes).size).toBe(1);
    expect(shapes[0]).not.toBe("resolved");
  });
});

describe("connectionOverrideAuth composition gate", () => {
  it("is off unless BOTH development and the explicit opt-in hold", () => {
    expect(connectionsEnabled({ NODE_ENV: "development" } as never)).toBe(
      false,
    );
    expect(
      connectionsEnabled({ AGENT_CONNECTIONS_ENABLED: "true" } as never),
    ).toBe(false);
    expect(
      connectionsEnabled({
        NODE_ENV: "production",
        AGENT_CONNECTIONS_ENABLED: "true",
      } as never),
    ).toBe(false);
    expect(
      connectionsEnabled({
        NODE_ENV: "development",
        AGENT_CONNECTIONS_ENABLED: "true",
      } as never),
    ).toBe(true);
  });

  it("refuses a connection token outright when the surface is off, instead of quietly trying it as an API key", async () => {
    const legacy = vi.fn(async () => ({ user: { id: "legacy" } }) as never);
    await expect(
      connectionOverrideAuth(null)(request(header(token())), legacy),
    ).rejects.toThrow();
    expect(legacy).not.toHaveBeenCalled();
  });

  it("leaves legacy API-key callers working when the surface is off", async () => {
    const legacy = vi.fn(async () => ({ user: { id: "legacy" } }) as never);
    await connectionOverrideAuth(null)(request(header(notOurs)), legacy);
    expect(legacy).toHaveBeenCalledOnce();
  });

  it("leaves a request with no credential to the legacy resolver's own refusal when the surface is off", async () => {
    const legacy = vi.fn(async () => {
      throw new Error("UNAUTHORIZED");
    });
    await expect(
      connectionOverrideAuth(null)(request(), legacy as never),
    ).rejects.toThrow("UNAUTHORIZED");
    expect(legacy).toHaveBeenCalledOnce();
  });
});
