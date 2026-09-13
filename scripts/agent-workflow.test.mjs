import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import process from "node:process";
import { describe, it } from "node:test";
import { URL, fileURLToPath } from "node:url";
import { guardDecision, hookOutput } from "../.claude/hooks/guard-bash.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) =>
  readFileSync(new URL(file, new URL("../", import.meta.url)), "utf8");
const frontmatter = (text) => {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(text);
  assert.ok(match, "SKILL.md needs YAML frontmatter");
  return Object.fromEntries(
    match[1]
      .split("\n")
      .filter((line) => /^[a-z-]+:/u.test(line))
      .map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index), line.slice(index + 1).trim()];
      }),
  );
};
const skills = ["yoyi-task", "yoyi-review", "yoyi-handoff"];

describe("one canonical skill body per skill, one adapter per tool", () => {
  it("Codex bodies exist, name themselves correctly and describe their invocation", () => {
    for (const name of skills) {
      const body = read(`.agents/skills/${name}/SKILL.md`);
      const meta = frontmatter(body);
      assert.equal(meta.name, name);
      assert.ok(meta.description !== undefined, `${name} description`);
      assert.match(body, /## Invocation/u);
      assert.ok(
        body.includes(`$${name}`),
        `${name} names its Codex invocation`,
      );
      assert.ok(
        body.includes(`/${name}`),
        `${name} names its Claude invocation`,
      );
      assert.doesNotMatch(
        body,
        /\/Users\/[a-z]+\//u,
        "no absolute personal paths",
      );
    }
  });

  it("the bodies carry the closeout clarifications", () => {
    const task = read(".agents/skills/yoyi-task/SKILL.md").replace(
      /\s+/gu,
      " ",
    );
    assert.match(task, /## Instruction context and freshness/u);
    assert.match(task, /same unchanged task context, reuse/u);
    assert.match(
      task,
      /do not reread the governance set unless the rule files changed/u,
    );
    assert.match(task, /never marks its own PR Ready or merges it/u);
    const review = read(".agents/skills/yoyi-review/SKILL.md").replace(
      /\s+/gu,
      " ",
    );
    assert.match(review, /## Delivery after review/u);
    assert.match(
      review,
      /gh pr merge <n> --squash --match-head-commit <reviewed sha>/u,
    );
    assert.match(review, /Task limited to Draft/u);
    assert.match(
      review,
      /Production, remote settings or destructive operations/u,
    );
    const handoff = read(".agents/skills/yoyi-handoff/SKILL.md").replace(
      /\s+/gu,
      " ",
    );
    assert.match(handoff, /Readers are not writers/u);
    assert.match(handoff, /open file or process id alone is not proof/u);
    assert.match(handoff, /unpushed local commit is recorded and reconciled/u);
    assert.doesNotMatch(handoff, /no process has the worktree open/u);
  });

  it("Claude adapters render the canonical body instead of duplicating it", () => {
    for (const name of skills) {
      const adapter = read(`.claude/skills/${name}/SKILL.md`);
      const meta = frontmatter(adapter);
      assert.equal(meta.name, name);
      assert.equal(
        meta["disable-model-invocation"],
        name === "yoyi-review" ? "false" : "true",
        `${name}: only the read-only reviewer may be model-invoked`,
      );
      assert.ok(meta["argument-hint"], `${name} argument hint`);
      const injected =
        /!`cat "\$\{CLAUDE_SKILL_DIR:-\.claude\/skills\/([a-z-]+)\}\/\.\.\/\.\.\/\.\.\/\.agents\/skills\/([a-z-]+)\/SKILL\.md"`/u.exec(
          adapter,
        );
      assert.ok(injected, `${name} injects the canonical body`);
      assert.equal(injected[1], name);
      assert.equal(injected[2], name);
      assert.ok(existsSync(`${root}.agents/skills/${name}/SKILL.md`));
      assert.match(adapter, /\$ARGUMENTS/u);
      assert.match(adapter, /read\s+that file before/u, "fallback instruction");
      assert.doesNotMatch(
        adapter,
        /## Invocation/u,
        "adapter carries no second body",
      );
      assert.ok(adapter.split("\n").length < 30, "adapter stays thin");
    }
  });

  it("no third instruction convention and no duplicate skill directories", () => {
    for (const directory of [".agents/skills", ".claude/skills"]) {
      const names = readdirSync(`${root}${directory}`).filter((entry) =>
        entry.startsWith("yoyi-"),
      );
      assert.deepEqual(
        names.filter((n) => skills.includes(n)).sort(),
        [...skills].sort(),
        directory,
      );
      assert.equal(new Set(names).size, names.length);
    }
    assert.ok(!existsSync(`${root}AGENT.md`));
    assert.ok(!existsSync(`${root}AGENTS.override.md`));
    assert.ok(
      !existsSync(`${root}.codex`),
      "no project-level Codex config duplicating the skills",
    );
    const agents = read("AGENTS.md");
    assert.match(agents, /## Task lifecycle skills/u);
    assert.match(agents, /When entering a task context/u);
    assert.match(agents, /delivery stop\s+is that task's authorization/u);
    assert.ok(agents.split("\n").length <= 120, "root instructions stay brief");
  });
});

describe("project-scoped Claude permissions: native rules first, fail closed", () => {
  const settings = JSON.parse(read(".claude/settings.json"));
  const { allow, ask, deny } = settings.permissions;

  it("allows read-only Git/GitHub, scoped pushes, Draft PR and task creation, and the verification entries", () => {
    for (const rule of allow) {
      assert.match(
        rule,
        /^Bash\((?:git (?:status|diff|log|show|rev-parse|branch|worktree (?:list|add)|fetch origin|ls-remote|merge-base|cherry|merge origin\/main|add|commit|push (?:-u )?origin)|gh (?:pr (?:view|list|diff|checks|create --draft|comment|review|edit)|issue (?:view|list|create|comment)|run (?:view|list))|node (?:scripts\/verify(?:-task|-apple)?\.mjs|scripts\/test-target\.mjs check|--test scripts\/)|pnpm (?:verify|test:e2e:smoke|format:check|lint|typecheck|install --frozen-lockfile|--filter \* exec vitest run))/u,
        rule,
      );
      assert.doesNotMatch(
        rule,
        /^Bash\(\*?\)$|Bash\(rm|Bash\(sudo|Bash\(curl|Bash\(ssh|Bash\(scp|Bash\(gh pr (?:merge|ready)/u,
        rule,
      );
    }
    for (const required of [
      "Bash(git push origin *)",
      "Bash(git push -u origin *)",
      "Bash(gh pr create --draft *)",
      "Bash(gh issue create *)",
      "Bash(git worktree add *)",
      "Bash(git commit *)",
    ])
      assert.ok(allow.includes(required), required);
  });

  it("asks (native consent) for delivery, non-draft PRs and reversible-but-notable operations instead of denying them", () => {
    for (const required of [
      "Bash(gh pr ready *)",
      "Bash(gh pr merge *)",
      "Bash(git rebase *)",
      "Bash(git reset *)",
      "Bash(git stash *)",
      "Bash(rm -rf *)",
      "Bash(pnpm add *)",
      "Bash(docker compose *)",
      "Bash(node scripts/test-target.mjs mark *)",
    ])
      assert.ok(ask.includes(required), required);
    assert.ok(
      !ask.includes("Bash(gh pr create *)"),
      "an ask rule would override the Draft-PR allow rule (ask beats allow)",
    );
    for (const forbidden of [
      "Bash(gh pr merge *)",
      "Bash(gh pr ready *)",
      "Bash(gh pr create *)",
      "Bash(git push *)",
      "Bash(gh issue create *)",
      "Bash(git worktree add *)",
    ])
      assert.ok(
        !deny.includes(forbidden),
        `${forbidden} must not be an unconditional deny`,
      );
  });

  it("denies force pushes, pushes to main, hook bypasses, history rewrites, worktree removal, repository settings and data deletion", () => {
    for (const required of [
      "Bash(git push *--force*)",
      "Bash(git push -f *)",
      "Bash(git push origin main)",
      "Bash(git push origin HEAD:main*)",
      "Bash(git push *--no-verify*)",
      "Bash(git commit *--no-verify*)",
      "Bash(git commit -n *)",
      "Bash(git commit * -n *)",
      "Bash(git push * +*)",
      "Bash(git push * *:main)",
      "Bash(git push * refs/heads/main*)",
      "Bash(git push *--prune*)",
      "Bash(git push *--mirror*)",
      "Bash(git reset --hard*)",
      "Bash(git clean *)",
      "Bash(git worktree remove *)",
      "Bash(git worktree prune *)",
      "Bash(git branch -D *)",
      "Bash(gh repo edit *)",
      "Bash(gh api -X DELETE *)",
      "Bash(gh api *rulesets*)",
      "Bash(docker compose * down -v*)",
      "Bash(docker volume rm *)",
      "Bash(dropdb *)",
      "Read(./.env)",
      "Read(./.env.local)",
      "Read(./.env.*.local)",
    ])
      assert.ok(deny.includes(required), required);
    assert.ok(
      !deny.includes("Read(./.env.*)"),
      "the tracked .env.example templates must stay readable",
    );
    assert.equal(settings.permissions.defaultMode, undefined);
    assert.equal(settings.permissions.additionalDirectories, undefined);
    assert.equal(settings.enableAllProjectMcpServers, undefined);
  });

  it("registers exactly one Bash PreToolUse guard and nothing else", () => {
    assert.deepEqual(Object.keys(settings.hooks), ["PreToolUse"]);
    const [entry, ...rest] = settings.hooks.PreToolUse;
    assert.equal(rest.length, 0);
    assert.equal(entry.matcher, "Bash");
    assert.equal(entry.hooks.length, 1);
    assert.equal(entry.hooks[0].type, "command");
    assert.match(
      entry.hooks[0].command,
      /\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/guard-bash\.mjs/u,
    );
    assert.ok(entry.hooks[0].timeout <= 30);
  });
});

describe("the reduced Bash guard covers only what native rules cannot express", () => {
  const denied = [
    "psql -d yoyi_dev -c 'TRUNCATE community.comments'",
    'psql postgresql://x@127.0.0.1:54330/yoyi_dev -c "DELETE FROM community.public_users"',
    "pgcli -d yoyi_dev -e 'DROP TABLE community.sessions'",
    "git -C ../other push --force origin chore/x",
    "git -c core.hooksPath=/dev/null push origin main",
    "git -C . push origin HEAD:main",
    "git -C . push origin +chore/x",
    "git -C . push origin chore/x:main",
    "git -C . push origin HEAD:refs/heads/main",
    "git -C . push --prune origin",
    "git status\ngit -C . push --force origin chore/x",
    "true; psql -d yoyi_dev -c 'DROP TABLE x'",
  ];
  const leftToNativeRules = [
    "git push --force origin chore/x",
    "git status && git push --force origin chore/x",
    "gh pr merge 118 --squash --match-head-commit abc",
    "gh pr ready 118",
    "git worktree prune",
    "docker compose -f compose.dev.yml down -v",
    "dropdb yoyi_dev",
  ];
  const harmless = [
    "rg 'DROP DATABASE' docs/",
    "grep -rn 'gh pr merge' .agents/skills",
    "printf '%s\\n' 'gh pr merge 123'",
    "echo \"never run: psql -d yoyi_dev -c 'TRUNCATE x'\" > /dev/null",
    "psql -d yoyi_dev -c 'SELECT count(*) FROM community.comments'",
    "psql -d moya_synthetic_test -c 'TRUNCATE catalog_entries'",
    "git push origin chore/wf-task-lifecycle",
    "git -C ../other push origin chore/x",
    "git -C ../other push origin chore/x:chore/x-copy",
    'grep -rn "(psql -d yoyi_dev -c DROP)" docs/',
    "node scripts/test-target.mjs check TEST_DATABASE_URL",
    "",
  ];
  it("denies destructive SQL against yoyi_dev and the -C/-c spelling of a forbidden push", () => {
    for (const command of denied)
      assert.equal(typeof guardDecision(command), "string", command);
  });
  it("stays silent where the native permission rules already decide", () => {
    for (const command of leftToNativeRules)
      assert.equal(guardDecision(command), null, command);
  });
  it("never treats searched, quoted or printed command text as execution", () => {
    for (const command of harmless)
      assert.equal(guardDecision(command), null, command);
  });
  it("only shapes a PreToolUse deny for Bash and stays silent otherwise", () => {
    const deny = hookOutput({
      tool_name: "Bash",
      tool_input: { command: "psql -d yoyi_dev -c 'DROP TABLE x'" },
    });
    assert.equal(deny.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
    assert.match(deny.hookSpecificOutput.permissionDecisionReason, /yoyi_dev/u);
    assert.equal(
      hookOutput({ tool_name: "Read", tool_input: { file_path: "x" } }),
      null,
    );
    assert.equal(
      hookOutput({ tool_name: "Bash", tool_input: { command: "git status" } }),
      null,
    );
    assert.equal(hookOutput(undefined), null);
  });
  it("runs as a command hook: JSON in, decision out, exit 0", () => {
    const run = (input) =>
      spawnSync(process.execPath, [".claude/hooks/guard-bash.mjs"], {
        cwd: root,
        input,
        encoding: "utf8",
        timeout: 10_000,
      });
    const blocked = run(
      JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "git -C . push --force origin x" },
      }),
    );
    assert.equal(blocked.status, 0);
    assert.equal(
      JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision,
      "deny",
    );
    const fine = run(
      JSON.stringify({
        tool_name: "Bash",
        tool_input: { command: "rg 'DROP DATABASE' docs/" },
      }),
    );
    assert.equal(fine.status, 0);
    assert.equal(fine.stdout, "");
    const garbage = run("not json");
    assert.equal(garbage.status, 0);
    assert.equal(garbage.stdout, "");
  });
});

describe("task records, templates and the Owner guide", () => {
  it("the Issue form captures every lightweight template field once", () => {
    const form = read(".github/ISSUE_TEMPLATE/task.yml");
    for (const id of [
      "task_id",
      "revision",
      "workstream",
      "goal",
      "non_goals",
      "scope",
      "preserved",
      "acceptance",
      "restrictions",
      "responsibility",
      "delivery",
    ]) {
      const occurrences = form.split(`id: ${id}\n`).length - 1;
      assert.equal(occurrences, 1, id);
    }
    assert.match(form, /labels: \["task"\]/u);
    assert.match(form, /- Web\n\s+- Apple\n\s+- Shared/u);
    assert.match(
      read(".github/ISSUE_TEMPLATE/config.yml"),
      /^blank_issues_enabled: true\n$/u,
    );
    assert.match(
      read(".github/pull_request_template.md"),
      /Task Issue and specification revision/u,
    );
  });

  it("the Owner quick start uses placeholders, separates Issue from PR numbers and documents dependency-aware rollback", () => {
    const readme = read("README.md").replace(/\s+/gu, " ");
    for (const text of [
      "/yoyi-task plan",
      "$yoyi-task plan",
      "/yoyi-review",
      "$yoyi-review",
      "/yoyi-handoff save",
      "$yoyi-handoff save",
      "Ideas / Ready / Doing / Review / Done",
      "/yoyi-task start #<issue>",
      "/yoyi-review <pr>",
      "Issue #119 / PR #122",
      "Issue #120 / PR #123",
      "git revert",
    ])
      assert.ok(readme.includes(text), text);
    const example = /```text\n([\s\S]*?)```/u.exec(read("README.md"))[1];
    assert.doesNotMatch(
      example,
      /#\d+|review \d+/u,
      "examples use placeholders, not real Issue or PR numbers",
    );
    assert.doesNotMatch(readme, /暂存与未提交改动不受影响/u);
    assert.doesNotMatch(readme, /PreToolUse 钩子立即生效/u);
    const map = read(
      "docs/governance/history/2026-09-13-workflow-rule-migration-map.md",
    );
    assert.match(
      map,
      /\| MODERNIZE\s+\| Read the full authority when entering a task context/u,
    );
    assert.match(
      map,
      /\| RETIRE\s+\| Native permission rules match those shapes per subcommand/u,
    );
    assert.match(
      map,
      /Readers, idle editors and the incoming session are not writers/u,
    );
  });
});
