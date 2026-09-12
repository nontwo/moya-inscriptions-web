import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { repositoryRoot } from "./workspace-scanner.js";

// Freeze guard for docs/governance/amendments/2026-09-11-community-v1-scope.md
// section 9. Each assertion pins a repository fact that is true on main today;
// the mission named in that section replaces the pinned value in the same pull
// request that changes it. Nothing here authorizes an implementation.

const read = (file: string) =>
  readFile(path.join(repositoryRoot, file), "utf8");
const visibleEntries = async (directory: string) =>
  (await readdir(path.join(repositoryRoot, directory)))
    .filter((name) => !name.startsWith("."))
    .sort();

const walkFiles = async (
  directory: string,
  files: string[] = [],
): Promise<string[]> => {
  const entries = await readdir(path.join(repositoryRoot, directory), {
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (
      (entry.name.startsWith(".") && !/^\.env(?:\.|$)/u.test(entry.name)) ||
      ["node_modules", "dist", "coverage", "playwright-report"].includes(
        entry.name,
      )
    )
      continue;
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) await walkFiles(relative, files);
    else if (
      /\.(?:[cm]?[jt]sx?|json|sql|md|ya?ml|sh|example)$/u.test(entry.name)
    )
      files.push(relative);
  }
  return files;
};

describe("Community V1 freeze (amendment 2026-09-11, section 9)", () => {
  it("1. keeps the internal contracts subpaths at catalog-import and editorial", async () => {
    expect(await visibleEntries("packages/contracts/src/internal")).toEqual([
      "catalog-import",
      "editorial",
    ]);
  });

  it("2. keeps ApiErrorCode at the four existing codes", async () => {
    const schemas = await read("packages/contracts/src/schemas.ts");
    const enumBody = /apiErrorCodeSchema = z\.enum\(\[([\s\S]*?)\]\)/u.exec(
      schemas,
    );
    expect(enumBody).not.toBeNull();
    expect(
      [...enumBody![1]!.matchAll(/"([A-Z_]+)"/gu)].map((m) => m[1]),
    ).toEqual([
      "INVALID_QUERY",
      "ITEM_NOT_FOUND",
      "SERVICE_UNAVAILABLE",
      "INTERNAL_ERROR",
    ]);
  });

  it("3. keeps the Backend router at the four existing routes", async () => {
    const router = await read("services/backend-runtime/src/http/router.ts");
    expect(
      [...router.matchAll(/pathname === "([^"]+)"/gu)].map((m) => m[1]),
    ).toEqual(["/health", "/v1/catalog", "/v1/catalog-search"]);
    expect(router.match(/\.exec\(pathname\)/gu)).toHaveLength(1);
    expect(router).toContain("/^\\/v1\\/catalog\\/([^/]+)$/");
    expect(router).not.toMatch(/comment|community|\/v1\/me|session/iu);
  });

  it("4. keeps the application modules at catalog only", async () => {
    expect(await visibleEntries("services/api/src/modules")).toEqual([
      "catalog",
    ]);
  });

  it("5. keeps migrations at legacy/payload and the App role out of code", async () => {
    const migrate = await read("scripts/migrate.mjs");
    expect(migrate).toContain('source !== "legacy" && source !== "payload"');
    expect(migrate).not.toMatch(/community|APP_DATABASE_URL/u);
    const files = (
      await Promise.all(
        ["apps", "services", "packages", "scripts"].map((root) =>
          walkFiles(root),
        ),
      )
    ).flat();
    const offenders: string[] = [];
    for (const file of files) {
      if ((await read(file)).includes("APP_DATABASE_URL")) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("6. keeps Payload users limited to owner and automation roles", async () => {
    const users = await read("apps/admin/src/users.ts");
    expect([...users.matchAll(/value: "([a-z]+)"/gu)].map((m) => m[1])).toEqual(
      ["owner", "automation"],
    );
  });
});
