import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { classifyTask } from "./ci-task-scope.mjs";
import { assertTaskGate } from "./ci-task-gate.mjs";
import {
  FEEDBACK_LABEL,
  VERIFY_TASK_USAGE,
  formatFeedbackBanner,
  isFullAcceptance,
  parseVerifyTaskArgs,
  prepareFeedbackValidation,
  resolveFeedbackCheckpoint,
} from "./verify-task.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts/verify-task.mjs");

const fixtureGit = (t) => {
  const directory = mkdtempSync(join(tmpdir(), "verify-task-feedback-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Synthetic task fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Synthetic task fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const name of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_COMMON_DIR",
    "GIT_INDEX_FILE",
    "GIT_PREFIX",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_NAMESPACE",
  ])
    delete env[name];
  const git = (...args) =>
    execFileSync("git", ["-C", directory, ...args], {
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
  git("init", "--initial-branch=main");
  const put = (file, content = "content\n") => {
    mkdirSync(join(directory, dirname(file)), { recursive: true });
    writeFileSync(join(directory, file), content);
  };
  const commit = (message) => {
    git("add", "--all");
    git("commit", "-m", message);
    return git("rev-parse", "HEAD").trim();
  };
  return { directory, git, put, commit };
};

describe("feedback argument parsing and acceptance labeling", () => {
  it("documents feedback mode and rejects --since on other modes", () => {
    assert.match(VERIFY_TASK_USAGE, /feedback/);
    assert.deepEqual(
      parseVerifyTaskArgs([
        "--mode",
        "feedback",
        "--base",
        "origin/main",
        "--since",
        "HEAD~1",
        "--output",
        "/tmp/feedback-run",
      ]),
      {
        "--mode": "feedback",
        "--base": "origin/main",
        "--since": "HEAD~1",
        "--output": "/tmp/feedback-run",
      },
    );
    assert.throws(
      () => parseVerifyTaskArgs(["--mode", "lightweight", "--since", "HEAD"]),
      /--since is only valid with --mode feedback/,
    );
    assert.throws(() => parseVerifyTaskArgs(["--mode", "mystery"]), Error);
  });

  it("never treats feedback or a failed full run as full acceptance", () => {
    assert.equal(
      isFullAcceptance({
        result: "PASS",
        mode: "feedback",
        label: FEEDBACK_LABEL,
        acceptance: false,
      }),
      false,
    );
    assert.equal(
      isFullAcceptance({ result: "FAIL", mode: "actual-diff" }),
      false,
    );
    assert.equal(
      isFullAcceptance({
        result: "FAIL",
        mode: "actual-diff",
        label: FEEDBACK_LABEL,
      }),
      false,
    );
    assert.equal(
      isFullAcceptance({ result: "PASS", mode: "lightweight" }),
      false,
    );
    assert.equal(
      isFullAcceptance({ result: "PASS", mode: "actual-diff" }),
      true,
    );
    assert.match(
      formatFeedbackBanner({
        checkpoint: { sha: "abc", source: "explicit-since" },
        notes: ["example note"],
      }),
      new RegExp(`^${FEEDBACK_LABEL}`),
    );
    assert.match(formatFeedbackBanner({}), /acceptance: false/);
  });
});

describe("feedback checkpoint and dirty-tree scope", () => {
  it("covers commits after the checkpoint plus staged, unstaged and untracked files", (t) => {
    const { git, put, commit } = fixtureGit(t);
    put("README.md", "base\n");
    const baseline = commit("baseline");
    git("checkout", "-b", "task");
    put("docs/first.md", "first\n");
    const first = commit("first preview");
    put("docs/second.md", "second\n");
    commit("second preview");
    put("docs/staged.md", "staged\n");
    git("add", "docs/staged.md");
    put("README.md", "unstaged\n");
    put("docs/untracked.md", "untracked\n");
    const resolved = resolveFeedbackCheckpoint({ since: first }, git);
    assert.equal(resolved.sha, first);
    assert.equal(resolved.source, "explicit-since");
    const detail = prepareFeedbackValidation(
      { since: first, baseRef: "main" },
      git,
    );
    assert.equal(detail.label, FEEDBACK_LABEL);
    assert.equal(detail.acceptance, false);
    assert.equal(detail.substitutesForTaskGate, false);
    assert.equal(detail.mode, "feedback");
    assert.deepEqual(
      [...detail.feedbackPaths].sort(),
      [
        "README.md",
        "docs/second.md",
        "docs/staged.md",
        "docs/untracked.md",
      ].sort(),
    );
    assert.ok(detail.feedbackPaths.includes("docs/second.md"));
    assert.ok(!detail.feedbackPaths.includes("docs/first.md"));
    assert.deepEqual(
      [...detail.cumulativePaths].sort(),
      [
        "README.md",
        "docs/first.md",
        "docs/second.md",
        "docs/staged.md",
        "docs/untracked.md",
      ].sort(),
    );
    assert.match(formatFeedbackBanner(detail), new RegExp(FEEDBACK_LABEL));
    assert.notDeepEqual(detail.feedbackPlan.paths, detail.cumulativePlan.paths);
    const tipNeeds = {
      classify_e2e: { result: "success" },
      lightweight: { result: "success" },
      browser_gate: { result: "success" },
      lint: { result: "skipped" },
      typecheck: { result: "skipped" },
      test: { result: "skipped" },
      build: { result: "skipped" },
      cms: { result: "skipped" },
      contracts: { result: "skipped" },
      apple: { result: "skipped" },
    };
    assert.throws(
      () =>
        assertTaskGate(detail.feedbackPlan, tipNeeds, {
          paths: detail.cumulativePaths,
        }),
      /Tip-only or feedback plan cannot satisfy a required cumulative task gate/,
    );
    assert.throws(
      () => assertTaskGate({ ...detail.feedbackPlan, ...detail }, tipNeeds),
      /Feedback results cannot satisfy a required cumulative task gate/,
    );
    assert.ok(!isFullAcceptance({ ...detail, result: "PASS" }));
    assert.equal(baseline.length, 40);
  });

  it("defaults to the last pushed upstream commit instead of HEAD alone", (t) => {
    const { directory, git, put, commit } = fixtureGit(t);
    put("README.md", "base\n");
    commit("baseline");
    git("checkout", "-b", "task");
    put("docs/pushed.md", "pushed\n");
    const pushed = commit("pushed preview");
    const remote = mkdtempSync(join(tmpdir(), "verify-task-feedback-remote-"));
    t.after(() => rmSync(remote, { recursive: true, force: true }));
    execFileSync("git", ["init", "--bare", remote], { encoding: "utf8" });
    git("remote", "add", "origin", remote);
    git("push", "-u", "origin", "task");
    put("docs/local.md", "local commit\n");
    commit("unpushed");
    put("docs/dirty.md", "dirty\n");
    const resolved = resolveFeedbackCheckpoint({ baseRef: "main" }, git);
    assert.equal(resolved.sha, pushed);
    assert.equal(resolved.source, "upstream");
    const detail = prepareFeedbackValidation({ baseRef: "main" }, git);
    assert.deepEqual(
      [...detail.feedbackPaths].sort(),
      ["docs/dirty.md", "docs/local.md"].sort(),
    );
    assert.ok(detail.feedbackPaths.includes("docs/dirty.md"));
    assert.ok(!detail.feedbackPaths.includes("docs/pushed.md"));
    assert.equal(directory.length > 0, true);
  });

  it("reports an unresolved checkpoint or unmapped path instead of treating it as checked", (t) => {
    const { git, put, commit } = fixtureGit(t);
    put("README.md", "base\n");
    commit("baseline");
    git("checkout", "-b", "task");
    put("docs/ok.md", "ok\n");
    commit("ok");
    assert.throws(
      () => resolveFeedbackCheckpoint({ since: "definitely-missing" }, git),
      /could not be resolved; scope is not treated as checked/,
    );
    put(".cursor/rules/preview.md", "unmapped\n");
    assert.throws(
      () => prepareFeedbackValidation({ since: "HEAD", baseRef: "main" }, git),
      /not treated as checked/,
    );
    assert.throws(
      () => classifyTask([".cursor/rules/preview.md"], "local"),
      /Unmapped changed paths/,
    );
  });
});

describe("workflow guidance names the feedback command", () => {
  it("keeps the exact non-acceptance label in the shared workflow and skills", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "docs/development/task-workflow.md",
      ".agents/skills/yoyi-task/SKILL.md",
      ".agents/skills/yoyi-review/SKILL.md",
      "AGENTS.md",
    ]) {
      const text = readFileSync(join(root, file), "utf8");
      assert.match(text, new RegExp(FEEDBACK_LABEL));
    }
    assert.match(
      readFileSync(join(root, "docs/development/task-workflow.md"), "utf8"),
      /--mode feedback --base origin\/main --output/,
    );
  });
});

describe("feedback CLI user-visible label", () => {
  it("prints the non-acceptance label and fails an unresolved checkpoint without claiming a pass", () => {
    const output = join(
      mkdtempSync(join(tmpdir(), "verify-task-feedback-cli-")),
      "run",
    );
    const result = spawnSync(
      process.execPath,
      [
        script,
        "--mode",
        "feedback",
        "--since",
        "definitely-missing-ref",
        "--output",
        output,
      ],
      {
        cwd: root,
        encoding: "utf8",
        timeout: 15000,
      },
    );
    assert.notEqual(result.status, 0);
    const text = `${result.stdout}\n${result.stderr}`;
    assert.match(text, /not treated as checked/);
    assert.doesNotMatch(text, /"result":"PASS"/);
    assert.ok(!text.includes("FEEDBACK PASS"));
  });
});
