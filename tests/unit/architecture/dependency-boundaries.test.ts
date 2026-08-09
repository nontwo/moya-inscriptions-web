import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  clientBoundaryViolations,
  authorizedRawSourceImporterPackageNames,
  declaredDependencies,
  discoverWorkspaces,
  extractModuleReferences,
  findOwningWorkspace,
  frontendBoundaryViolations,
  isPathInside,
  isRawSourceAccessAuthorized,
  repositoryRoot,
  runtimeDatasetReferences,
  workspacePackageName,
} from "./workspace-scanner.js";

import type { WorkspaceInfo } from "./workspace-scanner.js";

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

  it("detects Reader, runtime schema, database and data-file access", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const forbidden = `
      "use client";
      import { archiveItemSummarySchema } from "@moya/contracts/schemas";
      import type { ArchiveCatalogReader } from "@moya/data-access";
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

  it("allows Public DTO type imports but rejects backend runtime imports in all frontend code", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const source = `
      import type { ArchiveItemDetail } from "@moya/contracts";
      import type { ArchiveCatalogReader } from "@moya/data-access";
      import { openApiDocument } from "@moya/public-api";
      import { handler } from "../../services/public-api/src/handler";
    `;

    expect(frontendBoundaryViolations(file, source)).toEqual(
      expect.arrayContaining([
        "@moya/data-access crosses the frontend boundary",
        "@moya/public-api crosses the frontend boundary",
        "../../services/public-api/src/handler crosses the frontend boundary",
      ]),
    );
    expect(frontendBoundaryViolations(file, source)).not.toContain(
      "@moya/contracts crosses the frontend boundary",
    );
  });

  it("rejects deprecated CDN-base and object-key URL composition", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const source =
      "const baseUrl = process.env.PUBLIC_CDN_BASE_URL;\nconst src = `${baseUrl}/${objectKey}`;";

    expect(frontendBoundaryViolations(file, source)).toEqual(
      expect.arrayContaining([
        "PUBLIC_CDN_BASE_URL is a deprecated frontend URL-composition convention",
        "Frontend code cannot compose a URL from objectKey",
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

describe("formal runtime dataset boundary", () => {
  const workspace = (
    name: string,
    options: {
      capability?: "controlled-importer";
      dependencies?: Record<string, string>;
      root?: string;
    } = {},
  ): WorkspaceInfo => ({
    manifest: {
      name,
      ...(options.dependencies === undefined
        ? {}
        : { dependencies: options.dependencies }),
      ...(options.capability === undefined
        ? {}
        : {
            moyaArchitecture: {
              rawSourceAccess: options.capability,
            },
          }),
    },
    root: options.root ?? path.join(repositoryRoot, "future-workspaces", name),
    sourceFiles: [],
  });

  it("detects direct imports and filesystem construction for archive datasets", () => {
    const file = path.join(
      repositoryRoot,
      "services",
      "public-api",
      "src",
      "example.ts",
    );
    const forbidden = `
      import records from "../../../data/archive-items.json";
      const imported = readFile("../datasets/catalog.jsonl");
      const resolved = path.resolve(root, "fixtures", "records.csv");
      const located = new URL("../catalog/archive-records.json", import.meta.url);
    `;

    expect(runtimeDatasetReferences(file, forbidden)).toEqual(
      expect.arrayContaining([
        "../../../data/archive-items.json",
        "../datasets/catalog.jsonl",
        "fixtures/records.csv",
        "../catalog/archive-records.json",
      ]),
    );
  });

  it("allows small configuration, localization and design-token JSON", () => {
    const file = path.join(repositoryRoot, "apps", "web", "src", "example.ts");
    const allowed = `
      import navigation from "./config/navigation.json";
      import chinese from "./locales/zh-CN.json";
      import colors from "@moya/design-tokens/colors.json";
    `;

    expect(runtimeDatasetReferences(file, allowed)).toEqual([]);
  });

  it("requires architecture allowlist and manifest capability together", () => {
    const approved = new Set(["@moya/catalog-importer"]);
    const importer = workspace("@moya/catalog-importer", {
      capability: "controlled-importer",
    });

    expect(isRawSourceAccessAuthorized(importer, approved)).toBe(true);
    expect(
      isRawSourceAccessAuthorized(
        workspace("@moya/catalog-importer"),
        approved,
      ),
    ).toBe(false);
    expect(
      isRawSourceAccessAuthorized(
        workspace("@moya/unapproved-importer", {
          capability: "controlled-importer",
        }),
        approved,
      ),
    ).toBe(false);
  });

  it("permanently denies frontend workspaces even with both importer keys", () => {
    for (const frontend of [
      workspace("web", {
        capability: "controlled-importer",
        root: path.join(repositoryRoot, "apps", "web"),
      }),
      workspace("admin", {
        capability: "controlled-importer",
        root: path.join(repositoryRoot, "apps", "admin"),
      }),
      workspace("@moya/ui", {
        capability: "controlled-importer",
        root: path.join(repositoryRoot, "packages", "ui"),
      }),
      workspace("future-browser", {
        capability: "controlled-importer",
        dependencies: { "react-dom": "19.2.8" },
      }),
    ]) {
      expect(
        isRawSourceAccessAuthorized(
          frontend,
          new Set([frontend.manifest.name]),
        ),
      ).toBe(false);
    }
  });

  it("authorizes no raw-source importer in T04.0", () => {
    expect([...authorizedRawSourceImporterPackageNames]).toEqual([]);
  });

  it("keeps unapproved runtime workspaces independent of repository datasets", async () => {
    const workspaces = await discoverWorkspaces();
    const violations: string[] = [];

    for (const workspace of workspaces.filter(
      ({ manifest }) => manifest.name !== "@moya/tests",
    )) {
      if (isRawSourceAccessAuthorized(workspace)) continue;
      for (const file of workspace.sourceFiles) {
        const source = await readFile(file, "utf8");
        for (const reference of runtimeDatasetReferences(file, source)) {
          violations.push(
            `${path.relative(repositoryRoot, file)}: ${reference}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
