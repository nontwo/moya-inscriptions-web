import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
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
        /^Bash\((?:git (?:status|diff|log|show|rev-parse|branch|worktree (?:list|add)|fetch origin|ls-remote|merge-base|cherry|merge origin\/main|stash (?:list|show)|add|commit|push (?:-u )?origin)|gh (?:pr (?:view|list|diff|checks|create --draft|comment|review|edit)|issue (?:view|list|create|comment)|run (?:view|list))|node (?:scripts\/verify(?:-task|-apple)?\.mjs|scripts\/test-target\.mjs check|--test scripts\/)|pnpm (?:verify|test:e2e:smoke|format:check|lint|typecheck|install --frozen-lockfile|--filter \* exec vitest run))/u,
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
      "Bash(git stash list*)",
    ])
      assert.ok(allow.includes(required), required);
  });

  it("asks (native consent) for delivery and state-changing operations instead of denying them", () => {
    for (const required of [
      "Bash(gh pr ready *)",
      "Bash(gh pr merge *)",
      "Bash(git push * --delete *)",
      "Bash(git rebase *)",
      "Bash(git reset *)",
      "Bash(git stash pop*)",
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
    assert.ok(
      !ask.includes("Bash(git stash *)"),
      "read-only stash inspection must not prompt",
    );
    for (const rule of [...allow, ...ask, ...deny])
      assert.doesNotMatch(
        rule,
        /:\*\)$/u,
        `${rule}: a trailing ":*" is the legacy prefix syntax, not a literal colon`,
      );
    for (const forbidden of [
      "Bash(gh pr merge *)",
      "Bash(gh pr ready *)",
      "Bash(gh pr create *)",
      "Bash(git push *)",
      "Bash(gh issue create *)",
      "Bash(git worktree add *)",
      "Bash(gh ruleset *)",
    ])
      assert.ok(
        !deny.includes(forbidden),
        `${forbidden} must not be an unconditional deny`,
      );
  });

  it("denies the leading spellings of force pushes, pushes to main, hook bypasses, history rewrites, worktree removal, repository settings and data deletion", () => {
    for (const required of [
      "Bash(git push *--force*)",
      "Bash(git push -f *)",
      "Bash(git push * -f)",
      "Bash(git push origin main)",
      "Bash(git push * *:main)",
      "Bash(git push *--no-verify*)",
      "Bash(git commit --no-verify*)",
      "Bash(git commit -n)",
      "Bash(git commit -n *)",
      "Bash(git push * +*)",
      "Bash(git push * refs/heads/main)",
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
      "Read(./**/.env.*.local)",
    ])
      assert.ok(deny.includes(required), required);
    for (const rule of deny.filter((r) => r.startsWith("Bash(git commit")))
      assert.doesNotMatch(
        rule,
        /^Bash\(git commit \*/u,
        `${rule} would also match commit-message text`,
      );
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

  // Documented Bash rule matching (code.claude.com/docs/en/permissions): `*`
  // matches any text including spaces; a trailing ` *` also matches the bare
  // command only when it is the rule's single wildcard; deny, then ask, then
  // allow. Compound commands are split by Claude Code before matching, so the
  // fixtures below are single commands.
  const ruleMatches = (rule, command) => {
    const pattern = rule.slice("Bash(".length, -1).replace(/[ \t]+/gu, " ");
    let source = pattern
      .replace(/[.+?^${}()|[\]\\]/gu, "\\$&")
      .replaceAll("*", ".*");
    if ((pattern.match(/\*/gu) ?? []).length === 1 && source.endsWith(" .*"))
      source = `${source.slice(0, -3)}( .*)?`;
    return new RegExp(`^${source}$`, "su").test(
      command.replace(/[ \t]+/gu, " "),
    );
  };
  const nativeDecision = (command) => {
    for (const [decision, rules] of [
      ["deny", deny],
      ["ask", ask],
      ["allow", allow],
    ])
      if (rules.some((r) => r.startsWith("Bash(") && ruleMatches(r, command)))
        return decision;
    return "prompt";
  };
  const hook = (command, branch = "chore/x") =>
    guardDecision(command, { cwd: root, currentBranch: () => branch })
      ?.decision ?? null;

  it("never denies an ordinary commit because of its message text", () => {
    for (const command of [
      'git commit -m "fix -n handling"',
      'git commit -m "docs: explain head -n limits"',
      'git commit -m "chore: forbid --no-verify in agent settings"',
      "git commit -m \"$(cat <<'EOF'\nfeat: guard\n\nuse head -n 5; --no-verify stays banned\nEOF\n)\"",
    ]) {
      assert.equal(nativeDecision(command), "allow", command);
      assert.equal(hook(command), null, command);
    }
    assert.equal(nativeDecision("git stash list"), "allow");
    assert.equal(nativeDecision("gh pr merge 1 --squash"), "ask");
    assert.equal(nativeDecision("gh pr ready 1"), "ask");
  });

  it("stops every forbidden spelling: a native deny, or the hook wherever a native rule would allow or prompt", () => {
    for (const command of [
      "git push --force origin chore/x",
      "git push origin chore/x -f",
      "git push -u origin chore/x -f",
      "git push origin chore/x -uf",
      "git push origin chore/x -fu",
      "git push origin +chore/x",
      "git push origin HEAD:main",
      "git push origin chore/x:refs/heads/main",
      "git push --mirror origin",
      "git commit -n -m x",
      'git commit -nm "msg"',
      'git commit -anm "msg"',
      "git commit --no-verify -m x",
      "git -c core.hooksPath=/dev/null commit -m x",
    ]) {
      const native = nativeDecision(command);
      assert.ok(
        native === "deny" || hook(command) === "deny",
        `${command}: native ${native}, hook ${hook(command)}`,
      );
    }
    for (const command of [
      "git push origin :chore/x",
      "git push origin --delete chore/x",
    ]) {
      const native = nativeDecision(command);
      assert.ok(
        native === "ask" || hook(command) === "ask",
        `${command}: native ${native}, hook ${hook(command)}`,
      );
    }
  });
});

describe("the Bash guard reads argument vectors, never quoted text", () => {
  const decide = (command, branch = "chore/x") =>
    guardDecision(command, { cwd: root, currentBranch: () => branch })
      ?.decision ?? null;
  const denied = [
    "git push origin chore/x -f",
    "git push origin chore/x -uf",
    "git push --force-with-lease origin chore/x",
    "git push --force-w origin chore/x",
    "git push --mirr origin",
    "git push --all origin",
    "git push --prune origin",
    "git push --no-verify origin chore/x",
    "git push origin +chore/x",
    "git push origin chore/x:main",
    "git push origin HEAD:refs/heads/main",
    "git push origin :main",
    'git commit -nm "msg"',
    'git commit -anm "msg"',
    "git commit -S -n -m x",
    "git commit --no-veri -m x",
    "git -c core.hooksPath=/dev/null commit -m x",
    "GIT_CONFIG_PARAMETERS=\"'core.hooksPath'='/dev/null'\" git commit -m x",
    "git -C ../other push --force origin chore/x",
    "(git -C . push --force origin x)",
    "for r in a; do git -C $r push --force origin x; done",
    'bash -c "git push -f origin x"',
    "sh -lc 'git commit -nm x'",
    "echo x | xargs git push -f origin",
    "git status && git push origin chore/x -f",
    "git status\ngit -C . push --force origin chore/x",
    "echo `echo )`; git push -f origin x",
    "psql -d yoyi_dev -c 'TRUNCATE community.comments'",
    'psql postgresql://x@127.0.0.1:54330/yoyi_dev -c "DELETE FROM community.public_users"',
    "pgcli -d yoyi_dev -e 'DROP TABLE community.sessions'",
    'psql -d postgres -c "DROP DATABASE yoyi_dev"',
    "PGDATABASE=yoyi_dev psql -c 'TRUNCATE x'",
    "echo 'DROP TABLE x' | psql -d yoyi_dev",
    "psql -d yoyi_dev <<'SQL'\nDROP TABLE x;\nSQL",
    "true; psql -d yoyi_dev -c 'DROP TABLE x'",
  ];
  const asked = [
    "git push origin :chore/x",
    "git push origin --delete chore/x",
    "git push -d origin chore/x",
    "git push --tags origin",
    'git push -u origin "$(git branch --show-current)"',
    "cd ../other && git push origin",
  ];
  const harmless = [
    "rg 'DROP DATABASE' docs/",
    "grep -rn 'gh pr merge' .agents/skills",
    "printf '%s\\n' 'gh pr merge 123'",
    "echo \"never run: psql -d yoyi_dev -c 'TRUNCATE x'\" > /dev/null",
    'grep -rn "(psql -d yoyi_dev -c DROP)" docs/',
    "psql -d yoyi_dev -c 'SELECT count(*) FROM community.comments'",
    "psql -d yoyi_dev -c 'SELECT 1' | grep DROP",
    "psql -d moya_synthetic_test -c 'TRUNCATE catalog_entries'",
    "git push origin chore/wf-task-lifecycle",
    "git push -u origin HEAD",
    "git -C ../other push origin chore/x:chore/x-copy",
    "git push origin feature:refs/heads/main-nav",
    'git commit -m "fix -n handling"',
    "git commit -F - <<'EOF'\nbody -n --no-verify\nEOF",
    "git commit -mn",
    "git commit --message -n",
    "git log -n 5 2>/dev/null | head -n 5",
    "gh pr merge 118 --squash --match-head-commit abc",
    "node scripts/test-target.mjs check TEST_DATABASE_URL",
    "",
  ];
  it("denies forbidden pushes, hook bypasses and destructive SQL in any position, bundle or wrapper", () => {
    for (const command of denied)
      assert.equal(decide(command), "deny", command);
  });
  it("asks for remote branch deletion, tags and refs only known at run time", () => {
    for (const command of asked) assert.equal(decide(command), "ask", command);
  });
  it("resolves HEAD and implicit pushes against the checked-out branch", () => {
    assert.equal(decide("git push origin HEAD", "main"), "deny");
    assert.equal(decide("git push origin", "main"), "deny");
    assert.equal(decide("git push origin HEAD", "chore/x"), null);
    assert.equal(decide("git push origin", null), null, "detached HEAD");
  });
  it("never treats searched, quoted, printed or commit-message text as execution", () => {
    for (const command of harmless)
      assert.equal(decide(command), null, command);
  });
  it("asks instead of failing silently when a command cannot be analysed, and stays fast", () => {
    assert.equal(
      decide(
        `echo ${"$(".repeat(5_000)}${")".repeat(5_000)}; git push origin x`,
      ),
      "ask",
    );
    const started = performance.now();
    decide(`echo ${"a".repeat(1_000_000)}`);
    decide(`psql -d postgres -c "${"yoyi_dev ".repeat(60_000)}"`);
    assert.ok(performance.now() - started < 2_000, "linear-time analysis");
  });
  it("shapes PreToolUse deny and ask decisions for Bash only", () => {
    const denial = hookOutput(
      {
        tool_name: "Bash",
        tool_input: { command: "psql -d yoyi_dev -c 'DROP TABLE x'" },
        cwd: root,
      },
      { currentBranch: () => "chore/x" },
    );
    assert.equal(denial.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(denial.hookSpecificOutput.permissionDecision, "deny");
    assert.match(
      denial.hookSpecificOutput.permissionDecisionReason,
      /yoyi_dev/u,
    );
    const question = hookOutput(
      {
        tool_name: "Bash",
        tool_input: { command: "git push origin :chore/x" },
        cwd: root,
      },
      { currentBranch: () => "chore/x" },
    );
    assert.equal(question.hookSpecificOutput.permissionDecision, "ask");
    assert.equal(
      hookOutput(
        {
          tool_name: "Bash",
          tool_input: { command: "git push origin" },
          cwd: root,
        },
        { currentBranch: () => "main" },
      ).hookSpecificOutput.permissionDecision,
      "deny",
      "the hook input's cwd locates the checkout",
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
  it("runs as a command hook from a real or symlinked path: JSON in, decision out, exit 0", () => {
    const directory = mkdtempSync(join(tmpdir(), "yoyi-guard-"));
    const linked = join(directory, "guard-bash.mjs");
    symlinkSync(join(root, ".claude/hooks/guard-bash.mjs"), linked);
    try {
      for (const script of [".claude/hooks/guard-bash.mjs", linked]) {
        const run = (input) =>
          spawnSync(process.execPath, [script], {
            cwd: root,
            input,
            encoding: "utf8",
            timeout: 10_000,
          });
        const blocked = run(
          JSON.stringify({
            tool_name: "Bash",
            tool_input: { command: "git -C . push origin x -f" },
            cwd: root,
          }),
        );
        assert.equal(blocked.status, 0, script);
        assert.equal(
          JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision,
          "deny",
          script,
        );
        for (const input of [
          JSON.stringify({
            tool_name: "Bash",
            tool_input: { command: "rg 'DROP DATABASE' docs/" },
          }),
          JSON.stringify({ tool_name: "Read", tool_input: {} }),
          JSON.stringify({ tool_name: "Bash" }),
          "not json",
          "",
        ]) {
          const quiet = run(input);
          assert.equal(quiet.status, 0, `${script}: ${input}`);
          assert.equal(quiet.stdout, "", `${script}: ${input}`);
        }
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
    const delivery = form.replace(/\s+/gu, " ");
    assert.doesNotMatch(delivery, /Default stop is a reviewed Draft PR/u);
    assert.match(
      delivery,
      /delivered by independent review, then an expected-head squash merge/u,
    );
    assert.match(delivery, /Write a Draft limit here only when one applies/u);
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
    assert.doesNotMatch(readme, /合并即生效/u);
    assert.ok(readme.includes(".claude/settings.local.json"));
    assert.ok(readme.includes("Draft PR #124"));
    const map = read(
      "docs/governance/history/2026-09-13-workflow-rule-migration-map.md",
    );
    assert.match(
      map,
      /\| MODERNIZE\s+\| Read the full authority when entering a task context/u,
    );
    assert.match(
      map,
      /\| RETIRE\s+\| Native permission rules keep fixed leading spellings/u,
    );
    assert.doesNotMatch(map, /guard hook denies it inside compound commands/u);
    assert.match(map, /\| Default delivery stop "reviewed Draft PR"/u);
    assert.match(
      map,
      /Readers, idle editors and the incoming session are not writers/u,
    );
  });
});
