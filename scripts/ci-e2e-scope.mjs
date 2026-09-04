import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const browserSurfaceExactPaths = new Set([
  ".github/workflows/ci.yml",
  ".github/workflows/e2e-full.yml",
  ".nvmrc",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/ci-e2e-scope.mjs",
  "tests/package.json",
  "tsconfig.base.json",
  "turbo.json",
]);

const browserSurfacePrefixes = [
  "apps/web/",
  "docs/design-system/",
  "docs/prototypes/",
  "packages/design-tokens/",
  "packages/ui/",
  "tests/e2e/",
];

const noBrowserExactPaths = new Set([
  ".editorconfig",
  ".github/CODEOWNERS",
  ".github/pull_request_template.md",
  ".gitignore",
  ".prettierignore",
  "AGENTS.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "LICENSE-DATA",
  "NOTICE",
  "README.md",
  "SECURITY.md",
]);

const noBrowserPrefixes = [
  ".github/ISSUE_TEMPLATE/",
  ".github/PULL_REQUEST_TEMPLATE/",
  "docs/",
];

const normalizePath = (value) =>
  value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "");

const matchesPathGroup = (filePath, exactPaths, prefixes) =>
  exactPaths.has(filePath) ||
  prefixes.some((prefix) => filePath.startsWith(prefix));

export const classifyE2eScope = (
  changedPaths,
  eventName = "pull_request",
) => {
  const paths = [
    ...new Set(changedPaths.map(normalizePath).filter(Boolean)),
  ].sort();

  if (paths.length === 0) return "smoke";

  const touchesBrowserSurface = paths.some((filePath) =>
    matchesPathGroup(
      filePath,
      browserSurfaceExactPaths,
      browserSurfacePrefixes,
    ),
  );

  if (touchesBrowserSurface) {
    return eventName === "pull_request" ? "full" : "smoke";
  }

  const changesOnlyNoBrowserPaths = paths.every((filePath) =>
    matchesPathGroup(filePath, noBrowserExactPaths, noBrowserPrefixes),
  );

  return changesOnlyNoBrowserPaths ? "none" : "smoke";
};

const isCommandLineInvocation =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCommandLineInvocation) {
  const [eventName = "pull_request", changedPathsFile] = process.argv.slice(2);
  if (changedPathsFile === undefined) {
    throw new Error(
      "Usage: node scripts/ci-e2e-scope.mjs <event-name> <changed-paths-file>",
    );
  }

  const changedPaths = readFileSync(changedPathsFile, "utf8").split(/\r?\n/);
  process.stdout.write(`${classifyE2eScope(changedPaths, eventName)}\n`);
}
