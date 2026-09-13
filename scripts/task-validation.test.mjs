import assert from "node:assert/strict";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertPath,
  changedPaths,
  classifyTask,
  localPaths,
  nulPaths,
} from "./ci-task-scope.mjs";
import { assertTaskGate } from "./ci-task-gate.mjs";
import { assertBrowserGate, assertSmokeReport } from "./ci-e2e-gate.mjs";
import {
  contractCommands,
  freshOutput,
  taskCommands,
  validationEnvironment,
  workspaceFingerprint,
} from "./verify-task.mjs";
import { appleCommand, assertCompatibleSdk } from "./verify-apple.mjs";
import { runWithinBudget } from "./verify.mjs";
import { discoverWorkspaces } from "../tests/unit/architecture/workspace-scanner.ts";
import { e2eProjects } from "../tests/e2e/support/e2e-report-integrity.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(join(root, file), "utf8");
const sorted = (items) => [...items].sort();
const flags = (plan) =>
  Object.fromEntries(
    ["web", "cms", "contracts", "apple", "lightweight", "scope"].map((key) => [
      key,
      plan[key],
    ]),
  );
const expectedFlags = (overrides = {}) => ({
  web: false,
  cms: false,
  contracts: false,
  apple: false,
  lightweight: true,
  scope: "none",
  ...overrides,
});
const temporary = (t) => {
  const directory = mkdtempSync(join(tmpdir(), "moya-task-validation-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};
const put = (directory, file, contents = "synthetic fixture\n") => {
  const target = join(directory, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
  return target;
};
const fixtureGit = (t) => {
  const directory = temporary(t);
  // Fixture commits are local and synthetic. They never use this checkout's
  // working tree or remotes; installed checks remain enabled.
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Synthetic task fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Synthetic task fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    GIT_TERMINAL_PROMPT: "0",
  };
  // A test invoked from a Git hook must not inherit pointers to that real index.
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
  const commit = (message) => {
    git("add", "--all");
    git("commit", "-m", message);
    return git("rev-parse", "HEAD").trim();
  };
  return { directory, git, commit };
};

describe("task routing follows the complete changed-path set", () => {
  const cases = [
    [["README.md", "docs/development/task workflow.md"], {}],
    [["CLAUDE.md", "apps/apple/AGENTS.md", "apps/apple/README.md"], {}],
    [[".github/workflows/ci.yml", "scripts/verify-task.mjs"], {}],
    [[".githooks/pre-commit", ".agents/skills/example/SKILL.md"], {}],
    [
      ["apps/apple/ArtVenn/Assets 由艺.xcassets/Contents.json"],
      { apple: true },
    ],
    [["apps/web/app/page.tsx"], { web: true, scope: "smoke" }],
    [
      ["apps/admin/src/editorial/action.ts"],
      { web: true, cms: true, scope: "smoke" },
    ],
    [["tests/cms/workflow.test.ts"], { web: true, cms: true, scope: "smoke" }],
    [["packages/contracts/src/catalog.ts"], { contracts: true }],
    [["services/public-api/src/openapi.ts"], { contracts: true }],
    [
      ["services/backend-runtime/src/community/session.ts"],
      { contracts: true },
    ],
    [["services/backend-runtime/src/community/auth.ts"], { contracts: true }],
    [
      ["packages/contracts/src/internal/editorial.ts"],
      { web: true, cms: true, scope: "smoke" },
    ],
    [
      ["packages/contracts/src/internal/editorial/contracts.ts"],
      { web: true, cms: true, scope: "smoke" },
    ],
    [
      ["packages/contracts/src/internal/community-operator.ts"],
      { web: true, cms: true, scope: "smoke" },
    ],
    [
      ["docs/prototypes/mobile-preview/README.md"],
      { web: true, scope: "smoke" },
    ],
    [["docs/design-system/assets/card.svg"], { web: true, scope: "smoke" }],
    [["pnpm-lock.yaml"], { web: true, cms: true, scope: "smoke" }],
    [
      [
        "apps/apple/ArtVenn/App.swift",
        "apps/web/app/page.tsx",
        "packages/contracts/src/catalog.ts",
      ],
      { apple: true, web: true, contracts: true, scope: "smoke" },
    ],
  ];
  for (const [paths, expected] of cases) {
    it(`routes ${paths.join(", ")}`, () => {
      for (const event of ["pull_request", "push", "local"])
        assert.deepEqual(
          flags(classifyTask(paths, event)),
          expectedFlags(expected),
        );
    });
  }

  it("does not truncate long diffs or let metadata change the selected checks", () => {
    const paths = Array.from({ length: 1000 }, (_, i) => `docs/change ${i}.md`);
    paths.push("apps/web/app/page.tsx", "docs/change 1.md");
    const plan = classifyTask(paths);
    assert.equal(plan.paths.length, 1001);
    assert.equal(plan.web, true);
    for (const metadata of [
      { tool: "Codex", author: "web", labels: ["docs"], branch: "feat/apple" },
      { tool: "Claude", author: "apple", labels: ["web"], branch: "fix/web" },
    ])
      assert.deepEqual(classifyTask(paths, "pull_request", metadata), plan);
    assert.deepEqual(classifyTask([...paths].reverse()), plan);
  });

  it("explicit dispatch retains full Web regression without requiring an absent Apple project", () => {
    assert.deepEqual(
      flags(classifyTask([], "workflow_dispatch")),
      expectedFlags({
        web: true,
        cms: true,
        contracts: true,
        scope: "full",
      }),
    );
  });

  it("rejects unknown, malformed and incomplete input instead of reporting N/A", () => {
    for (const paths of [[], null, ["unknown.ts"], ["README.md", "unknown.ts"]])
      assert.throws(() => classifyTask(paths));
    for (const file of [
      "",
      "../README.md",
      "/README.md",
      "docs//a.md",
      "docs/./a.md",
      "docs/a\nb.md",
      "docs/a\0b.md",
      "docs\\a.md",
    ])
      assert.throws(() => assertPath(file));
    assert.doesNotThrow(() => assertPath("docs/中文 notes.md"));
    assert.throws(() => classifyTask(["README.md"], "pull_request_target"));
    for (const value of ["README.md", "README.md\0\0", null])
      assert.throws(() => nulPaths(value));
    assert.throws(() => nulPaths(""));
    assert.deepEqual(nulPaths("", true), []);
    assert.deepEqual(nulPaths("docs/中文 notes.md\0"), ["docs/中文 notes.md"]);
    const valid = "a".repeat(40);
    for (const invalid of ["", "0".repeat(40), "--bad", "HEAD"])
      assert.throws(() =>
        changedPaths("push", invalid, valid, () => "README.md\0"),
      );
    assert.throws(() =>
      changedPaths("push", valid, "b".repeat(40), () => {
        throw new Error("diff unavailable");
      }),
    );
  });
});

describe("real temporary Git comparisons", () => {
  it("uses a PR merge base and the complete push span, preserving deletes and both rename paths", (t) => {
    const { directory, git, commit } = fixtureGit(t);
    const oldPath = "services/api/src/old handler.ts";
    const newPath = "docs/moved handler.md";
    put(directory, oldPath);
    put(directory, "docs/delete me.md");
    const baseline = commit("initial synthetic tree");
    git("checkout", "-b", "task");
    mkdirSync(join(directory, "docs"), { recursive: true });
    renameSync(join(directory, oldPath), join(directory, newPath));
    rmSync(join(directory, "docs/delete me.md"));
    commit("rename runtime into docs and remove a file");
    const manyDocs = Array.from(
      { length: 310 },
      (_, i) => `docs/完整 diff ${i}.md`,
    );
    for (const file of manyDocs) put(directory, file);
    put(directory, "apps/apple/ArtVenn/resource.json", "{}\n");
    const head = commit("second commit in the push span");
    git("checkout", "main");
    put(directory, "apps/admin/base-only.ts");
    const advancedBase = commit("unrelated main advance");
    const expected = sorted([
      oldPath,
      newPath,
      "docs/delete me.md",
      ...manyDocs,
      "apps/apple/ArtVenn/resource.json",
    ]);
    const pr = changedPaths("pull_request", advancedBase, head, git);
    assert.deepEqual(sorted(pr), expected);
    assert.ok(!pr.includes("apps/admin/base-only.ts"));
    assert.deepEqual(
      sorted(changedPaths("push", baseline, head, git)),
      expected,
    );
    assert.deepEqual(
      flags(classifyTask(pr)),
      expectedFlags({ web: true, apple: true, scope: "smoke" }),
    );
  });

  it("unions committed, staged, unstaged and untracked paths while excluding ignored files", (t) => {
    const { directory, git, commit } = fixtureGit(t);
    put(directory, ".gitignore", "ignored-output/\n");
    put(directory, "README.md", "before\n");
    put(directory, "apps/web/removed.ts");
    commit("local baseline");
    git("checkout", "-b", "task");
    put(directory, "services/api/committed.ts");
    commit("committed task change");
    put(directory, "packages/contracts/src/staged.ts", "staged\n");
    git("add", "packages/contracts/src/staged.ts");
    put(directory, "packages/contracts/src/staged.ts", "also unstaged\n");
    put(directory, "README.md", "unstaged\n");
    rmSync(join(directory, "apps/web/removed.ts"));
    put(directory, "apps/apple/ArtVenn/untracked 文件.json", "{}\n");
    put(directory, "ignored-output/noise.txt");
    const paths = localPaths("main", git);
    assert.deepEqual(
      sorted(paths),
      sorted([
        "services/api/committed.ts",
        "packages/contracts/src/staged.ts",
        "README.md",
        "apps/web/removed.ts",
        "apps/apple/ArtVenn/untracked 文件.json",
      ]),
    );
    assert.deepEqual(
      flags(classifyTask(paths, "local")),
      expectedFlags({
        web: true,
        contracts: true,
        apple: true,
        scope: "smoke",
      }),
    );
  });
});

const expectedNeeds = (plan) => ({
  classify_e2e: { result: "success" },
  lightweight: { result: "success" },
  browser_gate: { result: "success" },
  ...Object.fromEntries(
    Object.entries({
      lint: plan.web,
      typecheck: plan.web,
      test: plan.web,
      build: plan.web,
      cms: plan.cms,
      contracts: plan.contracts,
      apple: plan.apple,
    }).map(([job, applies]) => [
      job,
      { result: applies ? "success" : "skipped" },
    ]),
  ),
});

describe("stable task and browser gates", () => {
  it("rejects every non-success or missing required job, including classifier and browser aggregation", () => {
    const plan = classifyTask([
      "apps/admin/src/action.ts",
      "apps/apple/App.swift",
      "packages/contracts/src/catalog.ts",
    ]);
    const needs = expectedNeeds(plan);
    assert.match(assertTaskGate(plan, needs), /executed successfully/);
    for (const job of Object.keys(needs)) {
      for (const result of [
        "failure",
        "cancelled",
        "timed_out",
        "timeout",
        "skipped",
        "",
      ]) {
        assert.throws(
          () => assertTaskGate(plan, { ...needs, [job]: { result } }),
          job,
        );
      }
      const missing = { ...needs };
      delete missing[job];
      assert.throws(() => assertTaskGate(plan, missing), job);
    }
  });

  it("accepts N/A only as skipped and rejects inconsistent or forged plans", () => {
    const plan = classifyTask(["README.md"]);
    const needs = expectedNeeds(plan);
    assert.match(assertTaskGate(plan, needs), /apple: N\/A \(not run\)/);
    for (const [job, value] of Object.entries(needs)) {
      if (value.result !== "skipped") continue;
      for (const result of [
        "success",
        "failure",
        "cancelled",
        "timed_out",
        "",
      ]) {
        assert.throws(
          () => assertTaskGate(plan, { ...needs, [job]: { result } }),
          job,
        );
      }
      const missing = { ...needs };
      delete missing[job];
      assert.throws(() => assertTaskGate(plan, missing));
    }
    for (const invalid of [
      null,
      { ...plan, web: true },
      { ...plan, version: 2 },
      { ...plan, paths: ["apps/web/page.tsx"] },
    ])
      assert.throws(() => assertTaskGate(invalid, needs));
  });

  it("preserves browser N/A, explicit regression and actual native smoke evidence", () => {
    assert.match(
      assertBrowserGate("none", "success", "skipped", "skipped"),
      /NOT RUN/,
    );
    assert.doesNotThrow(() =>
      assertBrowserGate("full", "success", "skipped", "success"),
    );
    for (const result of ["failure", "cancelled", "skipped", ""]) {
      assert.throws(() =>
        assertBrowserGate("smoke", "success", result, "skipped"),
      );
      assert.throws(() =>
        assertBrowserGate("full", "success", "skipped", result),
      );
    }
    assert.throws(() =>
      assertBrowserGate("unknown", "success", "skipped", "skipped"),
    );
    const identity = {
      sourceHead: "source",
      checkoutSha: "checkout",
      tree: "tree",
      runId: "run",
      runAttempt: "1",
    };
    const report = (planned = false) => ({
      config: {
        metadata: { moyaCI: { ...identity } },
        workers: 1,
        fullyParallel: false,
        failOnFlakyTests: true,
        shard: null,
      },
      suites: [
        {
          title: "formal-web.spec.ts",
          suites: [],
          specs: [
            {
              title: "Formal root",
              file: "formal-web.spec.ts",
              tests: [
                {
                  projectName: "desktop-chromium",
                  expectedStatus: "passed",
                  status: planned ? "skipped" : "expected",
                  results: planned
                    ? []
                    : [{ retry: 0, status: "passed", errors: [] }],
                },
              ],
            },
          ],
        },
      ],
      errors: [],
      stats: {
        expected: planned ? 0 : 1,
        skipped: planned ? 1 : 0,
        unexpected: 0,
        flaky: 0,
      },
    });
    assert.deepEqual(assertSmokeReport(report(true), report(), identity), {
      passed: 1,
      skipped: 0,
      total: 1,
      retries: 0,
    });
    for (const state of ["skipped", "failed", "timedOut", "interrupted"]) {
      const failed = report();
      failed.suites[0].specs[0].tests[0].results[0].status = state;
      assert.throws(() => assertSmokeReport(report(true), failed, identity));
    }
    assert.throws(() =>
      assertSmokeReport(report(true), report(true), identity),
    );
    assert.throws(() =>
      assertSmokeReport(report(true), { ...report(), suites: [] }, identity),
    );
    assert.throws(() =>
      assertSmokeReport(report(true), report(), { ...identity, tree: "other" }),
    );
    const retried = report();
    retried.suites[0].specs[0].tests[0].results.push({
      retry: 1,
      status: "passed",
      errors: [],
    });
    assert.throws(() => assertSmokeReport(report(true), retried, identity));
  });
});

// Inspect job boundaries and their declarative wiring without adding a YAML
// dependency or running any workflow command. Runtime gate behavior is above.
const workflowJobs = () => {
  const workflow = read(".github/workflows/ci.yml");
  const body = workflow.slice(workflow.indexOf("\njobs:\n") + 7);
  const matches = [...body.matchAll(/^  ([\w-]+):\s*$/gm)];
  return {
    workflow,
    jobs: new Map(
      matches.map((match, i) => [
        match[1],
        body.slice(match.index, matches[i + 1]?.index),
      ]),
    ),
  };
};
const jobNeeds = (body) => {
  const line = body.match(/^    needs:[ \t]*(.*)$/m)?.[1] ?? "";
  if (line.startsWith("["))
    return line
      .slice(1, line.indexOf("]"))
      .split(",")
      .map((item) => item.trim());
  if (line) return [line.trim()];
  return [
    ...(
      body.match(/^    needs:\n((?:      - [\w-]+\n)+)/m)?.[1] ?? ""
    ).matchAll(/- ([\w-]+)/g),
  ].map((match) => match[1]);
};

describe("the real CI wiring preserves required-check closure", () => {
  it("keeps every selected job reachable from the stable e2e gate", () => {
    const { workflow, jobs } = workflowJobs();
    const all = classifyTask([
      "apps/admin/src/action.ts",
      "apps/apple/App.swift",
      "packages/contracts/src/catalog.ts",
    ]);
    assert.deepEqual(
      sorted(jobNeeds(jobs.get("e2e"))),
      sorted(Object.keys(expectedNeeds(all))),
    );
    for (const gate of ["e2e", "browser_gate"])
      assert.match(jobs.get(gate), /^    if:.*always\(\)/m);
    const visiting = new Set();
    const visited = new Set();
    const visit = (job) => {
      assert.ok(jobs.has(job), `missing job ${job}`);
      assert.ok(!visiting.has(job), `dependency cycle at ${job}`);
      if (visited.has(job)) return;
      visiting.add(job);
      for (const dependency of jobNeeds(jobs.get(job))) visit(dependency);
      visiting.delete(job);
      visited.add(job);
    };
    visit("e2e");
    assert.deepEqual(sorted(visited), sorted(jobs.keys()));
    for (const [job, output] of Object.entries({
      lightweight: "lightweight",
      contracts: "contracts",
      apple: "apple",
      cms: "cms",
      lint: "web",
      typecheck: "web",
      test: "web",
      build: "web",
    })) {
      assert.deepEqual(jobNeeds(jobs.get(job)), ["classify_e2e"]);
      assert.match(
        jobs.get(job),
        new RegExp(
          `^    if:.*needs\\.classify_e2e\\.outputs\\.${output} == 'true'`,
          "m",
        ),
      );
    }
    assert.match(jobs.get("e2e"), /NEEDS_JSON:.*toJSON\(needs\)/);
    assert.match(jobs.get("e2e"), /PLAN:.*needs\.classify_e2e\.outputs\.plan/);
    assert.match(jobs.get("e2e"), /node scripts\/ci-task-gate\.mjs/);
    assert.match(jobs.get("classify_e2e"), /fetch-depth: 0/);
    assert.match(jobs.get("classify_e2e"), /node scripts\/ci-task-scope\.mjs/);
    assert.match(workflow, /github\.workflow/);
    assert.match(workflow, /github\.event_name/);
    assert.match(workflow, /github\.ref/);
    assert.match(
      workflow,
      /github\.event\.pull_request\.number \|\| github\.run_id/,
    );
    assert.match(
      workflow,
      /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
    );
    assert.doesNotMatch(
      workflow,
      /^\s*(?:paths|paths-ignore|pull_request_target|continue-on-error):/m,
    );
  });

  it("retains existing smoke/full jobs, five projects, native reports and the compatible Apple runner", () => {
    const { workflow, jobs } = workflowJobs();
    assert.deepEqual(jobNeeds(jobs.get("browser_gate")), [
      "classify_e2e",
      "e2e_smoke",
      "e2e-shards",
    ]);
    assert.match(jobs.get("browser_gate"), /name: browser-gate/);
    assert.match(
      jobs.get("browser_gate"),
      /node scripts\/ci-e2e-gate\.mjs gate/,
    );
    assert.match(
      jobs.get("browser_gate"),
      /node tests\/e2e\/support\/e2e-ci\.mjs merge/,
    );
    for (const [job, scope] of [
      ["e2e_smoke", "smoke"],
      ["e2e-shards", "full"],
    ])
      assert.match(jobs.get(job), new RegExp(`outputs\\.scope == '${scope}'`));
    assert.match(jobs.get("e2e-shards"), /shard: \[1, 2, 3\]/);
    assert.match(jobs.get("e2e-shards"), /timeout-minutes: 30/);
    assert.match(jobs.get("e2e-shards"), /timeout-minutes: 22/);
    for (const mode of ["prepare", "run"])
      assert.ok(
        jobs
          .get("e2e-shards")
          .includes(`node tests/e2e/support/e2e-ci.mjs ${mode}`),
      );
    for (const mode of ["lint", "typecheck", "test", "build", "e2e"])
      assert.ok(workflow.includes(`node scripts/verify.mjs ${mode}`));
    assert.deepEqual(e2eProjects, [
      "desktop-chromium",
      "desktop-webkit",
      "mobile-webkit",
      "tablet-webkit",
      "tablet-landscape-webkit",
    ]);
    assert.match(jobs.get("apple"), /runs-on: macos-26/);
    assert.match(
      jobs.get("apple"),
      /DEVELOPER_DIR: \/Applications\/Xcode_26\.6\.app\/Contents\/Developer/,
    );
    assert.match(jobs.get("apple"), /node scripts\/verify-apple\.mjs/);
    assert.doesNotMatch(
      jobs.get("apple"),
      /pnpm install|continue-on-error|--build-only/,
    );
    for (const job of ["lightweight", "contracts", "apple"])
      assert.match(jobs.get(job), /if-no-files-found: error/);
  });
});

describe("instructions and JS workspace boundaries support either tool", () => {
  it("resolves root and Apple instruction imports with no cycles or ownership split", () => {
    const visited = new Set();
    const visit = (file, stack = new Set()) => {
      const absolute = resolve(root, file);
      assert.ok(
        !relative(root, absolute).startsWith(".."),
        "instruction escapes repository",
      );
      assert.ok(!stack.has(absolute), `instruction import cycle: ${file}`);
      if (visited.has(absolute)) return;
      const source = readFileSync(absolute, "utf8");
      const next = new Set([...stack, absolute]);
      for (const [, target] of source.matchAll(/^@([^\s]+)\s*$/gm))
        visit(relative(root, resolve(dirname(absolute), target)), next);
      visited.add(absolute);
    };
    visit("CLAUDE.md");
    visit("apps/apple/CLAUDE.md");
    for (const file of ["AGENTS.md", "apps/apple/AGENTS.md"])
      assert.ok(
        visited.has(resolve(root, file)),
        `missing shared authority ${file}`,
      );
    const authority = read("AGENTS.md");
    assert.match(authority, /apps\/apple\/AGENTS\.md/);
    assert.match(authority, /Codex and\s+Claude Code may each implement/);
    assert.match(authority, /one writer at a time/);
    const instructions = [
      authority,
      read("CLAUDE.md"),
      read("apps/apple/AGENTS.md"),
      read("apps/apple/CLAUDE.md"),
      read("docs/development/task-workflow.md"),
    ].join("\n");
    assert.doesNotMatch(
      instructions,
      /(?:Codex|Claude(?: Code)?)\s+(?:must\s+|should\s+)?(?:only|exclusively)\s+(?:handle|own|implement|work on)\s+(?:Apple|Web)/i,
    );
    assert.match(
      read("apps/apple/AGENTS.md"),
      /no API consumer|no such\s+consumer/i,
    );
  });

  it("excludes native Apple formatting/lint but retains the Web roots", () => {
    const ignored = read(".prettierignore")
      .split(/\r?\n/)
      .map((line) => line.trim());
    assert.ok(
      ignored.some((line) =>
        /^(?:\/|\*\*\/)?apps\/apple(?:\/\*\*|\/)?$/.test(line),
      ),
    );
    assert.ok(
      !ignored.some((line) => /^(?:\/)?apps(?:\/\*\*|\/)?$/.test(line)),
    );
    const globalIgnores = read("eslint.config.mjs").match(
      /ignores:\s*\[([\s\S]*?)\]/,
    )?.[1];
    assert.match(globalIgnores, /["'](?:\*\*\/)?apps\/apple\/\*\*["']/);
    assert.doesNotMatch(globalIgnores, /["']apps\/\*\*["']/);
  });

  it("discovers JS workspaces with Apple absent or present, and retains other manifest failures", async (t) => {
    const directory = temporary(t);
    for (const workspace of [
      "tests",
      "apps/web",
      "packages/contracts",
      "services/api",
      "services/apple",
    ])
      put(
        directory,
        `${workspace}/package.json`,
        JSON.stringify({ name: workspace }),
      );
    put(directory, "apps/web/src/index.ts", "export const value = 1;\n");
    const before = await discoverWorkspaces(directory);
    assert.deepEqual(
      sorted(before.map((workspace) => workspace.manifest.name)),
      [
        "apps/web",
        "packages/contracts",
        "services/api",
        "services/apple",
        "tests",
      ],
    );
    put(
      directory,
      "apps/apple/package.json",
      "Native project: not a JS manifest",
    );
    const after = await discoverWorkspaces(directory);
    assert.deepEqual(after, before);
    mkdirSync(join(directory, "apps/unexpected"));
    await assert.rejects(discoverWorkspaces(directory), { code: "ENOENT" });
    rmSync(join(directory, "apps/unexpected"), { recursive: true });
    mkdirSync(join(directory, "packages/apple"));
    await assert.rejects(discoverWorkspaces(directory), { code: "ENOENT" });
  });
});

describe("scoped validation commands and private output", () => {
  it("uses one deadline for a sequence and never starts work after timeout", async (t) => {
    const directory = temporary(t);
    const first = join(directory, "first.txt");
    const after = join(directory, "must-not-run.txt");
    const write = (file) => [
      process.execPath,
      "-e",
      "require('node:fs').writeFileSync(process.argv[1], 'done')",
      file,
    ];
    const result = await runWithinBudget(
      [
        write(first),
        [
          process.execPath,
          "-e",
          "process.on('SIGINT', () => {}); setInterval(() => {}, 1000)",
        ],
        write(after),
      ],
      { budgetMs: 1000, graceMs: 100, stdio: "ignore" },
    );
    assert.equal(result.code, 124);
    assert.ok(
      result.durationMs >= 900 && result.durationMs < 3000,
      `unexpected deadline ${result.durationMs}ms`,
    );
    assert.ok(existsSync(first));
    assert.ok(!existsSync(after));
  });

  it("allows a child to finish bounded cleanup on explicit cancellation", async (t) => {
    const directory = temporary(t);
    const ready = join(directory, "ready"),
      cleaned = join(directory, "cleaned");
    const childCode = `const fs=require('node:fs');process.on('SIGINT',()=>setTimeout(()=>{fs.writeFileSync(process.argv[2],'cleaned');process.exit(0)},100));fs.writeFileSync(process.argv[1],'ready');setInterval(()=>{},1000);`;
    const driver = `import {runWithinBudget} from ${JSON.stringify(new URL("./verify.mjs", import.meta.url).href)}; const r=await runWithinBudget([[process.execPath,'-e',${JSON.stringify(childCode)},${JSON.stringify(ready)},${JSON.stringify(cleaned)}]],{budgetMs:3000,graceMs:500,stdio:'ignore'});process.exitCode=r.code;`;
    const wrapper = spawn(
      process.execPath,
      ["--input-type=module", "-e", driver],
      { stdio: "ignore" },
    );
    t.after(() => {
      try {
        wrapper.kill("SIGKILL");
      } catch {}
    });
    const exited = new Promise((accept) =>
      wrapper.once("exit", (code) => accept(code)),
    );
    const start = Date.now();
    while (!existsSync(ready) && Date.now() - start < 2000)
      await new Promise((accept) => setTimeout(accept, 10));
    assert.ok(existsSync(ready));
    wrapper.kill("SIGTERM");
    assert.equal(await exited, 130);
    assert.ok(existsSync(cleaned));
    assert.ok(Date.now() - start < 2500);
  });

  it("fingerprints changed untracked bytes as well as staged and unstaged versions", (t) => {
    const fixture = fixtureGit(t);
    put(fixture.directory, "README.md");
    fixture.commit("Synthetic fingerprint baseline");
    put(fixture.directory, "new.md", "first");
    const before = workspaceFingerprint(fixture.git);
    put(fixture.directory, "new.md", "other");
    const after = workspaceFingerprint(fixture.git);
    assert.notDeepEqual(before.untracked, after.untracked);
    assert.equal(before.stagedDiffSha256, after.stagedDiffSha256);
    assert.equal(before.workingDiffSha256, after.workingDiffSha256);
  });

  it("reserves outer cancellation grace for nested validator cleanup despite repeated signals", async (t) => {
    const directory = temporary(t);
    const ready = join(directory, "nested-ready"),
      cleaned = join(directory, "nested-cleaned");
    const moduleUrl = new URL("./verify.mjs", import.meta.url).href;
    const grandchild = `require('node:fs').writeFileSync(process.argv[1],'ready');process.on('SIGINT',()=>{});setInterval(()=>{},1000);`;
    const inner = `import {runWithinBudget} from ${JSON.stringify(moduleUrl)};import {writeFileSync} from 'node:fs';const r=await runWithinBudget([[process.execPath,'-e',${JSON.stringify(grandchild)},${JSON.stringify(ready)}]],{budgetMs:3000,graceMs:100,stdio:'ignore'});await new Promise(r=>setTimeout(r,250));writeFileSync(${JSON.stringify(cleaned)},'cleaned');process.exitCode=r.code;`;
    const outer = `import {runWithinBudget} from ${JSON.stringify(moduleUrl)};const r=await runWithinBudget([[process.execPath,'--input-type=module','-e',${JSON.stringify(inner)}]],{budgetMs:4000,graceMs:700,stdio:'ignore'});process.exitCode=r.code;`;
    const wrapper = spawn(
      process.execPath,
      ["--input-type=module", "-e", outer],
      { stdio: "ignore" },
    );
    t.after(() => {
      try {
        wrapper.kill("SIGKILL");
      } catch {}
    });
    const exited = new Promise((accept) =>
      wrapper.once("exit", (code) => accept(code)),
    );
    const start = Date.now();
    while (!existsSync(ready) && Date.now() - start < 2000)
      await new Promise((accept) => setTimeout(accept, 10));
    assert.ok(existsSync(ready));
    wrapper.kill("SIGTERM");
    await new Promise((accept) => setTimeout(accept, 40));
    wrapper.kill("SIGTERM");
    assert.equal(await exited, 130);
    assert.ok(existsSync(cleaned));
    assert.ok(Date.now() - start < 3000);
  });

  it("does not select product suites for docs or workflow-only work", () => {
    for (const paths of [["README.md"], [".github/workflows/ci.yml"]]) {
      const commands = taskCommands(
        classifyTask(paths),
        "/private/synthetic-output",
      );
      assert.ok(
        commands.some((command) =>
          command.includes("scripts/task-validation.test.mjs"),
        ),
      );
      assert.doesNotMatch(
        commands.map((command) => command.join(" ")).join("\n"),
        /scripts\/verify\.mjs|verify-apple|test:cms|test:postgres|playwright|turbo run (?:build|test)/,
      );
    }
    const apple = taskCommands(
      classifyTask(["apps/apple/App.swift"]),
      "/private/synthetic-output",
    );
    assert.ok(
      apple.some((command) => command.includes("scripts/verify-apple.mjs")),
    );
    assert.doesNotMatch(
      apple.map((command) => command.join(" ")).join("\n"),
      /pnpm (?:verify|install)|scripts\/verify\.mjs|test:cms|test:postgres|playwright/,
    );
  });

  it("keeps shared contract checks focused on existing contract and client seams", () => {
    const commands = contractCommands();
    const text = commands.map((command) => command.join(" ")).join("\n");
    for (const target of [
      "unit/contracts",
      "unit/backend/openapi-contract.test.ts",
      "unit/backend/community-http.test.ts",
      "lib/public-api",
    ])
      assert.ok(
        text.includes(target),
        `missing existing contract seam ${target}`,
      );
    assert.doesNotMatch(
      text,
      /test:cms|test:postgres|playwright|xcodebuild|verify-apple|scripts\/verify\.mjs/,
    );
    // tests depends on Admin for source imports. This transitive build selector
    // would unintentionally build the full Admin application for a contract task.
    assert.doesNotMatch(
      text,
      /--filter=@moya\/tests\^\.\.\.|--filter=admin(?:\s|$)/,
    );
  });

  it("allocates a unique private directory outside the worktree without overwriting", (t) => {
    const directory = temporary(t);
    const worktree = join(directory, "worktree");
    mkdirSync(worktree);
    assert.throws(() => freshOutput("relative", worktree));
    assert.throws(() => freshOutput(worktree, worktree));
    assert.throws(() => freshOutput(join(worktree, "output"), worktree));
    const output = freshOutput(join(directory, "evidence"), worktree);
    assert.equal(statSync(output).mode & 0o777, 0o700);
    put(output, "sentinel.txt", "preserve\n");
    assert.throws(() => freshOutput(output, worktree));
    assert.equal(
      readFileSync(join(output, "sentinel.txt"), "utf8"),
      "preserve\n",
    );
    assert.ok(!existsSync(join(worktree, "output")));
    const alias = join(directory, "alias");
    symlinkSync(worktree, alias, "dir");
    assert.throws(() => freshOutput(join(alias, "output"), worktree));
  });

  it("binds browser output and source identity to the new task", () => {
    const env = validationEnvironment("/private/new-run", "current-head", {
      MOYA_E2E_ARTIFACT_DIR: "/private/other-task",
      MOYA_E2E_SOURCE_HEAD: "old-head",
      GITHUB_RUN_ID: "stale",
      GITHUB_RUN_ATTEMPT: "7",
    });
    assert.equal(env.MOYA_E2E_ARTIFACT_DIR, "/private/new-run/web-smoke");
    assert.equal(env.MOYA_E2E_SOURCE_HEAD, "current-head");
    assert.notEqual(env.GITHUB_RUN_ID, "stale");
    assert.equal(env.GITHUB_RUN_ATTEMPT, "1");
  });

  it("reports an absent Apple project without starting Xcode or claiming success", (t) => {
    const fixture = fixtureGit(t);
    put(fixture.directory, "README.md");
    fixture.commit("Synthetic empty Apple baseline");
    const output = join(temporary(t), "apple-result");
    const result = spawnSync(
      process.execPath,
      [join(root, "scripts/verify-apple.mjs"), "--output", output],
      {
        cwd: fixture.directory,
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(result.status, 1);
    const summary = JSON.parse(
      readFileSync(join(output, "summary.json"), "utf8"),
    );
    assert.equal(summary.result, "NOT_TESTED");
    assert.equal(summary.reason, "APPLE_PROJECT_ABSENT_BOOTSTRAP_PENDING");
    assert.equal(summary.cleanup, "complete");
    assert.ok(!existsSync(join(output, "DerivedData")));
  });

  it("rejects incompatible SDKs and uses unsigned simulator build/test commands", () => {
    const project =
      "IPHONEOS_DEPLOYMENT_TARGET = 26.5;\nIPHONEOS_DEPLOYMENT_TARGET = 26.4;";
    assert.doesNotThrow(() => assertCompatibleSdk(project, "26.5"));
    assert.doesNotThrow(() => assertCompatibleSdk(project, "27.0"));
    assert.throws(() => assertCompatibleSdk(project, "26.4"));
    assert.throws(() => assertCompatibleSdk(project, "unknown"));
    assert.throws(() => assertCompatibleSdk("no deployment targets", "26.5"));
    for (const buildOnly of [false, true]) {
      const output = "/private/synthetic-apple-output";
      const destination = buildOnly
        ? "generic/platform=iOS Simulator"
        : "platform=iOS Simulator,id=synthetic-task-simulator";
      const command = appleCommand(output, destination, buildOnly);
      const value = (flag) => command[command.indexOf(flag) + 1];
      assert.equal(command[0], "xcodebuild");
      assert.equal(value("-sdk"), "iphonesimulator");
      assert.equal(value("-destination"), destination);
      assert.equal(value("-configuration"), "Debug");
      assert.equal(value("-scheme"), "ArtVenn");
      assert.equal(value("-derivedDataPath"), join(output, "DerivedData"));
      assert.equal(value("-resultBundlePath"), join(output, "Result.xcresult"));
      assert.ok(command.includes("CODE_SIGNING_ALLOWED=NO"));
      assert.equal(command.at(-1), buildOnly ? "build" : "test");
      assert.ok(!command.includes("-allowProvisioningUpdates"));
    }
  });
});
