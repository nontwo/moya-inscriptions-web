#!/usr/bin/env node
/**
 * Task Git helper: the only commit and push operations that project settings
 * let an agent run without a prompt. Two fixed operations:
 *
 *   node scripts/task-git.mjs commit --message-file <file>
 *   node scripts/task-git.mjs commit --message <text>
 *   node scripts/task-git.mjs push
 *
 * `commit` records the changes that are already staged; `push` publishes the
 * checked-out task branch to the same name on origin and sets its upstream.
 * Git runs from fixed argument arrays without a shell, and the message reaches
 * `git commit` on stdin as data. Before writing, the helper verifies that it
 * runs inside the repository it belongs to, that a non-main task branch
 * (refs/heads/) is checked out, that origin resolves after URL rewrites to
 * exactly this GitHub repository, and that the core-credential hooks are
 * installed and active; the hooks then run as usual. A failed check or an
 * unavailable runtime stops the operation with a REFUSED category before
 * anything is written; once Git is asked to commit or push, any failure or
 * stop is FAILED. It never falls back to raw Git. This is a guard against
 * accidental misuse, not a sandbox against a hostile agent.
 */
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import console from "node:console";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
// Each form with and without `.git`, so that a same-repository rewrite such as
// a user-level https-to-ssh `insteadOf` still resolves to an expected URL.
const EXPECTED_ORIGINS = new Set([
  "https://github.com/nontwo/moya-inscriptions-web.git",
  "https://github.com/nontwo/moya-inscriptions-web",
  "git@github.com:nontwo/moya-inscriptions-web.git",
  "git@github.com:nontwo/moya-inscriptions-web",
  "ssh://git@github.com/nontwo/moya-inscriptions-web.git",
  "ssh://git@github.com/nontwo/moya-inscriptions-web",
]);
const TASK_BRANCH =
  /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const MAX_MESSAGE_BYTES = 64 * 1024;

const REMEDY = {
  USAGE:
    "Usage: node scripts/task-git.mjs commit --message-file <file> | commit --message <text> | push",
  GIT_UNAVAILABLE:
    "Git could not be run; fix the runtime, do not use raw git instead.",
  WRONG_WORKTREE: "Run the helper from inside the task worktree it belongs to.",
  TASK_BRANCH_REQUIRED:
    "Check out the task branch (<prefix>/<slug>, never main) before committing or pushing.",
  ORIGIN_MISMATCH:
    "origin must resolve, after any URL rewrite, to exactly one nontwo/moya-inscriptions-web GitHub URL for fetch and push, without a push URL or mirror override.",
  CREDENTIAL_HOOKS_UNVERIFIED:
    "Install or repair the core-credential hooks (pnpm confidentiality:install), then retry.",
  MESSAGE_INVALID: "Provide a non-empty commit message of at most 64 KiB.",
  NOTHING_STAGED: "Stage the intended changes with git add first.",
  GIT_COMMIT_FAILED:
    "git commit failed or was stopped (for example a credential hook BLOCK or the deadline); read its output and check git status and git log before any retry.",
  GIT_PUSH_FAILED:
    "git push failed or was stopped (for example a rejected non-fast-forward or the deadline); read its output and check the remote branch before any retry. Never force.",
};

class Refusal extends Error {}

// Configuration injected through the environment could redirect hooks or the
// index; Git runs without it. Config files themselves are verified below.
function gitEnvironment() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  for (const key of Object.keys(env))
    if (
      /^GIT_(?:CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$|OBJECT_DIRECTORY$)/u.test(
        key,
      )
    )
      delete env[key];
  return env;
}

function spawn(
  command,
  args,
  { input, output = "pipe", timeout = 10_000 } = {},
) {
  return spawnSync(command, args, {
    env: gitEnvironment(),
    encoding: "utf8",
    input,
    timeout,
    killSignal: "SIGKILL",
    // Git and hook output go to stderr so stdout stays one JSON line.
    stdio: output === "stderr" ? ["pipe", 2, 2] : ["pipe", "pipe", "pipe"],
  });
}

function run(command, args, options) {
  const result = spawn(command, args, options);
  if (result.error) throw new Refusal("GIT_UNAVAILABLE");
  return result;
}

function git(args, options) {
  return run("git", args, options);
}

// A refusal promises that nothing was written, so it ends only the checks
// before a write. Once Git is asked to commit or push, every error is that
// write's failure: a deadline or a broken input pipe does not prove that
// nothing was written, and a process that never started cannot be told apart
// from one that did on every platform.
export function writeOutcome(result, failure) {
  return result.error || result.status !== 0 ? { failure } : null;
}

function gitWrite(args, failure, input) {
  const outcome = writeOutcome(
    spawn("git", args, { input, output: "stderr", timeout: 150_000 }),
    failure,
  );
  if (outcome) return outcome;
  const head = spawn("git", ["rev-parse", "HEAD"]);
  return head.error || head.status !== 0
    ? { failure }
    : { commit: head.stdout.trim() };
}

function value(args) {
  const result = git(args);
  return result.status === 0 ? result.stdout.trim() : null;
}

export function parseArguments(argv) {
  const [operation, ...rest] = argv;
  if (operation === "push" && rest.length === 0) return { operation };
  if (operation === "commit" && rest.length === 2) {
    const [flag, argument] = rest;
    if (flag === "--message") return { operation, message: argument };
    if (flag === "--message-file") return { operation, messageFile: argument };
  }
  throw new Refusal("USAGE");
}

function verifyContext() {
  const top = value(["rev-parse", "--show-toplevel"]);
  if (top === null || realpathSync(top) !== realpathSync(ROOT))
    throw new Refusal("WRONG_WORKTREE");
  // The full ref, not `--short`: a tag or other ref sharing the branch's short
  // name shortens to `heads/<name>`, and HEAD may point outside refs/heads/.
  const ref = value(["symbolic-ref", "--quiet", "HEAD"]);
  const branch = ref?.startsWith("refs/heads/")
    ? ref.slice("refs/heads/".length)
    : null;
  if (
    branch === null ||
    branch === "main" ||
    !TASK_BRANCH.test(branch) ||
    git(["check-ref-format", "--branch", branch]).status !== 0
  )
    throw new Refusal("TASK_BRANCH_REQUIRED");
  // Git's own resolution after insteadOf/pushInsteadOf rewrites, one URL per
  // line: a second configured URL makes the output a non-member of the set.
  const origin = (...mode) =>
    value(["remote", "get-url", ...mode, "--all", "origin"]);
  if (
    !EXPECTED_ORIGINS.has(origin()) ||
    !EXPECTED_ORIGINS.has(origin("--push")) ||
    value(["config", "--get", "remote.origin.pushurl"]) !== null ||
    value(["config", "--bool", "--get", "remote.origin.mirror"]) === "true"
  )
    throw new Refusal("ORIGIN_MISMATCH");
  const health = run(process.execPath, [
    join(ROOT, "scripts/confidentiality-scan.mjs"),
    "health",
  ]);
  if (health.status !== 0) throw new Refusal("CREDENTIAL_HOOKS_UNVERIFIED");
  return { branch };
}

function readMessage({ message, messageFile }) {
  let text;
  try {
    text =
      messageFile === undefined ? message : readFileSync(messageFile, "utf8");
  } catch {
    throw new Refusal("MESSAGE_INVALID");
  }
  if (
    typeof text !== "string" ||
    text.trim() === "" ||
    Buffer.byteLength(text) > MAX_MESSAGE_BYTES
  )
    throw new Refusal("MESSAGE_INVALID");
  return text;
}

export function main(argv) {
  const request = parseArguments(argv);
  const message = request.operation === "commit" ? readMessage(request) : null;
  const { branch } = verifyContext();
  if (request.operation === "commit") {
    const staged = git(["diff", "--cached", "--quiet"]).status;
    const merging =
      value(["rev-parse", "-q", "--verify", "MERGE_HEAD"]) !== null;
    if (staged === 0 && !merging) throw new Refusal("NOTHING_STAGED");
    if (staged !== 0 && staged !== 1) throw new Refusal("GIT_UNAVAILABLE");
    const outcome = gitWrite(
      ["commit", "--file=-"],
      "GIT_COMMIT_FAILED",
      message,
    );
    return outcome.failure
      ? outcome
      : { operation: "commit", branch, ...outcome };
  }
  const outcome = gitWrite(
    [
      "push",
      "--set-upstream",
      "--no-follow-tags",
      "origin",
      `refs/heads/${branch}:refs/heads/${branch}`,
    ],
    "GIT_PUSH_FAILED",
  );
  return outcome.failure ? outcome : { operation: "push", branch, ...outcome };
}

function isEntryPoint() {
  try {
    return (
      process.argv[1] !== undefined &&
      realpathSync(process.argv[1]) ===
        realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  let outcome;
  try {
    outcome = main(process.argv.slice(2));
  } catch (error) {
    const category =
      error instanceof Refusal ? error.message : "GIT_UNAVAILABLE";
    outcome = { refusal: category };
  }
  const category = outcome.refusal ?? outcome.failure;
  if (category) {
    console.error(
      JSON.stringify({
        result: outcome.refusal ? "REFUSED" : "FAILED",
        category,
        remedy: REMEDY[category],
      }),
    );
    process.exitCode = outcome.refusal ? 2 : 1;
  } else {
    console.log(JSON.stringify({ ...outcome, result: "PASS" }));
  }
}
