import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractModuleReferences,
  repositoryRoot,
} from "./workspace-scanner.js";

const apiRoot = path.join(repositoryRoot, "services", "api");

const collectFiles = async (
  directory: string,
  accepted: (fileName: string) => boolean,
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath, accepted)));
    } else if (accepted(entry.name)) {
      files.push(entryPath);
    }
  }

  return files.sort();
};

describe("@moya/api server-only surface", () => {
  it("depends only on Public Contracts and exposes the approved server boundary", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(apiRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      sideEffects?: boolean;
    };

    expect(manifest.dependencies).toEqual({
      "@moya/contracts": "workspace:*",
    });
    expect(manifest.sideEffects).toBe(false);
    expect(Object.keys(await import("@moya/api")).sort()).toEqual([
      "CatalogMediaResolutionError",
      "CatalogQueryUnavailableError",
      "CatalogReadService",
      "deriveCatalogPeriodLabel",
      "isCatalogMediaResolutionError",
      "isCatalogQueryUnavailableError",
      "mapCatalogDetail",
      "mapCatalogPage",
      "mapCatalogSummary",
      "parseCatalogListQuery",
    ]);
  });

  it("keeps source and build output free of infrastructure and HTTP runtime", async () => {
    const files = [
      ...(await collectFiles(path.join(apiRoot, "src"), (name) =>
        name.endsWith(".ts"),
      )),
      ...(await collectFiles(
        path.join(apiRoot, "dist"),
        (name) => name.endsWith(".js") || name.endsWith(".d.ts"),
      )),
    ];
    const forbidden = [
      /["'](?:pg|node-postgres|node-pg-migrate|hono)["']/,
      /\b(?:Request|Response|DATABASE_URL|Pool|PoolClient)\b/,
      /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET)\b/i,
      /["']node:fs(?:\/promises)?["']/,
      /["'][^"']*(?:\/|\\)(?:data|dataset|datasets)(?:\/|\\)[^"']*["']/i,
    ];
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(source)) {
          violations.push(path.relative(repositoryRoot, file));
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps application dependencies pointed away from transport", async () => {
    const applicationRoot = path.join(
      apiRoot,
      "src",
      "modules",
      "catalog",
      "application",
    );
    const files = await collectFiles(applicationRoot, (name) =>
      name.endsWith(".ts"),
    );
    const violations: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const reference of extractModuleReferences(source)) {
        if (reference.specifier.includes("/transport/")) {
          violations.push(
            `${path.relative(repositoryRoot, file)} imports transport`,
          );
        }
        if (
          !file.includes(`${path.sep}mappers${path.sep}`) &&
          (reference.specifier === "@moya/contracts/schemas" ||
            reference.specifier === "@moya/contracts/json-schema")
        ) {
          violations.push(
            `${path.relative(repositoryRoot, file)} imports runtime contracts`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("locates transport parsing outside the application layer", async () => {
    const parserPath = path.join(
      apiRoot,
      "src",
      "modules",
      "catalog",
      "transport",
      "catalog-list-query-parser.ts",
    );
    const parser = await readFile(parserPath, "utf8");

    expect(parser).toContain("catalogListTransportQuerySchema.parse(input)");
    expect(parser).toContain("CatalogListQuery");
    expect(parserPath).not.toContain(`${path.sep}application${path.sep}`);
  });
});
