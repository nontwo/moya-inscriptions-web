import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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
