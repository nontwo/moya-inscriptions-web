import {
  CONNECTION_TOKEN_PREFIX,
  PRESET_TOOLS,
  admitGrant,
  canonicalScopes,
  connectionAuth,
  toolGrantKey,
  connectionOverrideAuth,
  connectionsEnabled,
} from "admin/agent-connections";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const CLIENT_ID = "artvenn-claude-desktop-01";
/** The canonical scope set a read-only token must carry. Nothing more, nothing less. */
const READ_ONLY_SCOPES = ["comments:read", "content:read", "users:read"];
const MANAGEMENT_SCOPES = [
  "comments:moderate",
  "comments:read",
  "content:read",
  "featured:write",
  "operations:execute",
  "operations:undo",
  "users:read",
];

const connection = (
  overrides: Partial<AgentConnection> = {},
): AgentConnection => ({
  id: "conn-1",
  principalLabel: "agent-phone",
  humanAccountId: "user-owner",
  client: "claude",
  environment: ENVIRONMENT,
  oauthClientId: CLIENT_ID,
  consentedAt: "2026-09-18T00:00:00Z",
  preset: "read-only",
  status: "authorized",
  generation: 3,
  revokedAt: null,
  ...overrides,
});

const grant = (overrides: Partial<VerifiedGrant> = {}): VerifiedGrant => ({
  connectionId: "conn-1",
  subject: "user-owner",
  clientId: CLIENT_ID,
  resource: RESOURCE,
  issuer: ISSUER,
  scopes: READ_ONLY_SCOPES,
  generation: 3,
  expiresAt: "2099-01-01T00:00:00Z",
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

  it("grants a read-only connection exactly the four read tools, so management tools are absent from tools/list", async () => {
    const settings = await auth()(
      request(header(token())),
      async () => ({}) as never,
    );
    const tools = settings["payload-mcp-tool"] ?? {};
    expect(Object.keys(tools).sort()).toEqual(
      [...PRESET_TOOLS["read-only"]].map(toolGrantKey).sort(),
    );
    expect(tools.artvennFeaturedPrepare).toBeUndefined();
    expect(tools.artvennOperationsExecute).toBeUndefined();
  });

  it("grants a management connection the execute tools but still never an approval tool", async () => {
    const settings = await auth({
      read: async () => connection({ preset: "management" }),
      verify: async () => grant({ scopes: MANAGEMENT_SCOPES }),
    })(request(header(token())), async () => ({}) as never);
    const tools = settings["payload-mcp-tool"] ?? {};
    expect(tools.artvennOperationsExecute).toBe(true);
    expect(tools.artvennFeaturedPrepare).toBe(true);
    expect(Object.keys(tools).some((name) => /approve/iu.test(name))).toBe(
      false,
    );
  });

  it("refuses a token whose scope claim is wider than its connection's preset, instead of silently narrowing it", async () => {
    await expect(
      auth({ verify: async () => grant({ scopes: MANAGEMENT_SCOPES }) })(
        request(header(token())),
        async () => ({}) as never,
      ),
    ).rejects.toThrow();
  });

  it("grants no editorial tool to any connection: the editorial domain is not inherited", async () => {
    for (const preset of ["read-only", "management"] as const) {
      const settings = await auth({
        read: async () => connection({ preset }),
        verify: async () =>
          grant({
            scopes:
              preset === "management" ? MANAGEMENT_SCOPES : READ_ONLY_SCOPES,
          }),
      })(request(header(token())), async () => ({}) as never);
      const tools = settings["payload-mcp-tool"] ?? {};
      expect(
        Object.keys(tools).filter((name) => /^editorial/iu.test(name)),
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

describe("r10 §3.1 — the token subject must be the consenting human", () => {
  it("admits a grant whose subject is the connection's human", () => {
    expect(
      admitGrant(grant({ subject: "user-owner" }), connection(), expected).id,
    ).toBe("conn-1");
  });

  it("refuses a validly signed token issued for a different human", () => {
    expect(() =>
      admitGrant(
        grant({ subject: "user-someone-else" }),
        connection(),
        expected,
      ),
    ).toThrow("CONNECTION_SUBJECT_MISMATCH");
  });

  it("gives that refusal the same external shape as every other failure", async () => {
    const outcome = await auth({
      verify: async () => grant({ subject: "user-someone-else" }),
    })(request(header(token())), async () => ({}) as never).then(
      () => "resolved",
      (error: Error) => error.name,
    );
    expect(outcome).not.toBe("resolved");
    expect(outcome).toBe("UnauthorizedError");
  });
});

describe("r10 §3.2 — the exact registered OAuth client, not the vendor family", () => {
  it("admits a grant from the exact authorized client", () => {
    expect(admitGrant(grant(), connection(), expected).oauthClientId).toBe(
      CLIENT_ID,
    );
  });

  it("refuses another registered client even when human, connection, issuer, resource and generation all match", () => {
    expect(() =>
      admitGrant(
        grant({ clientId: "artvenn-claude-desktop-02" }),
        connection(),
        expected,
      ),
    ).toThrow("CONNECTION_CLIENT_MISMATCH");
  });

  it("does not accept the descriptive family label as a client identity", () => {
    expect(() =>
      admitGrant(grant({ clientId: "claude" }), connection(), expected),
    ).toThrow("CONNECTION_CLIENT_MISMATCH");
  });
});

describe("r10 §3.3 — exact scope agreement", () => {
  const refuse = (scopes: unknown) =>
    expect(() =>
      admitGrant(grant({ scopes: scopes as string[] }), connection(), expected),
    ).toThrow("CONNECTION_SCOPE_MISMATCH");

  it("accepts the canonical set for the preset", () => {
    expect(
      admitGrant(grant({ scopes: READ_ONLY_SCOPES }), connection(), expected)
        .id,
    ).toBe("conn-1");
  });

  it("accepts the canonical set in any order, because both sides normalize", () => {
    expect(
      admitGrant(
        grant({ scopes: ["users:read", "comments:read", "content:read"] }),
        connection(),
        expected,
      ).id,
    ).toBe("conn-1");
  });

  it("refuses an extra scope", () => {
    refuse([...READ_ONLY_SCOPES, "featured:write"]);
  });

  it("refuses a missing scope", () => {
    refuse(["users:read", "content:read"]);
  });

  it("refuses a duplicated scope rather than collapsing it", () => {
    refuse([...READ_ONLY_SCOPES, "users:read"]);
  });

  it("refuses an unknown scope", () => {
    refuse(["users:read", "content:read", "comments:read", "admin:everything"]);
  });

  it("refuses an empty claim: absent scopes never inherit the preset", () => {
    refuse([]);
  });

  it("refuses a malformed claim", () => {
    refuse(undefined);
    refuse("users:read content:read comments:read");
    refuse([" users:read", "content:read", "comments:read"]);
    refuse([1, 2, 3]);
  });

  it("requires the management set for a management connection, and refuses the read-only set there", () => {
    const managed = connection({ preset: "management" });
    expect(
      admitGrant(grant({ scopes: MANAGEMENT_SCOPES }), managed, expected).id,
    ).toBe("conn-1");
    expect(() =>
      admitGrant(grant({ scopes: READ_ONLY_SCOPES }), managed, expected),
    ).toThrow("CONNECTION_SCOPE_MISMATCH");
  });
});

describe("r10 §3.4 — the read-only preset advertises only what its scopes authorize", () => {
  it("does not advertise artvenn_operations_get, which the Backend gates on operations:execute", () => {
    expect(PRESET_TOOLS["read-only"]).not.toContain("artvenn_operations_get");
  });

  it("advertises exactly the four tools covered by users:read, content:read and comments:read", () => {
    expect([...PRESET_TOOLS["read-only"]].sort()).toEqual([
      "artvenn_comments_query",
      "artvenn_comments_read",
      "artvenn_content_search",
      "artvenn_users_find",
    ]);
  });

  it("keeps artvenn_operations_get available to management, which does hold operations:execute", () => {
    expect(PRESET_TOOLS.management).toContain("artvenn_operations_get");
    expect(canonicalScopes("management")).toContain("operations:execute");
  });

  it("does not widen the read-only scope set to keep a tool: no operations scope is present", () => {
    expect(canonicalScopes("read-only")).toEqual([
      "comments:read",
      "content:read",
      "users:read",
    ]);
  });
});

describe("r10 review blocker 1 — the grant map must use the key the plugin reads", () => {
  it("matches the plugin's own toCamelCase for every tool in the real registry", async () => {
    // Compared against the plugin's function, not against a second copy of the
    // conversion, so the two cannot drift apart silently.
    const require_ = createRequire(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../apps/admin/package.json",
      ),
    );
    const entry = require_.resolve("@payloadcms/plugin-mcp");
    const camelCaseModule = (await import(
      pathToFileURL(path.join(path.dirname(entry), "utils/camelCase.js")).href
    )) as { toCamelCase: (value: string) => string };

    for (const preset of ["read-only", "management"] as const)
      for (const tool of PRESET_TOOLS[preset])
        expect(toolGrantKey(tool), tool).toBe(
          camelCaseModule.toCamelCase(tool),
        );
  });

  it("emits keys a snake_case lookup would miss, which is the defect this guards", async () => {
    const settings = await auth()(
      request(header(token())),
      async () => ({}) as never,
    );
    const tools = settings["payload-mcp-tool"] ?? {};
    expect(tools.artvennUsersFind).toBe(true);
    // The shape that silently disabled every tool.
    expect(tools.artvenn_users_find).toBeUndefined();
  });
});

describe("r10 review finding 6 — token freshness is checked here", () => {
  it("refuses an expired token even when every other binding agrees", () => {
    expect(() =>
      admitGrant(
        grant({ expiresAt: "2020-01-01T00:00:00Z" }),
        connection(),
        expected,
      ),
    ).toThrow("CONNECTION_TOKEN_EXPIRED");
  });

  it("admits a token that has not expired yet", () => {
    expect(
      admitGrant(
        grant({ expiresAt: "2099-01-01T00:00:00Z" }),
        connection(),
        expected,
        new Date("2026-09-18T00:00:00Z"),
      ).id,
    ).toBe("conn-1");
  });
});

describe("r10 re-review blocker — an unreadable expiry is an expired token", () => {
  it("refuses a JWT-style numeric exp, which Date.parse answers NaN for", async () => {
    // The value a real verifier is most likely to produce: JWT `exp` is a
    // NumericDate, i.e. a number. Written as a bare `<=`, the check was
    // skipped entirely and the grant admitted.
    await expect(
      auth({
        verify: async () =>
          ({ ...grant(), expiresAt: 1789693200 }) as unknown as VerifiedGrant,
      })(request(header(token())), async () => ({}) as never),
    ).rejects.toThrow();
  });

  it("refuses an unparseable expiry string", () => {
    expect(() =>
      admitGrant(
        { ...grant(), expiresAt: "not-a-date" } as VerifiedGrant,
        connection(),
        expected,
      ),
    ).toThrow("CONNECTION_TOKEN_EXPIRED");
  });

  it("refuses a missing expiry rather than treating it as no constraint", () => {
    const withoutExpiry: Record<string, unknown> = { ...grant() };
    delete withoutExpiry.expiresAt;
    expect(() =>
      admitGrant(
        withoutExpiry as unknown as VerifiedGrant,
        connection(),
        expected,
      ),
    ).toThrow("CONNECTION_TOKEN_EXPIRED");
  });

  it("refuses a grant whose shape the verifier got wrong, before any comparison", async () => {
    await expect(
      auth({
        verify: async () =>
          ({ connectionId: "conn-1" }) as unknown as VerifiedGrant,
      })(request(header(token())), async () => ({}) as never),
    ).rejects.toThrow();
  });
});

describe("r10 re-review — diagnostics never change the answer", () => {
  it("records the refusal code, and never the presented credential", async () => {
    const codes: string[] = [];
    const settings = connectionAuth({
      verifyAccessToken: async () => null,
      readConnection: async () => connection(),
      issuer: ISSUER,
      resource: RESOURCE,
      environment: ENVIRONMENT,
      recordRefusal: (code) => codes.push(code),
    });
    await expect(
      settings(
        request(header(token("secret-value"))),
        async () => ({}) as never,
      ),
    ).rejects.toThrow();
    expect(codes).toEqual(["CONNECTION_TOKEN_INVALID"]);
    expect(codes.join(" ")).not.toContain("secret-value");
  });

  it("still answers UnauthorizedError when the diagnostics sink itself throws", async () => {
    const settings = connectionAuth({
      verifyAccessToken: async () => null,
      readConnection: async () => connection(),
      issuer: ISSUER,
      resource: RESOURCE,
      environment: ENVIRONMENT,
      recordRefusal: () => {
        throw new Error("logger transport down");
      },
    });
    const outcome = await settings(
      request(header(token())),
      async () => ({}) as never,
    ).then(
      () => "resolved",
      (error: Error) => error.name,
    );
    expect(outcome).toBe("UnauthorizedError");
  });
});
