import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  CONNECTION_TOKEN_PREFIX,
  connectionOverrideAuth,
  isConnectionToken,
} from "admin/agent-connections";
import { describe, expect, it, vi } from "vitest";

import type { PayloadRequest } from "payload";

/**
 * r10 §4 — the credential-routing decision, with its evidence.
 *
 * The instruction prefers a DEDICATED OAuth-only MCP resource path, and falls
 * back to the shared endpoint with a reserved token namespace only if the
 * installed plugin cannot safely support a separate route.
 *
 * It cannot. These assertions are the evidence, executable so that a plugin
 * upgrade which changes any of them makes this decision get revisited instead
 * of being inherited silently:
 *
 *   1. `@payloadcms/plugin-mcp` exports exactly one symbol, `mcpPlugin`.
 *   2. Every deep import into its internals is refused by its own exports map,
 *      so `initializeMCPHandler` — the factory a second route would need — is
 *      not reachable through any supported specifier.
 *   3. The plugin hardcodes `path: '/mcp'`, with no configurable base path, so
 *      a second instance would collide on the same route and push a duplicate
 *      API-key collection rather than producing a second resource.
 *
 * A private deep import would work today and break on any patch release. That
 * is not a safe supported path, so the shared endpoint with a reserved
 * namespace is the smallest safe option — and the reserved namespace is what
 * makes it safe, because it removes credential-type guessing entirely.
 */

const require_ = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../apps/admin/package.json",
  ),
);

describe("r10 §4: why the shared endpoint is necessary", () => {
  it("exposes only mcpPlugin, so no handler factory is available for a second route", async () => {
    // Resolved through the Admin package, which is the workspace that actually
    // depends on the plugin.
    const entry = require_.resolve("@payloadcms/plugin-mcp");
    const module = (await import(pathToFileURL(entry).href)) as Record<
      string,
      unknown
    >;
    expect(Object.keys(module).filter((key) => key !== "default")).toEqual([
      "mcpPlugin",
    ]);
  });

  it("refuses every deep import into its internals through its own exports map", () => {
    for (const specifier of [
      "@payloadcms/plugin-mcp/dist/endpoints/mcp.js",
      "@payloadcms/plugin-mcp/endpoints/mcp",
      "@payloadcms/plugin-mcp/dist/index.js",
    ]) {
      let code: string | undefined;
      try {
        require_.resolve(specifier);
      } catch (error) {
        code = (error as NodeJS.ErrnoException).code;
      }
      expect(code, `${specifier} became importable`).toBe(
        "ERR_PACKAGE_PATH_NOT_EXPORTED",
      );
    }
  });

  it("registers its endpoint at a hardcoded path, so a second instance would collide", () => {
    const entry = require_.resolve("@payloadcms/plugin-mcp");
    const source = require_("node:fs").readFileSync(entry, "utf8") as string;
    expect(source).toContain("path: '/mcp'");
    // No configurable base path is honoured in the registration.
    expect(source).not.toMatch(/path:\s*basePath/u);
  });
});

/**
 * The reserved namespace is what replaces the dedicated route. It must be
 * unambiguous in both directions: ours never reaches the legacy resolver, and
 * a legacy key is never treated as ours.
 */
describe("r10 §4: the reserved token namespace removes credential-type guessing", () => {
  const request = (authorization?: string): PayloadRequest =>
    ({
      headers: new Headers(
        authorization === undefined ? {} : { Authorization: authorization },
      ),
    }) as unknown as PayloadRequest;
  const header = (value: string) => ["Bearer", value].join(" ");

  it("recognises the reserved prefix and nothing else", () => {
    expect(isConnectionToken(`${CONNECTION_TOKEN_PREFIX}abc`)).toBe(true);
    for (const other of [
      "abc",
      "artvenn",
      "artvenn_",
      "artvenn_ctx_abc",
      ` ${CONNECTION_TOKEN_PREFIX}abc`,
      CONNECTION_TOKEN_PREFIX.toUpperCase() + "abc",
    ])
      expect(isConnectionToken(other), other).toBe(false);
  });

  it("sends a reserved-namespace credential nowhere else, even when the surface is closed", async () => {
    const legacy = vi.fn(async () => ({ user: { id: "legacy" } }) as never);
    await expect(
      connectionOverrideAuth(null)(
        request(header(`${CONNECTION_TOKEN_PREFIX}anything`)),
        legacy,
      ),
    ).rejects.toThrow();
    expect(legacy).not.toHaveBeenCalled();
  });

  it("leaves every credential outside the namespace on the legacy path untouched", async () => {
    for (const value of ["plain-api-key", "artvenn-but-not-reserved", "x"]) {
      const legacy = vi.fn(async () => ({ user: { id: "legacy" } }) as never);
      await connectionOverrideAuth(null)(request(header(value)), legacy);
      expect(legacy, value).toHaveBeenCalledOnce();
    }
  });
});
