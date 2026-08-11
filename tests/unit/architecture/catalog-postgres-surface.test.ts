import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractModuleReferences,
  repositoryRoot,
} from "./workspace-scanner.js";

const adapterRoot = path.join(repositoryRoot, "services", "catalog-postgres");

const collectTypeScript = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory())
      files.push(...(await collectTypeScript(entryPath)));
    else if (entry.name.endsWith(".ts")) files.push(entryPath);
  }
  return files.sort();
};

describe("@moya/catalog-postgres package boundary", () => {
  it("depends only on the application contract, Public identity schemas and pg", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(adapterRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      sideEffects?: boolean;
    };
    expect(manifest.dependencies).toEqual({
      "@moya/api": "workspace:*",
      "@moya/contracts": "workspace:*",
      pg: "8.22.0",
    });
    expect(manifest.sideEffects).toBe(false);
  });

  it("keeps imports on the approved infrastructure boundary", async () => {
    const approved = new Set([
      "@moya/api",
      "@moya/contracts",
      "@moya/contracts/schemas",
    ]);
    const violations: string[] = [];
    for (const file of await collectTypeScript(path.join(adapterRoot, "src"))) {
      const source = await readFile(file, "utf8");
      for (const reference of extractModuleReferences(source)) {
        if (
          reference.specifier.startsWith("@moya/") &&
          !approved.has(reference.specifier)
        ) {
          violations.push(
            `${path.relative(repositoryRoot, file)} imports ${reference.specifier}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
