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
  isAuthorizedWebPublicApiFile,
  isPathInside,
  isRawSourceAccessAuthorized,
  repositoryRoot,
  runtimeDatasetReferences,
  workspacePackageName,
} from "./workspace-scanner.js";

import type { WorkspaceInfo } from "./workspace-scanner.js";

const retainedDataAccessPackage = ["@moya", "data-access"].join("/");

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
    expect(moyaDependencies("@moya/api")).toEqual(["@moya/contracts"]);
    expect(moyaDependencies("@moya/backend-production")).toEqual([
      "@moya/backend-runtime",
      "@moya/catalog-postgres",
      "@moya/image",
    ]);
    expect(moyaDependencies("@moya/backend-runtime")).toEqual([
      "@moya/api",
      "@moya/contracts",
      "@moya/image",
      "@moya/public-api",
    ]);
    expect(moyaDependencies("@moya/catalog-postgres")).toEqual([
      "@moya/api",
      "@moya/contracts",
    ]);
    expect(moyaDependencies("@moya/catalog-importer")).toEqual([
      "@moya/contracts",
    ]);
    expect(moyaDependencies("@moya/data-access")).toEqual([]);
    expect(moyaDependencies("@moya/image")).toEqual([
      "@moya/api",
      "@moya/contracts",
    ]);
    expect(moyaDependencies("@moya/public-api")).toEqual(["@moya/contracts"]);
    expect(moyaDependencies("@moya/ui")).toEqual(["@moya/design-tokens"]);
  });
});

describe("frontend and browser boundaries", () => {
  it("allows Client Components to type-import public DTOs", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const allowed = `
      "use client";
      import type {
        CatalogDetail,
        CatalogId,
        CatalogKind,
        CatalogListTransportQuery,
        CatalogPage,
        MediaId
      } from "@moya/contracts";
      import type { CatalogSummary, PublicMedia } from "@moya/contracts/types";
    `;
    expect(clientBoundaryViolations(file, allowed)).toEqual([]);
  });

  it("detects Reader, runtime schema, database and data-file access", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const forbidden = `
      "use client";
      import { catalogSummarySchema } from "@moya/contracts/schemas";
      import { canonicalCatalogImportEnvelopeSchema } from "@moya/contracts/internal/catalog-import";
      import type { CatalogListQuery, CatalogQueryPort } from "@moya/api";
      import { startProductionBackend } from "@moya/backend-production";
      import { createPostgresPool } from "@moya/catalog-postgres";
      import { MappedStorageUrlResolver } from "@moya/image";
      import "${retainedDataAccessPackage}";
      import { Pool } from "pg";
      import migration from "../../../database/migrations/example.sql";
      const records = new URL("../../data/records.json", import.meta.url);
    `;

    expect(clientBoundaryViolations(file, forbidden)).toEqual(
      expect.arrayContaining([
        "@moya/contracts/schemas is server/runtime-only",
        "@moya/contracts/internal/catalog-import is server/runtime-only",
        "@moya/api is server/runtime-only",
        "@moya/backend-production is server/runtime-only",
        "@moya/catalog-postgres is server/runtime-only",
        "@moya/image is server/runtime-only",
        `${retainedDataAccessPackage} is server/runtime-only`,
        "pg is server/runtime-only",
        "../../../database/migrations/example.sql is server/runtime-only",
        "../../data/records.json is a direct data-file reference",
      ]),
    );
  });

  it("allows Public DTO type imports but rejects backend runtime imports in all frontend code", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const source = `
      import type { CatalogDetail } from "@moya/contracts";
      import type { CatalogQueryPort } from "@moya/api";
      import { createBackendServer } from "@moya/backend-runtime";
      import { startProductionBackend } from "@moya/backend-production";
      import { createPostgresPool } from "@moya/catalog-postgres";
      import { MappedStorageUrlResolver } from "@moya/image";
      import "${retainedDataAccessPackage}";
      import { openApiDocument } from "@moya/public-api";
      import { handler } from "../../services/public-api/src/handler";
    `;

    expect(frontendBoundaryViolations(file, source)).toEqual(
      expect.arrayContaining([
        "@moya/api crosses the frontend boundary",
        "@moya/backend-production crosses the frontend boundary",
        "@moya/backend-runtime crosses the frontend boundary",
        "@moya/catalog-postgres crosses the frontend boundary",
        "@moya/image crosses the frontend boundary",
        `${retainedDataAccessPackage} crosses the frontend boundary`,
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

  it("rejects snake-case object keys and private provider/CDN configuration", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const source = `
      const src = \`https://assets.invalid/\${object_key}\`;
      const provider = STORAGE_PROVIDER;
      const bucket = STORAGE_BUCKET;
      const base = ASSET_CDN_BASE_URL;
    `;

    expect(frontendBoundaryViolations(file, source)).toEqual(
      expect.arrayContaining([
        "Frontend code cannot compose a URL from objectKey",
        "Frontend code cannot use private storage-provider or CDN configuration",
      ]),
    );
  });

  it("rejects internal contract types in Client Components", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const source = `"use client";\nimport type { CatalogRecord } from "@moya/contracts";`;

    expect(clientBoundaryViolations(file, source)).toContain(
      "CatalogRecord is not an approved public DTO type",
    );
  });

  it("rejects normalized Catalog application queries from Public Contracts", () => {
    const file = path.join(repositoryRoot, "apps", "web", "example.tsx");
    const source = `"use client";\nimport type { CatalogListQuery } from "@moya/contracts";`;

    expect(clientBoundaryViolations(file, source)).toContain(
      "CatalogListQuery is not an approved public DTO type",
    );
  });

  it("authorizes the reviewed Web Public API directory without weakening private boundaries", () => {
    const file = path.join(
      repositoryRoot,
      "apps",
      "web",
      "lib",
      "public-api",
      "catalog-list.ts",
    );
    const allowed = `
      import "server-only";
      import { catalogPageSchema } from "@moya/contracts/schemas";
      const configured = process.env.MOYA_PUBLIC_API_BASE_URL;
      const response = globalThis.fetch(configured);
    `;

    expect(isAuthorizedWebPublicApiFile(file, allowed)).toBe(true);
    expect(frontendBoundaryViolations(file, allowed)).toEqual([]);

    const forbidden = `
      import { createBackendServer } from "@moya/backend-runtime";
      import { startProductionBackend } from "@moya/backend-production";
      import { createPostgresPool } from "@moya/catalog-postgres";
      import { MappedStorageUrlResolver } from "@moya/image";
      import { canonicalCatalogImportEnvelopeSchema } from "@moya/contracts/internal/catalog-import";
      import records from "../../../../data/catalog.csv";
    `;

    expect(frontendBoundaryViolations(file, forbidden)).toEqual(
      expect.arrayContaining([
        "@moya/backend-runtime crosses the frontend boundary",
        "@moya/backend-production crosses the frontend boundary",
        "@moya/catalog-postgres crosses the frontend boundary",
        "@moya/image crosses the frontend boundary",
        "@moya/contracts/internal/catalog-import crosses the frontend boundary",
        "../../../../data/catalog.csv is a direct data-file reference",
      ]),
    );
  });

  it("keeps the Web Public API boundary out of Client Components", () => {
    const clientFile = path.join(
      repositoryRoot,
      "apps",
      "web",
      "components",
      "catalog-client.tsx",
    );
    const clientSource = `
      "use client";
      import type { CatalogPage, CatalogSummary, PublicMedia } from "@moya/contracts";
      import { fetchCatalogPage } from "../lib/public-api/catalog-list";
    `;

    expect(clientBoundaryViolations(clientFile, clientSource)).toEqual(
      expect.arrayContaining([
        "../lib/public-api/catalog-list is server/runtime-only",
      ]),
    );

    const boundaryFile = path.join(
      repositoryRoot,
      "apps",
      "web",
      "lib",
      "public-api",
      "client.ts",
    );
    expect(clientBoundaryViolations(boundaryFile, '"use client";')).toContain(
      "Web Public API boundary cannot be a Client Component",
    );
  });

  it("rejects Web business fetch outside the reviewed directory", () => {
    const pageFile = path.join(
      repositoryRoot,
      "apps",
      "web",
      "features",
      "home",
      "loader.ts",
    );

    expect(
      frontendBoundaryViolations(
        pageFile,
        'const response = fetch("https://api.example.invalid/v1/catalog");',
      ),
    ).toContain(
      "Web business HTTP fetch must stay inside apps/web/lib/public-api",
    );
  });

  it("allows only the Owner-authorized server environment variable in the boundary", () => {
    const file = path.join(
      repositoryRoot,
      "apps",
      "web",
      "lib",
      "public-api",
      "server.ts",
    );

    expect(
      frontendBoundaryViolations(
        file,
        "const base = process.env.MOYA_PUBLIC_API_BASE_URL;",
      ),
    ).toEqual([]);
    expect(
      frontendBoundaryViolations(
        file,
        "const extra = process.env.ANOTHER_API_URL;",
      ),
    ).toContain(
      "ANOTHER_API_URL is not authorized for the Web Public API boundary",
    );
  });

  it("allows only connection from next/server in the non-client root Home page", () => {
    const homePage = path.join(
      repositoryRoot,
      "apps",
      "web",
      "app",
      "page.tsx",
    );
    const otherPage = path.join(
      repositoryRoot,
      "apps",
      "web",
      "app",
      "catalog",
      "page.tsx",
    );

    expect(
      frontendBoundaryViolations(
        homePage,
        'import { connection } from "next/server";',
      ),
    ).toEqual([]);
    expect(
      frontendBoundaryViolations(
        homePage,
        'import { connection, cookies } from "next/server";',
      ),
    ).toContain("next/server crosses the frontend boundary");
    expect(
      frontendBoundaryViolations(
        otherPage,
        'import { connection } from "next/server";',
      ),
    ).toContain("next/server crosses the frontend boundary");
    expect(
      frontendBoundaryViolations(
        homePage,
        '"use client";\nimport { connection } from "next/server";',
      ),
    ).toContain("next/server is server/runtime-only");
  });

  it("allows only the Home loader to call the approved Public API server adapter", () => {
    const homeLoader = path.join(
      repositoryRoot,
      "apps",
      "web",
      "features",
      "home",
      "load-home-catalog.ts",
    );
    const otherLoader = path.join(
      repositoryRoot,
      "apps",
      "web",
      "features",
      "catalog",
      "loader.ts",
    );
    const approvedImport =
      'import { fetchServerCatalogPage } from "../../lib/public-api/server";';

    expect(frontendBoundaryViolations(homeLoader, approvedImport)).toEqual([]);
    expect(
      frontendBoundaryViolations(
        homeLoader,
        'import { parsePublicApiBaseUrl } from "../../lib/public-api/server";',
      ),
    ).toContain("../../lib/public-api/server crosses the frontend boundary");
    expect(frontendBoundaryViolations(otherLoader, approvedImport)).toContain(
      "../../lib/public-api/server crosses the frontend boundary",
    );
    expect(
      frontendBoundaryViolations(
        homeLoader,
        `"use client";\n${approvedImport}`,
      ),
    ).toContain("../../lib/public-api/server is server/runtime-only");
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
        import type { CatalogSummary } from "@moya/contracts";
        export { catalogSummarySchema } from "@moya/contracts/schemas";
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

  it("allows fixed interchange filenames only in the internal import specification", () => {
    const specification = path.join(
      repositoryRoot,
      "packages",
      "contracts",
      "src",
      "internal",
      "catalog-import",
      "specification.ts",
    );
    expect(
      runtimeDatasetReferences(
        specification,
        'export const files = ["00_manifest.csv", "catalog.csv", "aliases.csv", "provenance.csv"];',
      ),
    ).toEqual([]);
    expect(
      runtimeDatasetReferences(
        path.join(repositoryRoot, "services", "api", "src", "example.ts"),
        'readFile("catalog.csv");',
      ),
    ).toEqual(["catalog.csv"]);
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

  it("authorizes exactly the controlled Catalog importer", async () => {
    expect([...authorizedRawSourceImporterPackageNames]).toEqual([
      "@moya/catalog-importer",
    ]);
    const workspaces = await discoverWorkspaces();
    const authorized = workspaces
      .filter((candidate) => isRawSourceAccessAuthorized(candidate))
      .map(({ manifest }) => manifest.name);
    expect(authorized).toEqual(["@moya/catalog-importer"]);
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
