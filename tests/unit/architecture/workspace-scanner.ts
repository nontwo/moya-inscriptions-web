import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);

const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const ignoredDirectories = new Set([
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

export interface WorkspaceManifest {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface WorkspaceInfo {
  manifest: WorkspaceManifest;
  root: string;
  sourceFiles: string[];
}

export interface ModuleReference {
  kind: "dynamic-import" | "export-from" | "static-import";
  specifier: string;
  typeOnly: boolean;
}

const collectSourceFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(
          ...(await collectSourceFiles(path.join(directory, entry.name))),
        );
      }
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files.sort();
};

const readWorkspace = async (
  workspaceRoot: string,
): Promise<WorkspaceInfo> => ({
  manifest: JSON.parse(
    await readFile(path.join(workspaceRoot, "package.json"), "utf8"),
  ) as WorkspaceManifest,
  root: workspaceRoot,
  sourceFiles: await collectSourceFiles(workspaceRoot),
});

export const discoverWorkspaces = async (): Promise<WorkspaceInfo[]> => {
  const roots: string[] = [path.join(repositoryRoot, "tests")];

  for (const group of ["apps", "packages", "services"]) {
    const groupRoot = path.join(repositoryRoot, group);
    const entries = await readdir(groupRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) roots.push(path.join(groupRoot, entry.name));
    }
  }

  return Promise.all(roots.sort().map(readWorkspace));
};

export const isPathInside = (parent: string, candidate: string): boolean => {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};

export const findOwningWorkspace = (
  workspaces: WorkspaceInfo[],
  candidate: string,
): WorkspaceInfo | undefined =>
  [...workspaces]
    .sort((left, right) => right.root.length - left.root.length)
    .find((workspace) => isPathInside(workspace.root, candidate));

export const extractModuleReferences = (source: string): ModuleReference[] => {
  const references: ModuleReference[] = [];
  const staticImport =
    /\bimport\s+(type\s+)?(?:[^"'`;]+?\s+from\s+)?(["'])([^"']+)\2/g;
  const exportFrom =
    /\bexport\s+(type\s+)?[^"'`;]+?\s+from\s+(["'])([^"']+)\2/g;
  const dynamicImport = /\bimport\s*\(\s*(["'])([^"']+)\1\s*\)/g;

  for (const match of source.matchAll(staticImport)) {
    references.push({
      kind: "static-import",
      specifier: match[3] ?? "",
      typeOnly: match[1] !== undefined,
    });
  }
  for (const match of source.matchAll(exportFrom)) {
    references.push({
      kind: "export-from",
      specifier: match[3] ?? "",
      typeOnly: match[1] !== undefined,
    });
  }
  for (const match of source.matchAll(dynamicImport)) {
    references.push({
      kind: "dynamic-import",
      specifier: match[2] ?? "",
      typeOnly: false,
    });
  }

  return references.filter((reference) => reference.specifier !== "");
};

export const workspacePackageName = (specifier: string): string | undefined => {
  if (!specifier.startsWith("@moya/")) return undefined;
  return specifier.split("/").slice(0, 2).join("/");
};

export const declaredDependencies = (
  manifest: WorkspaceManifest,
): Record<string, string> => ({
  ...manifest.dependencies,
  ...manifest.devDependencies,
  ...manifest.optionalDependencies,
  ...manifest.peerDependencies,
});

export const hasUseClientDirective = (source: string): boolean =>
  /^(?:\uFEFF|\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(["'])use client\1\s*;/.test(
    source,
  );

export const clientBoundaryViolations = (
  filePath: string,
  source: string,
): string[] => {
  if (!hasUseClientDirective(source)) return [];

  const violations: string[] = [];
  const forbiddenPackages = [
    "@moya/contracts/json-schema",
    "@moya/contracts/schemas",
    "@moya/data-access",
    "@moya/public-api",
    "node-pg-migrate",
    "pg",
    "server-only",
  ];

  for (const reference of extractModuleReferences(source)) {
    const normalizedSpecifier = reference.specifier.replaceAll("\\", "/");
    if (
      forbiddenPackages.some(
        (forbidden) =>
          reference.specifier === forbidden ||
          reference.specifier.startsWith(`${forbidden}/`),
      ) ||
      reference.specifier.startsWith("node:") ||
      /(?:^|\/)(?:database|infra|infrastructure|server)(?:\/|$)/.test(
        normalizedSpecifier,
      )
    ) {
      violations.push(`${reference.specifier} is server/runtime-only`);
    }
    if (
      (reference.specifier === "@moya/contracts" ||
        reference.specifier === "@moya/contracts/types") &&
      !reference.typeOnly
    ) {
      violations.push(`${reference.specifier} must use import type`);
    }
    if (reference.specifier.startsWith(".")) {
      const resolved = path.resolve(
        path.dirname(filePath),
        reference.specifier,
      );
      const normalized = resolved.split(path.sep).join("/");
      if (
        /\/(?:database|infra|server|services)\//.test(normalized) ||
        normalized.includes("/data/catalog/")
      ) {
        violations.push(
          `${reference.specifier} resolves to server infrastructure`,
        );
      }
    }
  }

  if (
    /\bDATABASE_URL\b|\b(?:API_SECRET|PRIVATE_KEY|STORAGE_SECRET)\b|process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]+/.test(
      source,
    )
  ) {
    violations.push("server-only configuration or Secret access");
  }

  return violations;
};

const stringLiterals = (source: string): string[] =>
  [...source.matchAll(/(["'])([^"'\n]+)\1/g)].map((match) => match[2] ?? "");

export const rawCatalogReferences = (
  filePath: string,
  source: string,
): string[] => {
  const rawRoot = path.join(repositoryRoot, "data", "catalog");
  const violations: string[] = [];

  for (const literal of stringLiterals(source)) {
    const normalized = literal.replaceAll("\\", "/");
    if (normalized.includes("data/catalog")) {
      violations.push(literal);
      continue;
    }
    if (literal.startsWith(".")) {
      const resolved = path.resolve(path.dirname(filePath), literal);
      if (isPathInside(rawRoot, resolved)) violations.push(literal);
    }
  }

  for (const call of source.matchAll(
    /\b(?:path\.)?(?:join|resolve)\s*\(([^)]*)\)/g,
  )) {
    const segments = stringLiterals(call[1] ?? "");
    if (segments.length > 1) {
      const combined = path
        .join(...segments)
        .split(path.sep)
        .join("/");
      if (combined.includes("data/catalog")) violations.push(combined);
    }
  }

  return [...new Set(violations)];
};
