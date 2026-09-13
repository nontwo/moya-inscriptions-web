import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Disposable repositories only: a bare "origin" reached through a URL rewrite
// of the expected GitHub URL, the real core-credential hooks installed from
// this checkout, and synthetic fixtures assembled at runtime.
const source = path.dirname(fileURLToPath(import.meta.url));
const expectedOrigin = "https://github.com/nontwo/moya-inscriptions-web.git";
const token = ["gh", "p_", "Z".repeat(36)].join("");

function run(command, args, { cwd, env, input } = {}) {
  return spawnSync(command, args, {
    cwd,
    env,
    input,
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function fixture(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "task-git-synthetic-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const globalConfig = path.join(dir, "synthetic-config");
  writeFileSync(
    globalConfig,
    [
      "[user]",
      " name = Synthetic Developer",
      ` email = ${["synthetic-developer", "users.noreply.github.com"].join("@")}`,
      " useConfigOnly = true",
      "",
    ].join("\n"),
  );
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const key of Object.keys(env))
    if (
      /^GIT_(?:AUTHOR|COMMITTER|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$)/u.test(
        key,
      )
    )
      delete env[key];
  const remote = path.join(dir, "origin.git");
  const repo = path.join(dir, "repo");
  mkdirSync(path.join(repo, "scripts"), { recursive: true });
  assert.equal(
    run("git", ["init", "--bare", "-b", "main", remote], { env }).status,
    0,
  );
  const git = (...args) => run("git", args, { cwd: repo, env });
  const good = (...args) => {
    const result = git(...args);
    assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  good("init", "-b", "main");
  for (const file of ["task-git.mjs", "confidentiality-scan.mjs"])
    copyFileSync(path.join(source, file), path.join(repo, "scripts", file));
  writeFileSync(path.join(repo, "safe.txt"), "Explicit synthetic fixture.\n");
  good("add", ".");
  good("commit", "-m", "Synthetic base");
  good("remote", "add", "origin", expectedOrigin);
  good("config", `url.${remote}.insteadOf`, expectedOrigin);
  good("push", "origin", "main");
  const install = run(
    process.execPath,
    [
      path.join(source, "install-confidentiality-hooks.mjs"),
      "--confirm-current-identity-approved",
    ],
    { cwd: repo, env },
  );
  assert.equal(install.status, 0, `hook install: ${install.stderr}`);
  good("switch", "-c", "chore/synthetic-task");
  const helper = (args, options = {}) =>
    run(process.execPath, [path.join(repo, "scripts/task-git.mjs"), ...args], {
      cwd: options.cwd ?? repo,
      env: options.env ?? env,
    });
  const stage = (name, content) => {
    writeFileSync(path.join(repo, name), content);
    good("add", "--", name);
  };
  return { dir, repo, remote, env, git, good, helper, stage };
}

const refusal = (result) => {
  assert.equal(result.status, 2, result.stdout + result.stderr);
  return JSON.parse(result.stderr.trim().split("\n").at(-1)).category;
};

test("commits staged changes with the message as data and pushes the task branch without force", (t) => {
  const f = fixture(t);
  f.stage("change.txt", "Synthetic change.\n");
  const message =
    'feat: synthetic\n\nMentions --no-verify, -n, $(rm -rf /), `git push -f` and "quotes".\n';
  const committed = f.helper(["commit", "--message", message]);
  assert.equal(committed.status, 0, committed.stderr);
  const commit = JSON.parse(committed.stdout);
  assert.equal(commit.result, "PASS");
  assert.equal(commit.branch, "chore/synthetic-task");
  assert.equal(f.good("log", "-1", "--format=%B"), message.trim());

  const file = path.join(f.dir, "message.txt");
  writeFileSync(file, "docs: second synthetic commit\n");
  f.stage("second.txt", "Second.\n");
  assert.equal(f.helper(["commit", "--message-file", file]).status, 0);

  const pushed = f.helper(["push"]);
  assert.equal(pushed.status, 0, pushed.stderr);
  const head = f.good("rev-parse", "HEAD");
  assert.equal(
    run("git", ["rev-parse", "refs/heads/chore/synthetic-task"], {
      cwd: f.remote,
      env: f.env,
    }).stdout.trim(),
    head,
  );
  assert.equal(
    f.good("rev-parse", "--abbrev-ref", "@{upstream}"),
    "origin/chore/synthetic-task",
  );

  // A rewritten remote branch is never overwritten: no force, no fallback.
  f.good("commit", "--amend", "-m", "docs: rewritten locally");
  const rejected = f.helper(["push"]);
  assert.equal(rejected.status, 1);
  assert.equal(
    JSON.parse(rejected.stderr.trim().split("\n").at(-1)).category,
    "GIT_PUSH_FAILED",
  );
  assert.equal(
    run("git", ["rev-parse", "refs/heads/chore/synthetic-task"], {
      cwd: f.remote,
      env: f.env,
    }).stdout.trim(),
    head,
  );
});

test("the credential hooks still run: a blocked commit leaves no commit behind", (t) => {
  const f = fixture(t);
  const before = f.good("rev-parse", "HEAD");
  f.stage("fixture.txt", `const payload = "${token}";\n`);
  const result = f.helper(["commit", "--message", "test: synthetic"]);
  assert.equal(result.status, 1);
  assert.equal(
    JSON.parse(result.stderr.trim().split("\n").at(-1)).category,
    "GIT_COMMIT_FAILED",
  );
  assert.ok(!(result.stdout + result.stderr).includes(token));
  assert.equal(f.good("rev-parse", "HEAD"), before);

  // Hook paths injected through the environment are ignored, so the same
  // blocked content is still blocked.
  const injected = f.helper(["commit", "--message", "test: synthetic"], {
    env: {
      ...f.env,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: "/dev/null",
    },
  });
  assert.equal(injected.status, 1);
  assert.equal(f.good("rev-parse", "HEAD"), before);
});

test("refuses before writing: arguments, branch, worktree, origin, hooks and runtime", (t) => {
  const f = fixture(t);
  const head = () => f.good("rev-parse", "HEAD");
  const before = head();
  f.stage("pending.txt", "Pending.\n");

  for (const args of [
    [],
    ["push", "--force"],
    ["push", "origin", "main"],
    ["commit", "-m", "x"],
    ["commit", "--message", "x", "--no-verify"],
    ["commit", "--amend"],
    ["reset", "--hard"],
  ])
    assert.equal(refusal(f.helper(args)), "USAGE", args.join(" "));
  assert.equal(
    refusal(f.helper(["commit", "--message", "  "])),
    "MESSAGE_INVALID",
  );

  f.good("switch", "main");
  assert.equal(
    refusal(f.helper(["commit", "--message", "x"])),
    "TASK_BRANCH_REQUIRED",
  );
  assert.equal(refusal(f.helper(["push"])), "TASK_BRANCH_REQUIRED");
  f.good("switch", "--detach", "HEAD");
  assert.equal(refusal(f.helper(["push"])), "TASK_BRANCH_REQUIRED");
  f.good("switch", "chore/synthetic-task");

  const elsewhere = path.join(f.dir, "elsewhere");
  mkdirSync(elsewhere);
  assert.equal(
    run("git", ["init", "-b", "chore/other"], { cwd: elsewhere, env: f.env })
      .status,
    0,
  );
  assert.equal(
    refusal(f.helper(["push"], { cwd: elsewhere })),
    "WRONG_WORKTREE",
  );

  f.good("remote", "set-url", "origin", "https://github.com/someone/fork.git");
  assert.equal(refusal(f.helper(["push"])), "ORIGIN_MISMATCH");
  f.good("remote", "set-url", "origin", expectedOrigin);
  f.good(
    "remote",
    "set-url",
    "--push",
    "origin",
    "https://github.com/someone/fork.git",
  );
  assert.equal(refusal(f.helper(["push"])), "ORIGIN_MISMATCH");
  f.good("config", "--unset", "remote.origin.pushurl");

  const hooksPath = f.good("config", "--get", "core.hooksPath");
  f.good("config", "--unset", "core.hooksPath");
  assert.equal(
    refusal(f.helper(["commit", "--message", "x"])),
    "CREDENTIAL_HOOKS_UNVERIFIED",
  );
  f.good("config", "core.hooksPath", hooksPath);

  assert.equal(
    refusal(
      f.helper(["commit", "--message", "x"], { env: { ...f.env, PATH: "" } }),
    ),
    "GIT_UNAVAILABLE",
  );

  f.good("reset", "-q");
  assert.equal(
    refusal(f.helper(["commit", "--message", "x"])),
    "NOTHING_STAGED",
  );
  assert.equal(head(), before, "no refusal wrote a commit");
  assert.equal(
    run("git", ["for-each-ref", "--format=%(refname)", "refs/heads"], {
      cwd: f.remote,
      env: f.env,
    }).stdout.trim(),
    "refs/heads/main",
    "no refusal pushed",
  );
});
