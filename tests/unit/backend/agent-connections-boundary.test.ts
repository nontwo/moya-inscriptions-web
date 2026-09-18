import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRESET_TOOLS, canonicalScopes } from "admin/agent-connections";
import { agentAdminTools } from "admin/agent-admin-mcp";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Agent Connections V1 (Issue #141 r9) — F1, the access boundary, checked at
 * the level the evidence actually supports.
 *
 * The Owner's correction is the point of this file. Three claims must not be
 * confused, and only the first is provable by reading the repository:
 *
 *   1. A configured path WOULD proxy to the Admin if the template were
 *      deployed.
 *   2. The path IS reachable on a named deployed host.
 *   3. Unauthenticated or under-scoped callers CAN obtain or mutate data.
 *
 * These regressions assert (1) and pin the conditions under which it matters.
 * They deliberately assert nothing about (2) or (3): no live host was probed,
 * and this task authorizes none. What they DO assert about (3) is the part
 * that is checkable here — that the NEW connection surface fails closed —
 * which is a statement about our code, not about a deployment.
 */

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const read = (relative: string) =>
  readFileSync(path.join(root, relative), "utf8");

describe("F1: what the repository configuration actually says", () => {
  it("routes /api/ to the Admin upstream with named carve-outs, and no carve-out for /mcp", () => {
    const template = read("infra/production/nginx/yoyi.conf.template");
    // The general rule.
    expect(template).toMatch(
      /location \/api\/ \{[^}]*proxy_pass http:\/\/yoyi_admin;/u,
    );
    // The carve-outs that exist, which is why the absence of one is meaningful
    // rather than an oversight nobody ever makes.
    expect(template).toContain("location = /api/catalog");
    expect(template).toContain("location ^~ /api/community/");
    // The finding itself, stated as configuration and nothing more.
    expect(template).not.toContain("/api/mcp");
  });

  it("is a CONDITIONAL finding: this assertion is about the template, not about any deployed host", () => {
    // Recorded as an executable statement of scope so a later reader cannot
    // mistake the test above for evidence of a live exposure. No network call
    // is made by this suite, and none is authorized.
    const template = read("infra/production/nginx/yoyi.conf.template");
    expect(template).toContain("catalog.example.invalid");
  });

  it("keeps the Development-only gate on the artvenn_* tools", () => {
    expect(read("apps/admin/src/agent-admin/mcp-tools.ts")).toContain(
      'process.env.NODE_ENV !== "development"',
    );
  });

  it("records that the editorial tools are a separate policy domain without a NODE_ENV gate", () => {
    // Not a defect assertion: the Owner's decision is that authorized legacy
    // editorial behaviour is preserved and NOT blanket-disabled. This pins the
    // current truth so a future change to it is deliberate and reviewed,
    // rather than silently acquired.
    const mcp = read("apps/admin/src/mcp.ts");
    expect(mcp).toContain("editorial_query");
    expect(mcp).not.toMatch(/editorial_query[\s\S]{0,4000}?NODE_ENV/u);
  });
});

describe("F1: the NEW connection surface fails closed", () => {
  it("is composed with the closed door in the shipped plugin configuration", () => {
    const mcp = read("apps/admin/src/mcp.ts");
    expect(mcp).toContain("connectionOverrideAuth(null)");
  });

  it("requires development AND an explicit opt-in in the composition gate", () => {
    const composition = read("apps/admin/src/agent-connections/composition.ts");
    expect(composition).toContain('environment.NODE_ENV === "development"');
    expect(composition).toContain(
      'environment[CONNECTIONS_ENABLED_SETTING] === "true"',
    );
    // Both, never either.
    expect(composition).toMatch(/development"\s*&&/u);
  });
});

/**
 * r10 §3.4 — the read-only preset checked against the REAL tool registry and
 * the REAL adapter handlers, not against a copy of the tool names.
 *
 * The r9 bug this exists to prevent: a preset advertising a tool whose
 * complete Backend path needs a scope the preset does not hold, so the tool
 * appears in `tools/list` and is then refused when called.
 */
describe("r10 §3.4: read-only advertises only genuinely read-only paths", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const registry = agentAdminTools(
    (() => (async () => ({ ok: true })) as never) as never,
  );

  const requestsOf = async (toolName: string) => {
    const calls: { method: string; path: string }[] = [];
    const tools = agentAdminTools(
      () =>
        (async (method: string, path: string) => {
          calls.push({ method, path });
          return { ok: true, result: {} };
        }) as never,
    );
    const tool = tools.find((candidate) => candidate.name === toolName);
    if (tool === undefined) throw new Error(`no tool ${toolName}`);
    return { tool, calls };
  };

  it("advertises only tools that actually exist in the real registry", () => {
    const names = new Set(registry.map((tool) => tool.name));
    for (const preset of ["read-only", "management"] as const)
      for (const advertised of PRESET_TOOLS[preset])
        expect(names.has(advertised)).toBe(true);
  });

  /**
   * The discriminator is the SCOPE the Backend enforces on the path, not the
   * HTTP method: `artvenn_operations_get` is a GET too, so a method-only
   * assertion could not catch the r9 defect it is named for. This table is the
   * Backend's own enforcement, and the test below keeps it honest against the
   * service source rather than trusting the copy.
   */
  const SCOPE_BY_PATH_PREFIX: readonly (readonly [string, string])[] = [
    // Order matters: the two specific operation paths are enforced under
    // different scopes from the rest of the family, and the r10 review caught
    // this table mapping all of `agent/operations` to `operations:execute`.
    ["agent/operations/prepare-comments", "comments:moderate"],
    ["agent/users", "users:read"],
    ["agent/content", "content:read"],
    ["agent/comments", "comments:read"],
    ["agent/operations", "operations:execute"],
  ];

  /** `prepare-undo` is a suffix, not a prefix, so it needs its own rule. */
  const scopeOverride = (path: string): string | null =>
    path.endsWith("/prepare-undo") ? "operations:undo" : null;

  const scopeForPath = (path: string): string => {
    const override = scopeOverride(path);
    if (override !== null) return override;
    for (const [prefix, scope] of SCOPE_BY_PATH_PREFIX)
      if (path.startsWith(prefix)) return scope;
    throw new Error(`no scope mapped for Backend path ${path}`);
  };

  it("calls only Backend paths whose enforced scope the read-only preset actually holds", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const held = new Set(canonicalScopes("read-only"));
    const fixtures: Record<string, Record<string, unknown>> = {
      artvenn_users_find: { handle: "someone", page: 1, pageSize: 20 },
      artvenn_content_search: { search: "ink", page: 1, pageSize: 20 },
      artvenn_comments_query: { page: 1, pageSize: 20 },
      artvenn_comments_read: { id: `comment-${"a".repeat(32)}` },
    };
    for (const name of PRESET_TOOLS["read-only"]) {
      const { tool, calls } = await requestsOf(name);
      await tool.handler(
        fixtures[name] ?? {},
        {
          user: { collection: "users", agentPrincipal: "agent-phone" },
        } as never,
        undefined,
      );
      expect(calls.length, `${name} made no Backend call`).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call.method, `${name} mutates`).toBe("GET");
        expect(
          held.has(scopeForPath(call.path)),
          `${name} calls ${call.path}, enforced under ${scopeForPath(call.path)}, which read-only does not hold`,
        ).toBe(true);
      }
    }
  });

  it("has teeth: the tool r9 wrongly advertised is caught by that same rule", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const held = new Set(canonicalScopes("read-only"));
    const { tool, calls } = await requestsOf("artvenn_operations_get");
    await tool.handler(
      { operationId: "11111111-1111-4111-8111-111111111111" },
      {
        user: { collection: "users", agentPrincipal: "agent-phone" },
      } as never,
      undefined,
    );
    expect(calls.length).toBeGreaterThan(0);
    // A GET, like the four allowed tools — which is exactly why the method is
    // not the discriminator. The scope is.
    expect(calls[0]!.method).toBe("GET");
    expect(held.has(scopeForPath(calls[0]!.path))).toBe(false);
  });

  it("covers every management tool's Backend path in the scope table, and maps each to the scope the service really enforces", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const held = new Set(canonicalScopes("management"));
    const mapped: Record<string, string> = {};
    const fixtures: Record<string, Record<string, unknown>> = {
      artvenn_users_find: { handle: "someone", page: 1, pageSize: 20 },
      artvenn_content_search: { search: "ink", page: 1, pageSize: 20 },
      artvenn_comments_query: { page: 1, pageSize: 20 },
      artvenn_comments_read: { id: `comment-${"a".repeat(32)}` },
      artvenn_operations_get: {
        operationId: "11111111-1111-4111-8111-111111111111",
      },
      artvenn_comments_prepare: {
        requestId: "11111111-1111-4111-8111-111111111111",
        action: "hide",
        ids: [`comment-${"a".repeat(32)}`],
      },
      artvenn_featured_prepare: {
        requestId: "11111111-1111-4111-8111-111111111111",
        items: [
          {
            target: { type: "work", id: `work-${"a".repeat(32)}` },
            enabled: true,
            position: 0,
          },
        ],
      },
      artvenn_operations_execute: {
        requestId: "11111111-1111-4111-8111-111111111111",
        operationId: "11111111-1111-4111-8111-111111111111",
      },
      artvenn_operations_cancel: {
        requestId: "11111111-1111-4111-8111-111111111111",
        operationId: "11111111-1111-4111-8111-111111111111",
      },
      artvenn_operations_prepare_undo: {
        requestId: "11111111-1111-4111-8111-111111111111",
        operationId: "11111111-1111-4111-8111-111111111111",
      },
    };
    for (const name of PRESET_TOOLS.management) {
      const { tool, calls } = await requestsOf(name);
      await tool.handler(
        fixtures[name] ?? {},
        {
          user: { collection: "users", agentPrincipal: "agent-phone" },
        } as never,
        undefined,
      );
      expect(calls.length, `${name} made no Backend call`).toBeGreaterThan(0);
      for (const call of calls) {
        // `held` is every scope, because management holds all seven — so this
        // alone cannot fail. The assertions that CAN fail are that the table
        // covers the path at all (scopeForPath throws otherwise) and that the
        // specific paths below map where the service actually enforces them.
        expect(
          held.has(scopeForPath(call.path)),
          `${name} calls ${call.path} under ${scopeForPath(call.path)}`,
        ).toBe(true);
        mapped[name] = scopeForPath(call.path);
      }
    }
    expect(mapped.artvenn_comments_prepare).toBe("comments:moderate");
    expect(mapped.artvenn_operations_prepare_undo).toBe("operations:undo");
    expect(mapped.artvenn_operations_execute).toBe("operations:execute");
  });

  it("still finds each mapped scope enforced by the service under that exact name", async () => {
    const source = read(
      "services/api/src/modules/community/application/services/agent-administration-service.ts",
    );
    for (const [, scope] of SCOPE_BY_PATH_PREFIX)
      expect(
        source.includes(`authorize(principal, "${scope}")`),
        `${scope} is no longer enforced by the service under that name`,
      ).toBe(true);
  });

  it("keeps every management-only tool out of the read-only grant map, so it is absent from tools/list", () => {
    const readOnly = new Set(PRESET_TOOLS["read-only"]);
    const managementOnly = PRESET_TOOLS.management.filter(
      (name) => !readOnly.has(name),
    );
    expect(managementOnly.length).toBeGreaterThan(0);
    // The specific r9 defect, pinned by name.
    expect(managementOnly).toContain("artvenn_operations_get");
  });

  it("covers every tool in the real registry by exactly one preset decision", () => {
    const names = registry.map((tool) => tool.name);
    for (const name of names)
      expect(
        PRESET_TOOLS.management.includes(name),
        `${name} is in the registry but no preset grants it`,
      ).toBe(true);
  });
});
