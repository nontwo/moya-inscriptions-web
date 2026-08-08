import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { repositoryRoot } from "./workspace-scanner.js";

const collectSurfaceFiles = async (
  directory: string,
  accepted: (fileName: string) => boolean,
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSurfaceFiles(entryPath, accepted)));
    } else if (accepted(entry.name)) {
      files.push(entryPath);
    }
  }

  return files.sort();
};

const dataAccessRoot = path.join(repositoryRoot, "packages", "data-access");

const forbiddenSurfacePatterns = [
  {
    label: "PostgreSQL driver module",
    pattern: /["'](?:pg|node-postgres)["']/,
  },
  {
    label: "PostgreSQL driver type",
    pattern: /\b(?:Pool|PoolClient|QueryConfig|QueryResult)\b/,
  },
  { label: "HTTP router", pattern: /["']hono["']|\bHono\b/ },
  { label: "HTTP transport type", pattern: /\b(?:Request|Response)\b/ },
  {
    label: "database client",
    pattern: /\b(?:DATABASE_URL|DatabaseClient|DbClient)\b/,
  },
  {
    label: "filesystem data source",
    pattern: /["']node:fs(?:\/promises)?["']|\b(?:readFile|createReadStream)\b/,
  },
  {
    label: "repository data file",
    pattern: /["'][^"']*(?:\/|\\)(?:data|dataset|datasets)(?:\/|\\)[^"']*["']/i,
  },
  {
    label: "SQL statement",
    pattern:
      /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM)\b/i,
  },
];

describe("data-access source and declaration surface", () => {
  it("recursively scans source plus built JavaScript and declarations", async () => {
    const sourceFiles = await collectSurfaceFiles(
      path.join(dataAccessRoot, "src"),
      (fileName) => fileName.endsWith(".ts"),
    );
    const builtFiles = await collectSurfaceFiles(
      path.join(dataAccessRoot, "dist"),
      (fileName) => fileName.endsWith(".js") || fileName.endsWith(".d.ts"),
    );

    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(builtFiles.some((file) => file.endsWith(".js"))).toBe(true);
    expect(builtFiles.some((file) => file.endsWith(".d.ts"))).toBe(true);

    const violations: string[] = [];
    for (const file of [...sourceFiles, ...builtFiles]) {
      const source = await readFile(file, "utf8");
      for (const { label, pattern } of forbiddenSurfacePatterns) {
        if (pattern.test(source)) {
          violations.push(`${path.relative(repositoryRoot, file)}: ${label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the package manifest limited to the contracts port dependency", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(dataAccessRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      sideEffects?: boolean;
    };

    expect(manifest.dependencies).toEqual({
      "@moya/contracts": "workspace:*",
    });
    expect(manifest.sideEffects).toBe(false);
  });
});
