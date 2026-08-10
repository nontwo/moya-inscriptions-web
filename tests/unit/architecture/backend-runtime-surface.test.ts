import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractModuleReferences,
  repositoryRoot,
} from "./workspace-scanner.js";

const runtimeRoot = path.join(repositoryRoot, "services", "backend-runtime");

const collectTypeScriptFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)));
    } else if (entry.name.endsWith(".ts")) {
      files.push(entryPath);
    }
  }

  return files.sort();
};

describe("@moya/backend-runtime package boundary", () => {
  it("has only the approved internal runtime dependency", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(runtimeRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(manifest.dependencies).toEqual({
      "@moya/public-api": "workspace:*",
    });
  });

  it("exposes only runtime composition and lifecycle values", async () => {
    expect(Object.keys(await import("@moya/backend-runtime")).sort()).toEqual([
      "createBackendServer",
      "parseRuntimeConfig",
      "startServer",
      "stopServer",
    ]);
  });

  it("keeps runtime workspace imports pointed toward the public API contract", async () => {
    const violations: string[] = [];
    const sourceFiles = await collectTypeScriptFiles(
      path.join(runtimeRoot, "src"),
    );

    for (const file of sourceFiles) {
      const source = await readFile(file, "utf8");
      for (const reference of extractModuleReferences(source)) {
        if (
          reference.specifier.startsWith("@moya/") &&
          reference.specifier !== "@moya/public-api"
        ) {
          violations.push(
            `${path.relative(repositoryRoot, file)} imports ${reference.specifier}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps lower and contract boundaries independent of the runtime", async () => {
    const guardedRoots = [
      path.join(repositoryRoot, "packages", "contracts", "src"),
      path.join(repositoryRoot, "packages", "data-access", "src"),
      path.join(repositoryRoot, "services", "api", "src"),
      path.join(repositoryRoot, "services", "public-api", "src"),
    ];
    const violations: string[] = [];

    for (const root of guardedRoots) {
      for (const file of await collectTypeScriptFiles(root)) {
        const source = await readFile(file, "utf8");
        for (const reference of extractModuleReferences(source)) {
          if (reference.specifier === "@moya/backend-runtime") {
            violations.push(path.relative(repositoryRoot, file));
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
