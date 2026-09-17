# Task scope, verification and handoff

This is the single shared workflow for Codex, Claude Code and other authorized
tools. The repository keeps `main` as its only long-lived shared branch and uses
short-lived task branches and PRs. Current Owner instructions and the root
authority chain remain binding. An explicit Draft PR stopping point does not
authorize a Ready transition or merge.

## Choose scope from the task and diff

Freeze the task ID, allowed paths, non-goals, preserved behavior and delivery
stop before writing. Classify the complete changed-path set, including committed
changes since the merge base, staged, unstaged and untracked work. Deletions and
both sides of a rename matter. Author accounts, labels, tool names and branch
prefixes do not select or waive checks.

| Actual change                                                        | Applicable verification                                                                                                                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Swift, resources, project or native tests                      | One iOS Simulator build and relevant native tests                                                                                                                            |
| Web/Admin/backend/database implementation or its JS/TS configuration | Applicable existing Web verification and affected domain tests                                                                                                               |
| Public contracts, OpenAPI or authentication protocol                 | Focused existing contract, public backend HTTP and Web public-API client tests; add other platform/runtime checks only when its changed paths or real consumers require them |
| Platform documentation or instructions                               | Relevant lightweight checks, without unrelated product builds                                                                                                                |
| Common instructions, CI and verification routing                     | Routing, instruction/import and gate regression checks, plus independently affected runtime checks                                                                           |
| Mixed changes                                                        | The union of affected checks                                                                                                                                                 |
| Unknown paths or classification failure                              | Report the specific classification problem and fail the task's verification                                                                                                  |

Root TypeScript configuration belongs to the Web toolchain. A common instruction
file does not, merely by existing, select every product. The Apple bootstrap has
no API consumer yet: no Apple contract-test pass can be claimed. Introducing a
real consumer requires documenting and validating that dependency. Shared API or
authentication work does not automatically select PostgreSQL, CMS, browsers or
Xcode; actual impact must establish each requirement.

Reading another platform's interface is allowed as necessary context, but does
not grant write permission. A required shared-interface change needs an explicit
scope extension or a concrete follow-up task. Shared `main` still has
integration costs: conflicts, compatible contracts and strict up-to-date
protection remain real obligations.

## Start or resume the assigned worktree

Use the task's existing real path under
`~/Developer/worktrees/moya-inscriptions-web/<task-id>/`. Keep task inputs,
handoffs and evidence under
`~/Developer/artifacts/moya-inscriptions-web/<task-id>/`. Choose a unique output
subdirectory for each validation or reviewer run. Do not write evidence into Git
or another task's outputs.

Start either tool with its working directory set to that worktree. The terminal
entry is `codex` or `claude` when installed on PATH; desktop users open that
same existing folder. For a handoff, do not request a new managed worktree or
create another branch. Check the real root, branch, HEAD, PR and work status
before continuing. A worktree shares Git configuration, hooks and refs, and may
share external services; it is not a complete permission or runtime sandbox.

Only one actor writes a mutable worktree at a time, including checkout, stage,
commit and source-generating commands. Readers are not writers: an idle editor,
a terminal, a read-only reviewer or the incoming session opening the directory
does not compete for the role, and an open file or process id alone is not proof
of write activity. A competing writer is a newer held claim in the task's
checkpoint, a conflicting task update, or a source-changing or Git-writing
process left by the previous execution. The private handoff record below is that
checkpoint. An independent reviewer reads the assigned diff and exact HEAD.
Tests that write files use separate output locations, or a separate review
worktree when source writes cannot be avoided. Return the writer role to the
implementer before fixes. Either tool, including a new session of the same tool,
may implement, test, review or take over the task.

Do not interrupt unrelated sessions, services, containers or databases. Use
task-specific ports and writable test databases where isolation is needed. Apple
integration must name an API version, service endpoint/port and data agreement;
it cannot rely on another task's backend remaining available or unchanged.
Provisioning a new shared service requires its own authority.

## Use the applicable local entry

Run these commands from the task worktree root, replacing `<private-output>`
with a new absolute directory in that task's private artifacts area:

```sh
node scripts/verify-task.mjs --base origin/main --output <private-output>
```

The task entry includes committed merge-base changes and local staged, unstaged
and untracked paths. Verify that the base ref is current when the task requires
a fresh remote comparison. CI PR classification uses merge-base..HEAD; a main
push covers the complete before..after interval.

`--mode lightweight` is for the bounded routing/documentation check phase; it
does not replace applicable product validation.

`--mode feedback` is an intermediate revision preview after relevant delta
checks. Use it from the task worktree as:

```sh
node scripts/verify-task.mjs --mode feedback --base origin/main --output <private-output>
```

Optional `--since <ref>` names the feedback checkpoint explicitly. Without
`--since`, the last pushed upstream commit is used when it is an ancestor of
HEAD; otherwise the merge-base with `--base` is used. The mode always unions
applicable staged, unstaged and untracked content plus necessary dependency
impact. It does not assume the last commit is the entire unchecked delta.
Missing or ambiguous checkpoint or scope is reported and fails; it is never
silently treated as checked. Feedback mode selects existing focused checks from
the feedback delta instead of the general `taskCommands()` plan. A supported
routine Web presentation change is checked with those limited commands; it does
not invoke bare `scripts/verify.mjs` and does not run the workspace-wide
Web/browser/database/CMS path solely because Web is classified. A Web behavior
change receives the matching focused behavior checks. Broader shared-contract
impact uses the existing focused contract commands; database, CMS, Apple, and
other unresolved coverage is reported explicitly and fails. Feedback never
treats a silent skip or a pass with no relevant checks as successful
verification. User-visible output and recorded evidence are labeled
`FEEDBACK ONLY — NOT FULL ACCEPTANCE`. That preview is not formal Owner
acceptance, not complete task validation, and not permission to merge. A failed
full run is not a feedback PASS. Do not block every small preview on full CI,
and do not push every tiny edit solely to obtain another full CI run. Commit,
required CI, independent review and final delivery still use the default
`verify-task` entry (committed, staged, unstaged and untracked union) and the
cumulative PR plan. A tip-only or feedback plan cannot satisfy `assertTaskGate`
/ `ci-task-gate` when a cumulative plan is required. Existing required CI checks
and branch protections stay in force. Unchanged applicable evidence may be
reused; changing HEAD or the implementing tool alone does not require a full
historical rerun.

Pure Web work retains the existing `pnpm verify` entry with already prepared
dependencies. Pure Apple work may use the standalone entry without installing
the Web workspace:

```sh
node scripts/verify-apple.mjs --output <private-output>
```

The Apple default builds and runs the scheme's unit and UI tests on one
task-owned iOS Simulator. Use `--build-only` only for a specifically build-only
check and record that limitation. No project or compatible runtime means
PENDING/NOT TESTED, not a fabricated pass. It does not block otherwise
independent Web validation.

Each validation plan owns one deadline from the explicit profiles in the
[2026-09-16 validation-profiles amendment](../governance/amendments/2026-09-16-validation-profiles.md):
feedback is capped at 120 seconds and stays labeled
`FEEDBACK ONLY — NOT FULL ACCEPTANCE`; full profiles (Apple full 600 seconds,
Web/CMS complete 300 seconds, local combined plan at most 900 seconds) are
selected explicitly, and nested commands receive the remaining time, never a
fresh budget. Record preparation, dependency installation, queueing and first
environment setup separately. A timeout fails its profile. Do not hide an
applicable failure, loop unchanged retries, extend the deadline or split the
same validation into new budgets. Full browser E2E and platform matrices are not
daily defaults.

The separate existing core-credential delivery check also retains one shared
120-second security-work allowance, incremental content-aware reuse and the
anonymous Git identity. Follow the active amendment; do not reinstall hooks,
rescan unrelated history or waive a real credential finding. Functional checks
do not consume that additional security allowance.

CI keeps a stable required result and collects selected job outcomes. N/A means
confirmed not applicable; it is not a test pass. Failure, cancellation, timeout,
missing evidence or an unexpected skip for required work must fail the gate.
Concurrent runs only replace the same task/PR and workflow. Do not modify remote
protection or account-level review/notification settings without approval for
the exact change.

## Commit, push and GitHub records

Routine commits and task-branch pushes use the two fixed operations of
`scripts/task-git.mjs` (`commit --message-file <file>` or
`commit --message <text>` for staged changes, and `push` for the checked-out
task branch). The helper verifies the worktree, a non-main task branch, the
expected origin and the installed core-credential hooks before it writes, and
runs Git from fixed argument arrays; the hooks run as usual. If it refuses or
cannot run, that write stops: do not fall back to raw `git commit` or
`git push`, which are never allowed automatically. It guards against accidental
misuse; it is not a sandbox against a hostile agent.

Issue comments and formal PR reviews ask for confirmation, and so does
`gh pr edit`. A PR comment on the current task PR, after the outbound credential
check, does not. None of these records is new Owner authority unless it records
an explicit Owner task, change or review instruction.

## Production and cloud tools: two gates

Production and cloud tools (for example `tcb`, `tccli`, `cloudbase`, `coscli`
and the CloudBase MCP tools) are never allowed automatically. They may be
invoked only when both gates hold:

1. the current task explicitly authorizes the specific cloud or Production
   operation, its account and resource scope, read/write boundary, cost boundary
   and delivery stop;
2. the native ask prompt for the actual invocation is confirmed.

In an ordinary Web, Apple, CMS, documentation or review task, do not invoke a
cloud command merely to produce an approval prompt; stop and report the scope
conflict instead. An approval prompt confirms that concrete tool call only. It
does not create Production authority, widen the task, authorize destructive
operations or permit credentials to be exposed.

## Load the common rules once per task context

The repository has two standard entry files:

- Root `AGENTS.md` holds common authority and routes to this workflow and the
  relevant platform instructions.
- Root `CLAUDE.md` imports it with `@AGENTS.md`.
- `apps/apple/AGENTS.md` adds Apple-specific requirements;
  `apps/apple/CLAUDE.md` imports its sibling with `@AGENTS.md`.
- Existing Web/Admin local guidance remains scoped to those directories. Do not
  create a third `AGENT.md` convention or duplicate these shared rules.

Codex discovers project guidance from the repository root toward its startup
directory, with the documented `AGENTS.override.md` precedence. Starting at the
root does not preload every descendant's instructions. Claude Code discovers
`CLAUDE.md` and supports relative `@` imports; deeper instructions are loaded
when that scope is accessed. Therefore a root-started Apple task must explicitly
read the Apple rules before planning or writing.

Read the full applicable authority — the root entry, the Constitution, the
active amendments, this workflow and the local rules for the task's paths — when
entering a task context: a new task, a tool handoff, or after those files
changed. Within the same unchanged task context, reuse what was read; a small
check that the rule files are unchanged (for example their Git blob ids) is
enough. Read the latest task specification and decisions when they matter, the
explicit delta and affected rules for a change, and current facts only for a
status report. Refresh the local instructions when work enters another
directory's domain.

After rule edits or a tool handoff, have the current session explicitly read the
root entry, its referenced authority/workflow and the applicable local rules.
Use this one-time request:

> Reload the current root AGENTS.md, CLAUDE.md, referenced active authority and
> task workflow, plus the local instructions for this task's allowed paths.
> State the task ID, actual worktree/branch/HEAD, allowed paths, writer role,
> next applicable check and delivery stop. Preserve existing work and evidence.

This explicit read supplies current task context; it does not claim an existing
session's startup prompt automatically refreshed. A newly launched session in
the same worktree rebuilds discovery without recreating the worktree or project.
For Claude Code, `/memory` can inspect instruction sources. Report actual tool
loading separately from static link/import checks, and mark unexecuted tool
diagnostics NOT TESTED. Do not install tools or change global configuration just
to obtain a diagnostic.

See
[Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
and [Claude Code memory/imports](https://code.claude.com/docs/en/memory).
Installed versions and session behavior must be checked rather than inferred
from file names alone.

## Transfer the writer role

Stop the current writer and source-changing commands, then write a short
task-specific private handoff. The next tool verifies the live state and resumes
the same worktree, branch and PR. Preserve staged versus unstaged content,
untracked files, local-only commits, private configuration and usable
environment. Record the local HEAD and the PR head separately: a legitimate
unpushed local commit is reconciled, not discarded. Compare content identity
(the recorded diff and untracked-file fingerprints), not only file names. Do not
reset, stash, rebuild a project or perform an extra commit/push merely for
handoff. If no handoff could be written before quota exhaustion, reconstruct it
read-only from the actual state before continuing. The checkpoint is advisory
coordination, not a lock: when a material unexplained difference or an actual
competing writer exists, pause writing and ask the smallest necessary question.

```text
Task ID and scope: Apple / Web / Shared; allowed paths; non-goals
Worktree, branch, HEAD, PR:
Writer and handoff state:
Completed / remaining / waiting:
Staged / unstaged / untracked paths:
Commands, results, elapsed execution and preparation time:
Evidence HEAD or worktree content fingerprint; private output paths:
Running task processes, ports and writable data/output ownership:
Next smallest action:
Restrictions, approvals and delivery stop:
```

Review assignments bind the task ID, PR, exact HEAD and actual impact. Keep
explicitly requested `@codex`/`@claude` review entry points and useful same-task
review; do not poll all PRs or turn unrelated failures into this task's work.
Avoid duplicate reviews and comment-triggered repair loops. Tool identity does
not prove independence or create a second GitHub approval identity. Read the
actual diff and preserve required reviews and Owner visual/device acceptance.

Reuse evidence whose content and applicability are unchanged. Previous-HEAD CI
or device acceptance is not current-HEAD evidence, but changing tools alone does
not require a complete rerun. Clean up only this task's confirmed unused
resources, and never include credentials or token-bearing links in a handoff.
