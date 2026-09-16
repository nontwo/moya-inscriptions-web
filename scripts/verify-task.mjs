import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  writeFileSync,
  realpathSync,
  lstatSync,
  readdirSync,
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

export function scriptTests(root = process.cwd()) {
  const files = readdirSync(join(root, "scripts"))
    .filter((file) => /^[a-z-]+\.test\.mjs$/u.test(file))
    .sort()
    .map((file) => `scripts/${file}`);
  if (files.length === 0)
    throw new Error("No script tests found under scripts/");
  return files;
}

export function taskCommands(plan, output) {
  const commands = [
    // Every dependency-free script test: routing, gates, the disposable
    // test-target guard and the agent permission guard get behavioral checks
    // even when a task touches only lightweight paths. The files are
    // enumerated so a missing suite fails instead of passing vacuously.
    [process.execPath, "--test", ...scriptTests()],
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

export const FEEDBACK_LABEL = "FEEDBACK ONLY — NOT FULL ACCEPTANCE";
export const VERIFY_TASK_USAGE =
  "Usage: verify-task.mjs [--base origin/main] [--mode lightweight|contracts|feedback] [--since <ref>] --output /private/unique-run";

function tryGit(git, ...args) {
  try {
    return git(...args).trim();
  } catch {
    return null;
  }
}

export function parseVerifyTaskArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (
      !["--base", "--mode", "--output", "--since"].includes(argv[i]) ||
      !argv[i + 1] ||
      options[argv[i]]
    )
      throw new Error(VERIFY_TASK_USAGE);
    options[argv[i]] = argv[i + 1];
  }
  if (options["--since"] && options["--mode"] !== "feedback")
    throw new Error("--since is only valid with --mode feedback");
  if (
    options["--mode"] &&
    !["lightweight", "contracts", "feedback"].includes(options["--mode"])
  )
    throw new Error("Unknown validation mode");
  return options;
}

export function resolveFeedbackCheckpoint(
  { since, baseRef = "origin/main" } = {},
  git = runGit,
) {
  const notes = [];
  if (since) {
    const sha = tryGit(git, "rev-parse", "--verify", `${since}^{commit}`);
    if (!sha)
      throw new Error(
        `Feedback checkpoint --since ${since} could not be resolved; scope is not treated as checked`,
      );
    const head = tryGit(git, "rev-parse", "HEAD");
    const mergeBase = head ? tryGit(git, "merge-base", sha, head) : null;
    if (!head || mergeBase !== sha)
      throw new Error(
        `Feedback checkpoint ${since} (${sha}) is not an ancestor of HEAD; scope is not treated as checked`,
      );
    return { sha, source: "explicit-since", notes };
  }

  const head = tryGit(git, "rev-parse", "HEAD");
  if (!head)
    throw new Error(
      "HEAD could not be resolved; feedback scope is not treated as checked",
    );
  const upstream = tryGit(git, "rev-parse", "--verify", "@{upstream}^{commit}");
  if (upstream) {
    const mergeBase = tryGit(git, "merge-base", upstream, head);
    if (mergeBase === upstream)
      return { sha: upstream, source: "upstream", notes };
    notes.push(
      `Upstream ${upstream} is not an ancestor of HEAD; not used as the feedback checkpoint`,
    );
  } else {
    notes.push(
      "No upstream branch; cannot use the last pushed commit as the feedback checkpoint",
    );
  }

  const base = tryGit(git, "rev-parse", "--verify", `${baseRef}^{commit}`);
  const mergeBase = base ? tryGit(git, "merge-base", base, head) : null;
  if (!mergeBase)
    throw new Error(
      `No defensible feedback checkpoint: missing --since, no usable upstream, and ${baseRef} could not be resolved; scope is not treated as checked`,
    );
  notes.push(
    `Using merge-base with ${baseRef} as the defensible feedback checkpoint`,
  );
  return { sha: mergeBase, source: "merge-base", notes };
}

const emptyLocalPlan = {
  version: 1,
  event: "local",
  paths: [],
  lightweight: true,
  web: false,
  cms: false,
  contracts: false,
  apple: false,
  scope: "none",
};

export function prepareFeedbackValidation(
  { since, baseRef = "origin/main" } = {},
  git = runGit,
) {
  const checkpoint = resolveFeedbackCheckpoint({ since, baseRef }, git);
  const notes = [...checkpoint.notes];
  let feedbackPaths;
  try {
    feedbackPaths = localPaths(checkpoint.sha, git);
  } catch (error) {
    throw new Error(
      `Feedback scope could not be collected: ${error.message}; scope is not treated as checked`,
    );
  }

  let cumulativePaths;
  try {
    cumulativePaths = localPaths(baseRef, git);
  } catch (error) {
    throw new Error(
      `Cumulative task paths could not be collected: ${error.message}; scope is not treated as checked`,
    );
  }

  let feedbackPlan;
  if (feedbackPaths.length === 0) {
    notes.push(
      "No committed, staged, unstaged or untracked paths since the feedback checkpoint; no product delta was treated as checked",
    );
    feedbackPlan = emptyLocalPlan;
  } else {
    try {
      feedbackPlan = classifyTask(feedbackPaths, "local");
    } catch (error) {
      throw new Error(
        `Feedback scope is missing, ambiguous or unmapped: ${error.message}; scope is not treated as checked`,
      );
    }
  }

  let cumulativePlan = null;
  if (cumulativePaths.length === 0) {
    notes.push(
      "Cumulative path set since base is empty; delivery still requires a complete path set when one exists",
    );
  } else {
    try {
      cumulativePlan = classifyTask(cumulativePaths, "local");
    } catch (error) {
      throw new Error(
        `Cumulative task classification failed: ${error.message}; not treated as checked`,
      );
    }
  }

  return {
    mode: "feedback",
    label: FEEDBACK_LABEL,
    acceptance: false,
    substitutesForTaskGate: false,
    checkpoint,
    feedbackPaths,
    feedbackPlan,
    cumulativePaths,
    cumulativePlan,
    notes,
    scopeNote: FEEDBACK_LABEL,
    evidenceReuseNote:
      "Unchanged applicable evidence remains valid. Changing HEAD or the implementing tool alone does not require a full historical rerun. This feedback run does not replace a required cumulative task gate.",
  };
}

export function formatFeedbackBanner(detail) {
  const checkpoint = detail.checkpoint
    ? `${detail.checkpoint.sha} (${detail.checkpoint.source})`
    : "unresolved";
  return [
    FEEDBACK_LABEL,
    `checkpoint: ${checkpoint}`,
    `acceptance: false`,
    `substitutesForTaskGate: false`,
    ...(detail.notes ?? []).map((note) => `scope-note: ${note}`),
  ].join("\n");
}

export function isFullAcceptance(summary) {
  return (
    summary?.result === "PASS" &&
    summary?.mode === "actual-diff" &&
    summary?.acceptance !== false &&
    summary?.substitutesForTaskGate !== false &&
    summary?.label !== FEEDBACK_LABEL
  );
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
  const printed = {
    result: summary.result,
    durationMs: result.durationMs,
    budgetMs: 120000,
    output,
  };
  if (summary.mode === "feedback") {
    printed.label = FEEDBACK_LABEL;
    printed.acceptance = false;
    printed.substitutesForTaskGate = false;
  }
  console.log(JSON.stringify(printed));
  return result.code;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const options = parseVerifyTaskArgs(process.argv.slice(2));
    const root = runGit("rev-parse", "--show-toplevel").trim();
    process.chdir(root);
    let plan;
    let detail;
    if (options["--mode"] === "lightweight") {
      plan = { lightweight: true };
      detail = {
        mode: "lightweight",
        plan,
        scopeNote: "Explicit subset; not full task acceptance",
      };
    } else if (options["--mode"] === "contracts") {
      plan = { lightweight: true, contracts: true };
      detail = {
        mode: "contracts",
        plan,
        scopeNote: "Explicit subset; not full task acceptance",
      };
    } else if (options["--mode"] === "feedback") {
      detail = prepareFeedbackValidation({
        since: options["--since"],
        baseRef: options["--base"] ?? "origin/main",
      });
      plan = detail.feedbackPlan;
      console.log(formatFeedbackBanner(detail));
    } else if (options["--mode"]) throw new Error("Unknown validation mode");
    else {
      plan = classifyTask(localPaths(options["--base"]), "local");
      detail = {
        mode: "actual-diff",
        plan,
        scopeNote: "Committed, staged, unstaged and untracked union",
      };
    }
    const output = freshOutput(options["--output"], root);
    // A resumed task must not reuse another session's smoke paths or identity.
    Object.assign(
      process.env,
      validationEnvironment(output, runGit("rev-parse", "HEAD").trim()),
    );
    process.exitCode = await validate(
      taskCommands(plan, output),
      output,
      detail,
    );
  } catch (error) {
    console.error(`Task validation unavailable: ${error.message}`);
    process.exitCode = 1;
  }
}
