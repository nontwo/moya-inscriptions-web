import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  clientBoundaryViolations,
  declaredDependencies,
  discoverWorkspaces,
  extractModuleReferences,
  findOwningWorkspace,
  hasUseClientDirective,
  isPathInside,
  rawCatalogReferences,
  repositoryRoot,
  workspacePackageName,
} from "./workspace-scanner.js";

describe("workspace dependency boundaries", () => {
  it("declares every imported @moya workspace dependency", async () => {
    const workspaces = await discoverWorkspaces();
    const workspaceNames = new Set(
      workspaces.map((workspace) => workspace.manifest.name),
    );
    const violations: string[] = [];

    for (const workspace of workspaces) {
      const dependencies = declaredDependencies(workspace.manifest);
      for (const file of workspace.sourceFiles) {
        const source = await readFile(file, "utf8");
        for (const reference of extractModuleReferences(source)) {
          const dependencyName = workspacePackageName(reference.specifier);
          if (
            dependencyName !== undefined &&
            workspaceNames.has(dependencyName) &&
            dependencyName !== workspace.manifest.name
          ) {
            if (dependencies[dependencyName] === undefined) {
              violations.push(
                `${path.relative(repositoryRoot, file)} imports undeclared ${dependencyName}`,
              );
            } else if (
              !dependencies[dependencyName]?.startsWith("workspace:")
            ) {
              violations.push(
                `${workspace.manifest.name} must declare ${dependencyName} with workspace:`,
              );
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("resolves and rejects cross-workspace relative source imports", async () => {
    const workspaces = await discoverWorkspaces();
    const violations: string[] = [];

    for (const workspace of workspaces) {
      for (const file of workspace.sourceFiles) {
        const source = await readFile(file, "utf8");
        for (const reference of extractModuleReferences(source)) {
          if (!reference.specifier.startsWith(".")) continue;
          const resolved = path.resolve(
            path.dirname(file),
            reference.specifier,
          );
          const targetWorkspace = findOwningWorkspace(workspaces, resolved);
          if (
            targetWorkspace !== undefined &&
            targetWorkspace.root !== workspace.root &&
            isPathInside(path.join(targetWorkspace.root, "src"), resolved)
          ) {
            violations.push(
              `${path.relative(repositoryRoot, file)} bypasses ${targetWorkspace.manifest.name} exports`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the frozen package dependency directions", async () => {
    const workspaces = await discoverWorkspaces();
    const byName = new Map(
      workspaces.map((workspace) => [workspace.manifest.name, workspace]),
    );
    const workspaceDependencies = (name: string): string[] =>
      Object.keys(declaredDependencies(byName.get(name)?.manifest ?? { name }))
        .filter((dependency) => dependency.startsWith("@moya/"))
        .sort();

    expect(workspaceDependencies("@moya/contracts")).toEqual([]);
    expect(workspaceDependencies("@moya/data-access")).toEqual([
      "@moya/contracts",
    ]);
    expect(workspaceDependencies("@moya/public-api")).toEqual([
      "@moya/contracts",
    ]);
    expect(workspaceDependencies("@moya/ui")).toEqual(["@moya/design-tokens"]);
  });
});

describe("browser and raw runtime boundaries", () => {
  it("recognizes client directives and enforces type-only DTO imports", () => {
    const clientFile = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const allowed = `/* component */\n"use client";\nimport type { SiteSummary } from "@moya/contracts";`;
    const forbidden = `"use client";\nimport { siteSummarySchema } from "@moya/contracts/schemas";\nimport { Pool } from "pg";\nconst value = process.env.DATABASE_URL;`;

    expect(hasUseClientDirective(allowed)).toBe(true);
    expect(clientBoundaryViolations(clientFile, allowed)).toEqual([]);
    expect(clientBoundaryViolations(clientFile, forbidden)).toEqual([
      "@moya/contracts/schemas is server/runtime-only",
      "pg is server/runtime-only",
      "server-only configuration or Secret access",
    ]);
  });

  it("keeps every real Client Component outside server boundaries", async () => {
    const workspaces = await discoverWorkspaces();
    const violations: string[] = [];
    const runtimeRoots = ["apps", "packages", "services"].map((directory) =>
      path.join(repositoryRoot, directory),
    );

    for (const workspace of workspaces.filter(({ root }) =>
      runtimeRoots.some((runtimeRoot) => isPathInside(runtimeRoot, root)),
    )) {
      for (const file of workspace.sourceFiles) {
        const source = await readFile(file, "utf8");
        for (const violation of clientBoundaryViolations(file, source)) {
          violations.push(
            `${path.relative(repositoryRoot, file)}: ${violation}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("blocks raw catalog access from apps, packages, and services", async () => {
    const workspaces = await discoverWorkspaces();
    const runtimeRoots = ["apps", "packages", "services"].map((directory) =>
      path.join(repositoryRoot, directory),
    );
    const violations: string[] = [];

    for (const workspace of workspaces.filter(({ root }) =>
      runtimeRoots.some((runtimeRoot) => isPathInside(runtimeRoot, root)),
    )) {
      for (const file of workspace.sourceFiles) {
        const source = await readFile(file, "utf8");
        for (const reference of rawCatalogReferences(file, source)) {
          violations.push(
            `${path.relative(repositoryRoot, file)} references ${reference}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("detects split path construction without relying on a fixed relative prefix", () => {
    const source = `const raw = path.resolve(projectRoot, "data", "catalog", "source-catalog.json");`;
    const file = path.join(
      repositoryRoot,
      "services",
      "public-api",
      "src",
      "bad.ts",
    );
    expect(rawCatalogReferences(file, source)).toEqual([
      "data/catalog/source-catalog.json",
    ]);
  });

  it("detects raw catalog reads and URL construction", () => {
    const file = path.join(
      repositoryRoot,
      "services",
      "public-api",
      "src",
      "bad.ts",
    );
    const source = `
      const direct = readFileSync("../../../data/catalog/source-catalog.json");
      const url = new URL("../../../data/catalog/first-batch/region-enrichment.json", import.meta.url);
    `;

    expect(rawCatalogReferences(file, source)).toEqual([
      "../../../data/catalog/source-catalog.json",
      "../../../data/catalog/first-batch/region-enrichment.json",
    ]);
  });
});

describe("import scanner coverage", () => {
  it("recognizes static, export-from, and literal dynamic imports", () => {
    const references = extractModuleReferences(`
      import type { SiteSummary } from "@moya/contracts";
      export { siteSummarySchema } from "@moya/contracts/schemas";
      const module = import("@moya/public-api");
    `);

    expect(references).toEqual([
      {
        kind: "static-import",
        specifier: "@moya/contracts",
        typeOnly: true,
      },
      {
        kind: "export-from",
        specifier: "@moya/contracts/schemas",
        typeOnly: false,
      },
      {
        kind: "dynamic-import",
        specifier: "@moya/public-api",
        typeOnly: false,
      },
    ]);
    void references;
  });
});
