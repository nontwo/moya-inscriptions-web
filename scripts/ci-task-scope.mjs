import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const docs = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "README.md",
  "SECURITY.md",
  "LICENSE",
  "LICENSE-DATA",
  "NOTICE",
  ".github/pull_request_template.md",
]);
const tooling = new Set([
  ".prettierignore",
  "eslint.config.mjs",
  "prettier.config.mjs",
  ".editorconfig",
  ".gitignore",
  ".github/CODEOWNERS",
  "scripts/verify.mjs",
  "scripts/ci-e2e-scope.mjs",
  "scripts/ci-e2e-gate.mjs",
  "scripts/ci-e2e-smoke.mjs",
  "scripts/ci-task-scope.mjs",
  "scripts/ci-task-gate.mjs",
  "scripts/verify-task.mjs",
  "scripts/verify-apple.mjs",
  "scripts/task-validation.test.mjs",
  "tests/unit/architecture/workspace-scanner.ts",
  "tests/unit/architecture/ci-e2e-policy.test.ts",
]);
const webRoots = [
  "apps/web/",
  "apps/admin/",
  "packages/design-tokens/",
  "packages/image/",
  "packages/search/",
  "packages/ui/",
  "services/api/",
  "services/backend-production/",
  "services/backend-runtime/",
  "services/catalog-importer/",
  "services/catalog-postgres/",
  "services/community-postgres/",
  "database/",
  "infra/",
  "tests/",
  "experiments/",
  "docs/prototypes/",
  "docs/design-system/",
];
const webConfig = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".nvmrc",
  ".env.example",
  "tsconfig.base.json",
  "turbo.json",
  "compose.dev.yml",
  "compose.postgres.yml",
]);
const publicBoundary = (file) =>
  (file.startsWith("packages/contracts/") &&
    !file.startsWith("packages/contracts/src/internal/")) ||
  file.startsWith("services/public-api/") ||
  /^services\/backend-runtime\/src\/community\/(?:session|auth|community-handler)/u.test(
    file,
  );

export function assertPath(file) {
  if (
    typeof file !== "string" ||
    !file ||
    /[\\\x00-\x1f\x7f]/u.test(file) ||
    file.startsWith("/") ||
    file.split("/").some((part) => ["", ".", ".."].includes(part))
  )
    throw new Error(`Invalid changed path: ${JSON.stringify(file)}`);
}

// Metadata (author, model, labels, branch prefix) is deliberately not an input.
export function classifyTask(paths, event = "pull_request") {
  if (!["pull_request", "push", "local", "workflow_dispatch"].includes(event))
    throw new Error("Unsupported comparison event");
  if (
    !Array.isArray(paths) ||
    (paths.length === 0 && event !== "workflow_dispatch")
  )
    throw new Error("No complete changed-path set");
  paths.forEach(assertPath);
  const plan = {
    version: 1,
    event,
    paths: [...new Set(paths)].sort(),
    lightweight: true,
    web: false,
    cms: false,
    contracts: false,
    apple: false,
    scope: "none",
  };
  const unknown = [];
  for (const file of plan.paths) {
    // Runtime prototype/design assets retain Web checks, including their docs.
    if (
      file.startsWith("docs/prototypes/") ||
      file.startsWith("docs/design-system/")
    ) {
      plan.web = true;
    } else if (
      docs.has(file) ||
      tooling.has(file) ||
      file.startsWith(".github/workflows/") ||
      file.startsWith(".agents/") ||
      file.startsWith(".githooks/") ||
      /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/u.test(file) ||
      (/\.md$/u.test(file) &&
        /^(?:docs|apps\/apple|apps\/web|apps\/admin|packages|services)\//u.test(
          file,
        ))
    ) {
      // Documentation, instruction imports and workflow tooling have real lightweight checks.
    } else if (file.startsWith("apps/apple/")) {
      plan.apple = true;
    } else if (publicBoundary(file)) {
      plan.contracts = true;
    } else if (
      webConfig.has(file) ||
      webRoots.some((prefix) => file.startsWith(prefix)) ||
      file.startsWith("packages/contracts/src/internal/") ||
      file.startsWith("scripts/editorial/") ||
      /^scripts\/(?:migrate(?:-community)?|generate-catalog-import-template|confidentiality-scan(?:\.test)?|install-confidentiality-hooks)\.mjs$/u.test(
        file,
      )
    ) {
      plan.web = true;
      if (
        file.startsWith("apps/admin/") ||
        file.startsWith("tests/cms/") ||
        file.startsWith("scripts/editorial/") ||
        /^packages\/contracts\/src\/internal\/(?:editorial|community-operator)(?:[/.]|$)/u.test(
          file,
        ) ||
        webConfig.has(file)
      )
        plan.cms = true;
    } else unknown.push(file);
  }
  if (unknown.length)
    throw new Error(
      `Unmapped changed paths; extend the scoped routing with tests: ${JSON.stringify(unknown)}`,
    );
  if (event === "workflow_dispatch") {
    // Existing explicitly requested Web release regression; never starts Apple implicitly.
    plan.web = true;
    plan.cms = true;
    plan.contracts = true;
    plan.scope = "full";
  } else if (plan.web) plan.scope = "smoke";
  return plan;
}

export const runGit = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10_000,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
  });

export function nulPaths(value, allowEmpty = false) {
  if (value === "" && allowEmpty) return [];
  if (typeof value !== "string" || !value.endsWith("\0"))
    throw new Error("Missing complete NUL-delimited diff");
  const paths = value.slice(0, -1).split("\0");
  paths.forEach(assertPath);
  return paths;
}

export function changedPaths(event, base, head, git = runGit) {
  if (
    !["pull_request", "push", "local"].includes(event) ||
    ![base, head].every(
      (sha) =>
        typeof sha === "string" &&
        /^[a-f0-9]{40}$/u.test(sha) &&
        !/^0+$/u.test(sha),
    )
  )
    throw new Error("Invalid event or comparison SHA");
  // --no-renames includes BOTH original and destination paths, including deletes.
  // Git has no API pagination. NUL keeps spaces and non-ASCII path names intact.
  return nulPaths(
    git(
      "diff",
      "--no-renames",
      "--name-only",
      "-z",
      `${base}${event === "push" ? ".." : "..."}${head}`,
      "--",
    ),
    event === "local",
  );
}

export function localPaths(baseRef = "origin/main", git = runGit) {
  const base = git("rev-parse", "--verify", `${baseRef}^{commit}`).trim();
  const head = git("rev-parse", "HEAD").trim();
  return [
    ...new Set([
      ...changedPaths("local", base, head, git),
      ...nulPaths(
        git(
          "diff",
          "--no-renames",
          "--name-only",
          "-z",
          "--cached",
          "HEAD",
          "--",
        ),
        true,
      ),
      ...nulPaths(git("diff", "--no-renames", "--name-only", "-z", "--"), true),
      ...nulPaths(
        git("ls-files", "--others", "--exclude-standard", "-z"),
        true,
      ),
    ]),
  ];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const event = process.env.EVENT_NAME;
    const plan = classifyTask(
      event === "workflow_dispatch"
        ? []
        : changedPaths(event, process.env.BASE_SHA, process.env.HEAD_SHA),
      event,
    );
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        ["scope", "web", "cms", "contracts", "apple", "lightweight"]
          .map((key) => `${key}=${plan[key]}\n`)
          .join("") + `plan=${JSON.stringify(plan)}\n`,
      );
    }
    console.log(JSON.stringify(plan));
  } catch (error) {
    console.error(`Task classification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
