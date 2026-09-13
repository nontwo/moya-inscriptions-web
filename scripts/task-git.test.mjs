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
import { writeOutcome } from "./task-git.mjs";

// Disposable repositories only: origin keeps the expected GitHub URL and a
// synthetic ssh transport serves a local bare repository for it (a URL
// rewrite would be refused by the helper), the real core-credential hooks are
// installed from this checkout, and synthetic fixtures are assembled at
// runtime. Other repositories use ssh URLs too, so nothing reaches a network.
const source = path.dirname(fileURLToPath(import.meta.url));
const expectedOrigin = "git@github.com:nontwo/moya-inscriptions-web.git";
const fork = "git@github.com:someone/fork.git";
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
      /^GIT_(?:AUTHOR|COMMITTER|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_|DIR$|WORK_TREE$|INDEX_FILE$|COMMON_DIR$|SSH$|SSH_COMMAND$|SSH_VARIANT$)/u.test(
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
  // Git calls the transport as `<host> "<service> '<path>'"`.
  const transport = path.join(dir, "synthetic-ssh.mjs");
  writeFileSync(
    transport,
    [
      'import { spawnSync } from "node:child_process";',
      'import process from "node:process";',
      'const [service] = process.argv.at(-1).split(" ");',
      'if (!["git-upload-pack", "git-receive-pack"].includes(service)) process.exit(1);',
      `const served = spawnSync("git", [service.slice(4), ${JSON.stringify(remote)}], { stdio: "inherit" });`,
      "process.exit(served.status ?? 1);",
      "",
    ].join("\n"),
  );
  good("config", "core.sshCommand", `"${process.execPath}" "${transport}"`);
  good("config", "ssh.variant", "simple");
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
  // Every ref on origin, tags included, with the object it names.
  const remoteRefs = () =>
    run("git", ["for-each-ref", "--format=%(refname) %(objectname)"], {
      cwd: remote,
      env,
    }).stdout.trim();
  return { dir, repo, remote, env, git, good, helper, stage, remoteRefs };
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

  f.good("remote", "set-url", "origin", fork);
  assert.equal(refusal(f.helper(["push"])), "ORIGIN_MISMATCH");
  f.good("remote", "set-url", "origin", expectedOrigin);
  f.good("remote", "set-url", "--push", "origin", fork);
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

test("reads the branch from the full HEAD ref, never from a shortened name", (t) => {
  const f = fixture(t);
  const branch = "chore/synthetic-task";

  // A tag sharing the task branch's name leaves commit and push on the branch.
  f.good("tag", branch);
  const tagged = f.good("rev-parse", `refs/tags/${branch}`);
  f.stage("tagged.txt", "Synthetic.\n");
  const committed = f.helper(["commit", "--message", "test: synthetic"]);
  assert.equal(committed.status, 0, committed.stderr);
  assert.equal(JSON.parse(committed.stdout).branch, branch);
  const head = f.good("rev-parse", `refs/heads/${branch}`);
  assert.notEqual(head, tagged);
  const pushed = f.helper(["push"]);
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.equal(JSON.parse(pushed.stdout).branch, branch);
  const published = f.remoteRefs();
  assert.ok(published.includes(`refs/heads/${branch} ${head}`), published);
  assert.equal(f.good("rev-parse", `refs/tags/${branch}`), tagged);

  // A tag named main never turns local main into a task branch.
  f.good("switch", "main");
  f.good("tag", "main");
  const main = f.good("rev-parse", "refs/heads/main");
  f.stage("main.txt", "Synthetic.\n");
  assert.equal(
    refusal(f.helper(["commit", "--message", "test: synthetic"])),
    "TASK_BRANCH_REQUIRED",
  );
  assert.equal(refusal(f.helper(["push"])), "TASK_BRANCH_REQUIRED");
  assert.equal(f.good("rev-parse", "refs/heads/main"), main);

  // HEAD pointing at a tag is not a branch, whatever its short name.
  f.good("symbolic-ref", "HEAD", `refs/tags/${branch}`);
  assert.equal(
    refusal(f.helper(["commit", "--message", "test: synthetic"])),
    "TASK_BRANCH_REQUIRED",
  );
  assert.equal(refusal(f.helper(["push"])), "TASK_BRANCH_REQUIRED");
  assert.equal(f.good("rev-parse", `refs/tags/${branch}`), tagged);
  assert.equal(f.remoteRefs(), published, "no refusal pushed");
});

test("checks origin as Git resolves it: every configured URL and every rewrite", (t) => {
  const f = fixture(t);
  const before = f.good("rev-parse", "HEAD");
  const published = f.remoteRefs();
  f.stage("pending.txt", "Pending.\n");
  const refused = (label) => {
    for (const args of [["commit", "--message", "test: synthetic"], ["push"]])
      assert.equal(refusal(f.helper(args)), "ORIGIN_MISMATCH", label);
  };

  // A second URL would push to both; the expected one is the last value.
  f.good("config", "--replace-all", "remote.origin.url", fork);
  f.good("config", "--add", "remote.origin.url", expectedOrigin);
  refused("multiple URLs");
  f.good("config", "--replace-all", "remote.origin.url", expectedOrigin);

  f.good("config", `url.${fork}.insteadOf`, expectedOrigin);
  refused("insteadOf");
  f.good("config", "--unset", `url.${fork}.insteadOf`);

  f.good("config", "--global", `url.${fork}.pushInsteadOf`, expectedOrigin);
  refused("pushInsteadOf");
  f.good("config", "--global", "--unset", `url.${fork}.pushInsteadOf`);

  assert.equal(
    f.good("rev-parse", "HEAD"),
    before,
    "no refusal wrote a commit",
  );
  assert.equal(f.remoteRefs(), published, "no refusal pushed");

  // A rewrite to another expected form of the same repository still works.
  f.good(
    "remote",
    "set-url",
    "origin",
    "https://github.com/nontwo/moya-inscriptions-web",
  );
  f.good("config", "url.git@github.com:.insteadOf", "https://github.com/");
  const committed = f.helper(["commit", "--message", "test: synthetic"]);
  assert.equal(committed.status, 0, committed.stderr);
  const pushed = f.helper(["push"]);
  assert.equal(pushed.status, 0, pushed.stderr);
  assert.ok(
    f
      .remoteRefs()
      .includes(
        `refs/heads/chore/synthetic-task ${f.good("rev-parse", "HEAD")}`,
      ),
  );
});

test("once Git is asked to write, a deadline, broken pipe or spawn error is FAILED, never a refusal", (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "task-git-synthetic-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  // Real spawn results, not hand-written objects.
  const timedOut = spawnSync(
    process.execPath,
    ["-e", "setTimeout(() => {}, 30_000)"],
    { timeout: 200, killSignal: "SIGKILL" },
  );
  assert.equal(timedOut.error?.code, "ETIMEDOUT");
  assert.deepEqual(writeOutcome(timedOut, "GIT_PUSH_FAILED"), {
    failure: "GIT_PUSH_FAILED",
  });

  // A process that exits without reading its input, as Git does when a hook
  // stops a commit before the message is read, can break the input pipe.
  const brokenPipe = spawnSync(process.execPath, ["-e", "process.exit(1)"], {
    input: "m".repeat(1024 * 1024),
  });
  assert.equal(brokenPipe.error?.code, "EPIPE");
  assert.deepEqual(writeOutcome(brokenPipe, "GIT_COMMIT_FAILED"), {
    failure: "GIT_COMMIT_FAILED",
  });

  const neverStarted = spawnSync(path.join(dir, "missing-git"), [], {
    timeout: 5_000,
  });
  assert.equal(neverStarted.error?.code, "ENOENT");
  assert.deepEqual(writeOutcome(neverStarted, "GIT_COMMIT_FAILED"), {
    failure: "GIT_COMMIT_FAILED",
  });

  const rejected = spawnSync(process.execPath, ["-e", "process.exit(1)"]);
  assert.deepEqual(writeOutcome(rejected, "GIT_PUSH_FAILED"), {
    failure: "GIT_PUSH_FAILED",
  });
  assert.equal(
    writeOutcome(spawnSync(process.execPath, ["-e", ""]), "GIT_PUSH_FAILED"),
    null,
  );
});
