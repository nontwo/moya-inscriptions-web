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
  moyaArchitecture?: {
    rawSourceAccess?: "controlled-importer";
  };
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
  const roots = [path.join(repositoryRoot, "tests")];

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

/**
 * T04.0 authorizes no importer. T05 must add a reviewed package name here and
 * the matching manifest capability; neither key is sufficient on its own.
 */
export const authorizedRawSourceImporterPackageNames: ReadonlySet<string> =
  new Set();

const permanentFrontendWorkspaceNames = new Set(["web", "admin", "@moya/ui"]);
const browserRuntimeDependencies = new Set(["next", "react-dom"]);

export const isFrontendWorkspace = (workspace: WorkspaceInfo): boolean => {
  const dependencies = declaredDependencies(workspace.manifest);
  const knownFrontendRoots = [
    path.join(repositoryRoot, "apps", "web"),
    path.join(repositoryRoot, "apps", "admin"),
    path.join(repositoryRoot, "packages", "ui"),
  ];

  return (
    permanentFrontendWorkspaceNames.has(workspace.manifest.name) ||
    knownFrontendRoots.some((root) => isPathInside(root, workspace.root)) ||
    [...browserRuntimeDependencies].some(
      (dependency) => dependencies[dependency] !== undefined,
    )
  );
};

export const isRawSourceAccessAuthorized = (
  workspace: WorkspaceInfo,
  approvedPackageNames: ReadonlySet<string> = authorizedRawSourceImporterPackageNames,
): boolean =>
  !isFrontendWorkspace(workspace) &&
  approvedPackageNames.has(workspace.manifest.name) &&
  workspace.manifest.moyaArchitecture?.rawSourceAccess ===
    "controlled-importer";

export const hasUseClientDirective = (source: string): boolean =>
  /^(?:\uFEFF|\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(["'])use client\1\s*;/.test(
    source,
  );

const stringLiterals = (source: string): string[] => [
  ...[...source.matchAll(/(["'])([^"'\n]+)\1/g)].map((match) => match[2] ?? ""),
  ...[...source.matchAll(/`([^`$\n]+)`/g)].map((match) => match[1] ?? ""),
];

const nonJsonDataExtension =
  /\.(?:csv|jsonl|ndjson|parquet|pdf|sql|tsv|xls|xlsx)$/i;
const jsonExtension = /\.json$/i;
const datasetPathSegment =
  /(?:^|\/)(?:catalog|data|dataset|datasets|fixture|fixtures)(?:\/|$)/i;
const datasetFileName =
  /(?:^|\/)(?:archive[-_]?items?|catalog|records?|dataset|dump|export|seed)(?:[-_.][^/]*)?\.(?:csv|json|jsonl|ndjson|parquet|pdf|sql|tsv|xls|xlsx)$/i;

const normalizedReference = (reference: string): string =>
  reference.replaceAll("\\", "/");

const isGeneralDataFileReference = (reference: string): boolean => {
  const normalized = normalizedReference(reference);
  return (
    nonJsonDataExtension.test(normalized) ||
    (jsonExtension.test(normalized) &&
      (datasetPathSegment.test(normalized) || datasetFileName.test(normalized)))
  );
};

const isRuntimeDatasetReference = (reference: string): boolean => {
  const normalized = normalizedReference(reference);
  const hasKnownDataExtension =
    nonJsonDataExtension.test(normalized) || jsonExtension.test(normalized);
  return (
    hasKnownDataExtension &&
    (datasetPathSegment.test(normalized) || datasetFileName.test(normalized))
  );
};

export const dataFileReferences = (
  filePath: string,
  source: string,
): string[] => {
  const violations: string[] = [];

  for (const literal of stringLiterals(source)) {
    if (isGeneralDataFileReference(literal)) violations.push(literal);

    if (literal.startsWith(".")) {
      const resolved = path.resolve(path.dirname(filePath), literal);
      if (isGeneralDataFileReference(resolved)) violations.push(literal);
    }
  }

  for (const call of source.matchAll(
    /\b(?:path\.)?(?:join|resolve)\s*\(([^)]*)\)/g,
  )) {
    const combined = stringLiterals(call[1] ?? "").join("/");
    if (isGeneralDataFileReference(combined)) violations.push(combined);
  }

  return [...new Set(violations)];
};

/**
 * Finds likely archive-dataset coupling in formal runtime source without
 * treating small configuration, localization or design-token JSON as a
 * database substitute.
 */
export const runtimeDatasetReferences = (
  filePath: string,
  source: string,
): string[] => {
  const violations: string[] = [];

  for (const literal of stringLiterals(source)) {
    if (isRuntimeDatasetReference(literal)) violations.push(literal);

    if (literal.startsWith(".")) {
      const resolved = path.resolve(path.dirname(filePath), literal);
      if (isRuntimeDatasetReference(resolved)) violations.push(literal);
    }
  }

  for (const call of source.matchAll(
    /\b(?:path\.)?(?:join|resolve)\s*\(([^)]*)\)/g,
  )) {
    const combined = stringLiterals(call[1] ?? "").join("/");
    if (isRuntimeDatasetReference(combined)) violations.push(combined);
  }

  return [...new Set(violations)];
};

const serverOnlyPackages = [
  "@moya/api",
  "@moya/backend-runtime",
  "@moya/contracts/json-schema",
  "@moya/contracts/schemas",
  "@moya/data-access",
  "@moya/public-api",
  "node-pg-migrate",
  "pg",
  "server-only",
];

const isForbiddenServerReference = (specifier: string): boolean => {
  const normalized = specifier.replaceAll("\\", "/");
  return (
    serverOnlyPackages.some(
      (entry) => specifier === entry || specifier.startsWith(`${entry}/`),
    ) ||
    specifier.startsWith("node:") ||
    /(?:^|\/)(?:database|infra|infrastructure|server|services)(?:\/|$)/.test(
      normalized,
    )
  );
};

const allowedClientContractTypes = new Set([
  "CatalogDetail",
  "CatalogId",
  "CatalogKind",
  "CatalogListTransportQuery",
  "CatalogPage",
  "CatalogSummary",
  "PublicSourceCitation",
]);

const clientContractTypeViolations = (source: string): string[] => {
  const violations: string[] = [];
  const namedTypeImport =
    /\bimport\s+type\s*{([^}]+)}\s*from\s*(["'])@moya\/contracts(?:\/types)?\2/g;

  for (const match of source.matchAll(namedTypeImport)) {
    const names = (match[1] ?? "")
      .split(",")
      .map((entry) =>
        entry
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim(),
      )
      .filter((entry): entry is string => entry !== undefined && entry !== "");
    for (const name of names) {
      if (!allowedClientContractTypes.has(name)) {
        violations.push(`${name} is not an approved public DTO type`);
      }
    }
  }

  if (
    /\bimport\s+type\s+\*\s+as\s+\w+\s+from\s*(["'])@moya\/contracts(?:\/types)?\1/.test(
      source,
    )
  ) {
    violations.push("contract namespace imports are not public-DTO-only");
  }

  return violations;
};

export const clientBoundaryViolations = (
  filePath: string,
  source: string,
): string[] => {
  if (!hasUseClientDirective(source)) return [];

  const violations: string[] = [];
  for (const reference of extractModuleReferences(source)) {
    if (isForbiddenServerReference(reference.specifier)) {
      violations.push(`${reference.specifier} is server/runtime-only`);
    }
    if (
      (reference.specifier === "@moya/contracts" ||
        reference.specifier === "@moya/contracts/types") &&
      !reference.typeOnly
    ) {
      violations.push(`${reference.specifier} must use import type`);
    }
  }

  for (const reference of dataFileReferences(filePath, source)) {
    violations.push(`${reference} is a direct data-file reference`);
  }
  violations.push(...clientContractTypeViolations(source));

  if (
    /\bDATABASE_URL\b|\b(?:API_SECRET|PRIVATE_KEY|STORAGE_SECRET)\b|process\.env\.(?!NEXT_PUBLIC_)[A-Z0-9_]+/.test(
      source,
    )
  ) {
    violations.push("server-only configuration or secret access");
  }

  return violations;
};

export const frontendBoundaryViolations = (
  filePath: string,
  source: string,
): string[] => {
  const violations = clientBoundaryViolations(filePath, source);
  const isDomainAgnosticUi = isPathInside(
    path.join(repositoryRoot, "packages", "ui"),
    filePath,
  );

  for (const reference of extractModuleReferences(source)) {
    if (isForbiddenServerReference(reference.specifier)) {
      violations.push(`${reference.specifier} crosses the frontend boundary`);
    }
    if (
      isDomainAgnosticUi &&
      (reference.specifier === "@moya/contracts" ||
        reference.specifier.startsWith("@moya/contracts/"))
    ) {
      violations.push(`${reference.specifier} is domain-specific`);
    }
  }

  for (const reference of dataFileReferences(filePath, source)) {
    violations.push(`${reference} is a direct data-file reference`);
  }

  if (/\bPUBLIC_CDN_BASE_URL\b/.test(source)) {
    violations.push(
      "PUBLIC_CDN_BASE_URL is a deprecated frontend URL-composition convention",
    );
  }
  if (
    /(?:\bobjectKey\s*\+|\+\s*objectKey\b|\$\{[^}]*\bobjectKey\b[^}]*\})/.test(
      source,
    )
  ) {
    violations.push("Frontend code cannot compose a URL from objectKey");
  }

  return [...new Set(violations)];
};
