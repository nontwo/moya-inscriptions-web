import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
  realpathSync,
  lstatSync,
  readFileSync,
  readlinkSync,
} from "node:fs";
import {
  resolve,
  relative,
  isAbsolute,
  join,
  dirname,
  basename,
} from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { runWithinBudget } from "./verify.mjs";
import {
  classifyTask,
  localPaths,
  runGit,
  nulPaths,
} from "./ci-task-scope.mjs";

export function freshOutput(value, root = process.cwd()) {
  if (!value || !isAbsolute(value))
    throw new Error(
      "An absolute, unique private --output directory is required",
    );
  const output = join(realpathSync(dirname(resolve(value))), basename(value));
  const rel = relative(realpathSync(root), output);
  if (rel === "" || (!rel.startsWith("../") && !isAbsolute(rel)))
    throw new Error("Validation output must be outside this worktree");
  if (existsSync(output))
    throw new Error("Output already exists; do not overwrite another run");
  mkdirSync(output, { mode: 0o700 });
  return output;
}

export const contractCommands = () => [
  [
    "pnpm",
    "exec",
    "turbo",
    "run",
    "build",
    "--filter=@moya/backend-production...",
    "--filter=@moya/catalog-importer...",
    "--no-daemon",
  ],
  [
    "pnpm",
    "--filter",
    "@moya/tests",
    "exec",
    "vitest",
    "run",
    "unit/contracts",
    "unit/backend/openapi-contract.test.ts",
    "unit/backend/catalog-http.test.ts",
    "unit/backend/community-http.test.ts",
    "unit/backend/community-comment-http.test.ts",
    "unit/backend/search-v1-http.test.ts",
  ],
  ["pnpm", "--filter", "web", "exec", "vitest", "run", "lib/public-api"],
];

export function taskCommands(plan, output) {
  const commands = [
    [process.execPath, "--test", "scripts/task-validation.test.mjs"],
  ];
  if (plan.contracts) commands.push(...contractCommands());
  if (plan.web) commands.push([process.execPath, "scripts/verify.mjs"]);
  if (plan.cms)
    commands.push(["pnpm", "test:cms"], ["pnpm", "test:cms:browser"]);
  if (plan.apple)
    commands.push([
      process.execPath,
      "scripts/verify-apple.mjs",
      "--output",
      join(output, "apple"),
    ]);
  return commands;
}

export function validationEnvironment(output, head, env = process.env) {
  return {
    ...env,
    MOYA_E2E_ARTIFACT_DIR: join(output, "web-smoke"),
    MOYA_E2E_SOURCE_HEAD: head,
    ...(env.GITHUB_ACTIONS === "true"
      ? {}
      : {
          GITHUB_RUN_ID: `local-${Date.now()}-${process.pid}`,
          GITHUB_RUN_ATTEMPT: "1",
        }),
  };
}

export function workspaceFingerprint(git = runGit) {
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const root = git("rev-parse", "--show-toplevel").trim();
  const untracked = nulPaths(
    git("ls-files", "--others", "--exclude-standard", "-z"),
    true,
  )
    .sort()
    .map((file) => {
      const path = join(root, file),
        info = lstatSync(path);
      return {
        file,
        mode: info.mode,
        sha256: hash(
          info.isSymbolicLink() ? readlinkSync(path) : readFileSync(path),
        ),
      };
    });
  return {
    head: git("rev-parse", "HEAD").trim(),
    stagedDiffSha256: hash(git("diff", "--cached", "--binary", "HEAD", "--")),
    workingDiffSha256: hash(git("diff", "--binary", "--")),
    untracked,
  };
}

export async function validate(
  commands,
  output,
  detail = {},
  budgetMs = 119000,
) {
  const before = workspaceFingerprint();
  const fd = openSync(join(output, "validation.private.log"), "wx", 0o600);
  let result;
  try {
    result = await runWithinBudget(commands, {
      budgetMs,
      stdio: ["ignore", fd, fd],
    });
  } finally {
    closeSync(fd);
  }
  const after = workspaceFingerprint();
  const contentUnchanged = JSON.stringify(before) === JSON.stringify(after);
  if (!contentUnchanged) result.code = 1;
  const summary = {
    ...detail,
    ...result,
    budgetMs: 120000,
    result:
      result.code === 0
        ? "PASS"
        : result.code === 124
          ? "TIME_BUDGET_EXCEEDED"
          : "FAIL",
    commands,
    head: runGit("rev-parse", "HEAD").trim(),
    checkoutTree: runGit("rev-parse", "HEAD^{tree}").trim(),
    contentBefore: before,
    contentAfter: after,
    contentUnchanged,
    note: "Evidence belongs to the recorded HEAD and dirty-content fingerprints. Source drift fails acceptance. Raw logs are private, not publication attachments.",
  };
  writeFileSync(
    join(output, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      result: summary.result,
      durationMs: result.durationMs,
      budgetMs: 120000,
      output,
    }),
  );
  return result.code;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (
        !["--base", "--mode", "--output"].includes(args[i]) ||
        !args[i + 1] ||
        options[args[i]]
      )
        throw new Error(
          "Usage: verify-task.mjs [--base origin/main] [--mode lightweight|contracts] --output /private/unique-run",
        );
      options[args[i]] = args[i + 1];
    }
    const root = runGit("rev-parse", "--show-toplevel").trim();
    process.chdir(root);
    let plan;
    if (options["--mode"] === "lightweight") {
      plan = { lightweight: true };
    } else if (options["--mode"] === "contracts") {
      plan = { lightweight: true, contracts: true };
    } else if (options["--mode"]) throw new Error("Unknown validation mode");
    else plan = classifyTask(localPaths(options["--base"]), "local");
    const output = freshOutput(options["--output"], root);
    // A resumed task must not reuse another session's smoke paths or identity.
    Object.assign(
      process.env,
      validationEnvironment(output, runGit("rev-parse", "HEAD").trim()),
    );
    process.exitCode = await validate(taskCommands(plan, output), output, {
      mode: options["--mode"] ?? "actual-diff",
      plan,
      scopeNote: options["--mode"]
        ? "Explicit subset; not full task acceptance"
        : "Committed, staged, unstaged and untracked union",
    });
  } catch (error) {
    console.error(`Task validation unavailable: ${error.message}`);
    process.exitCode = 1;
  }
}
