import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  clientBoundaryViolations,
  declaredDependencies,
  discoverWorkspaces,
  extractModuleReferences,
  findOwningWorkspace,
  frontendBoundaryViolations,
  isPathInside,
  repositoryRoot,
  workspacePackageName,
} from "./workspace-scanner.js";

describe("workspace dependency boundaries", () => {
  it("declares every imported workspace dependency", async () => {
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

  it("rejects cross-workspace relative source imports", async () => {
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

  it("keeps the approved package dependency directions", async () => {
    const workspaces = await discoverWorkspaces();
    const byName = new Map(
      workspaces.map((workspace) => [workspace.manifest.name, workspace]),
    );
    const moyaDependencies = (name: string): string[] =>
      Object.keys(declaredDependencies(byName.get(name)?.manifest ?? { name }))
        .filter((dependency) => dependency.startsWith("@moya/"))
        .sort();

    expect(moyaDependencies("@moya/contracts")).toEqual([]);
    expect(moyaDependencies("@moya/data-access")).toEqual(["@moya/contracts"]);
    expect(moyaDependencies("@moya/public-api")).toEqual(["@moya/contracts"]);
    expect(moyaDependencies("@moya/ui")).toEqual(["@moya/design-tokens"]);
  });
});

describe("frontend and browser boundaries", () => {
  it("allows Client Components to type-import public DTOs", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const allowed = `"use client";\nimport type { ArchiveItemSummary } from "@moya/contracts";`;
    expect(clientBoundaryViolations(file, allowed)).toEqual([]);
  });

  it("detects Repository, runtime schema, database and data-file access", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const forbidden = `
      "use client";
      import { archiveItemSummarySchema } from "@moya/contracts/schemas";
      import type { ArchiveItemRepository } from "@moya/data-access";
      import { Pool } from "pg";
      const records = new URL("../../data/records.json", import.meta.url);
    `;

    expect(clientBoundaryViolations(file, forbidden)).toEqual(
      expect.arrayContaining([
        "@moya/contracts/schemas is server/runtime-only",
        "@moya/data-access is server/runtime-only",
        "pg is server/runtime-only",
        "../../data/records.json is a direct data-file reference",
      ]),
    );
  });

  it("rejects internal contract types in Client Components", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const source = `"use client";\nimport type { ArchiveItemRecord } from "@moya/contracts";`;

    expect(clientBoundaryViolations(file, source)).toContain(
      "ArchiveItemRecord is not an approved public DTO type",
    );
  });

  it("keeps all real Web, Admin and UI files outside server boundaries", async () => {
    const workspaces = await discoverWorkspaces();
    const guardedRoots = [
      path.join(repositoryRoot, "apps", "web"),
      path.join(repositoryRoot, "apps", "admin"),
      path.join(repositoryRoot, "packages", "ui"),
    ];
    const violations: string[] = [];

    for (const workspace of workspaces.filter(({ root }) =>
      guardedRoots.some((guardedRoot) => isPathInside(guardedRoot, root)),
    )) {
      for (const file of workspace.sourceFiles) {
        const source = await readFile(file, "utf8");
        for (const violation of frontendBoundaryViolations(file, source)) {
          violations.push(
            `${path.relative(repositoryRoot, file)}: ${violation}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe("import scanner coverage", () => {
  it("recognizes static, export-from and literal dynamic imports", () => {
    expect(
      extractModuleReferences(`
        import type { ArchiveItemSummary } from "@moya/contracts";
        export { archiveItemSummarySchema } from "@moya/contracts/schemas";
        const runtime = import("@moya/public-api");
      `),
    ).toEqual([
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
  });
});
