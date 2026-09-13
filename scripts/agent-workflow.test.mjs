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

  it("Claude adapters render the canonical body instead of duplicating it", () => {
    for (const name of skills) {
      const adapter = read(`.claude/skills/${name}/SKILL.md`);
      const meta = frontmatter(adapter);
      assert.equal(meta.name, name);
      assert.equal(meta["disable-model-invocation"], "true");
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
    assert.match(read("AGENTS.md"), /## Task lifecycle skills/u);
    assert.ok(
      read("AGENTS.md").split("\n").length < 80,
      "root instructions stay brief",
    );
  });
});

describe("project-scoped Claude permissions stay minimal and fail closed", () => {
  const settings = JSON.parse(read(".claude/settings.json"));

  it("allows only read-only Git/GitHub reads and the verification entries", () => {
    const { allow, ask, deny } = settings.permissions;
    for (const rule of allow) {
      assert.match(
        rule,
        /^Bash\((?:git (?:status|diff|log|show|rev-parse|branch|worktree list|fetch origin|ls-remote|merge-base|cherry)|gh (?:pr (?:view|list|diff|checks)|issue (?:view|list)|run (?:view|list))|node (?:scripts\/verify(?:-task|-apple)?\.mjs|scripts\/test-target\.mjs check|--test scripts\/)|pnpm (?:verify|test:e2e:smoke|format:check|lint|typecheck|install --frozen-lockfile|--filter \* exec vitest run))/u,
        rule,
      );
      assert.doesNotMatch(
        rule,
        /^Bash\(\*?\)$|Bash\(rm|Bash\(sudo|Bash\(curl|Bash\(ssh|Bash\(scp/u,
        rule,
      );
    }
    for (const required of [
      "Bash(git push --force*)",
      "Bash(git reset --hard*)",
      "Bash(git clean *)",
      "Bash(git worktree remove *)",
      "Bash(git worktree prune *)",
      "Bash(git commit --no-verify*)",
      "Bash(git push --no-verify*)",
      "Bash(gh pr merge *)",
      "Bash(gh pr ready *)",
      "Bash(docker volume rm *)",
      "Bash(dropdb *)",
      "Read(./.env)",
      "Read(./.env.*)",
    ])
      assert.ok(deny.includes(required), required);
    for (const required of [
      "Bash(git push *)",
      "Bash(gh pr create *)",
      "Bash(git worktree add *)",
      "Bash(pnpm add *)",
    ])
      assert.ok(ask.includes(required), required);
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

describe("the Bash guard denies destructive shapes even inside compound commands", () => {
  const denied = [
    "git push --force origin chore/x",
    "git push -f origin chore/x",
    "git push --force-with-lease origin chore/x",
    "git status && git push --force origin chore/x",
    "git push origin main",
    "git push origin HEAD:main",
    "git reset --hard origin/main",
    "git clean -fd",
    "echo $(git worktree prune)",
    "for w in a b; do git worktree remove $w; done",
    "git branch -D feat/x",
    "git commit -m 'x' --no-verify",
    "gh pr merge 118 --squash",
    "gh pr ready 118",
    "gh api -X DELETE repos/nontwo/moya-inscriptions-web/git/refs/heads/x",
    "gh api repos/nontwo/moya-inscriptions-web/rulesets",
    "docker compose -f compose.dev.yml down -v",
    "docker compose -f compose.dev.yml down --volumes",
    "docker volume rm yoyi-development_yoyi_dev_data",
    "docker system prune -af",
    "dropdb yoyi_dev",
    "psql -d yoyi_dev -c 'TRUNCATE community.comments'",
    'psql postgresql://x@127.0.0.1:54330/yoyi_dev -c "DELETE FROM community.public_users"',
    "rm -rf ~/Developer/worktrees/moya-inscriptions-web/apple-bootstrap",
    "rm -rf .git",
    "cd / && rm -rf *",
    "rm -rf ../wf-agentation-pilot",
  ];
  const allowed = [
    "git status --short",
    "git push origin chore/wf-task-lifecycle",
    "git push -u origin chore/wf-task-lifecycle",
    "git branch -d chore/merged",
    "git worktree list --porcelain",
    "git worktree add -b chore/x ../x origin/main",
    "gh pr view 118 --json state",
    "gh api repos/nontwo/moya-inscriptions-web/pulls/118",
    "docker compose -f compose.dev.yml down",
    "pnpm dev:db:down",
    "node scripts/test-target.mjs check TEST_DATABASE_URL",
    "psql -d moya_synthetic_test -c 'SELECT 1'",
    "rm -rf node_modules/.cache",
    "rm -f /tmp/x.log",
    "git commit -m 'no-verify is mentioned in this message'",
    "",
  ];
  it("denies every destructive example with a reason", () => {
    for (const command of denied)
      assert.equal(typeof guardDecision(command), "string", command);
  });
  it("leaves ordinary commands to the normal permission flow", () => {
    for (const command of allowed)
      assert.equal(guardDecision(command), null, command);
  });
  it("only shapes a PreToolUse deny for Bash and stays silent otherwise", () => {
    const deny = hookOutput({
      tool_name: "Bash",
      tool_input: { command: "git push --force origin x" },
    });
    assert.equal(deny.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(deny.hookSpecificOutput.permissionDecision, "deny");
    assert.match(
      deny.hookSpecificOutput.permissionDecisionReason,
      /force push/u,
    );
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
        tool_input: { command: "gh pr merge 1" },
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
        tool_input: { command: "git log -1" },
      }),
    );
    assert.equal(fine.status, 0);
    assert.equal(fine.stdout, "");
    const garbage = run("not json");
    assert.equal(garbage.status, 0);
    assert.equal(garbage.stdout, "");
  });
});

describe("task records and templates", () => {
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

  it("the Owner quick start names both tools' invocations and the rollback set", () => {
    const readme = read("README.md").replace(/\s+/gu, " ");
    for (const text of [
      "/yoyi-task plan",
      "$yoyi-task plan",
      "/yoyi-review",
      "$yoyi-review",
      "/yoyi-handoff save",
      "$yoyi-handoff save",
      "Ideas / Ready / Doing / Review / Done",
      ".github/ISSUE_TEMPLATE/",
    ])
      assert.ok(readme.includes(text), text);
    assert.match(
      read("docs/governance/history/2026-09-13-workflow-rule-migration-map.md"),
      /\| RETIRE\s+\| none/u,
    );
  });
});
