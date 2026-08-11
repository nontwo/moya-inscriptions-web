import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractModuleReferences,
  repositoryRoot,
} from "./workspace-scanner.js";

const productionRoot = path.join(
  repositoryRoot,
  "services",
  "backend-production",
);

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

describe("@moya/backend-production composition boundary", () => {
  it("is a thin root with exactly the runtime and adapter dependencies", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(productionRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies).toEqual({
      "@moya/backend-runtime": "workspace:*",
      "@moya/catalog-postgres": "workspace:*",
    });
  });

  it("imports only the two approved workspace roots", async () => {
    const approved = new Set([
      "@moya/backend-runtime",
      "@moya/catalog-postgres",
    ]);
    const violations: string[] = [];
    for (const file of await collectTypeScript(
      path.join(productionRoot, "src"),
    )) {
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
