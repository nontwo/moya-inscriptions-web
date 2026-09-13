---
name: yoyi-task
description:
  Plan, start, change or report one bounded ArtVenn / Yoyi task under the
  repository authority chain. `plan` is read-only analysis, `start` executes an
  approved task, `change` applies an explicit requirements delta, `status`
  reports facts. Use when the Owner asks to scope, implement, revise or report a
  task (计划 / 开始 / 变更 / 状态) in this repository.
---

# yoyi-task

One task, one record, one writer. This skill runs the ordinary task lifecycle
for Codex and Claude Code alike; it does not grant permissions, change the
authority chain or replace the shared workflow in
`docs/development/task-workflow.md`.

## Invocation

```text
yoyi-task plan   <request or Issue reference>
yoyi-task start  <Issue reference | sufficiently explicit request>
yoyi-task change <Issue reference> <explicit requirements delta>
yoyi-task status [Issue reference | task ID]
```

Codex: `$yoyi-task <mode> ...`. Claude Code: `/yoyi-task <mode> ...`. The first
word selects the mode; an unknown or missing mode is a usage error, not a guess.

## Before every mode

1. Read the root `AGENTS.md`, the Constitution, every active amendment, the
   shared task workflow (`docs/development/task-workflow.md` when present) and
   the local instructions for the task's allowed paths (for example
   `apps/apple/AGENTS.md`, `apps/admin/AGENTS.md`). An existing session must
   read them again explicitly; startup loading is not assumed.
2. Establish the real state: repository root, worktree path, branch, HEAD, the
   task's PR if any, and `git status --short`. Report these facts, not
   expectations.
3. Read the task record: the GitHub Issue (`gh issue view <n>`) at its latest
   revision, or the formal specification file it links. Keep its comments and
   decisions; never overwrite an Issue body from stale context.
4. Check the writer state in the task's private checkpoint
   (`~/Developer/artifacts/moya-inscriptions-web/<task-id>/handoff.md`). If
   another actor holds the writer role, do not write; use `yoyi-handoff resume`
   first.

## `plan` — read-only

- Produces a proposed bounded task record with the template fields: task ID and
  revision, goal, non-goals, workstream, approved module scope, behavior that
  must remain unchanged, observable acceptance criteria, data/environment
  restrictions, writer and review responsibility, delivery stop, dependencies
  and Owner decisions. Include the smallest ordered slices and the applicable
  verification for each.
- Makes no source, worktree, branch, Issue, PR, CI or service change. Reading
  files, `git`/`gh` read commands and running nothing else is the whole budget.
- Ends with the sentence `No changes were made.` and the list of decisions that
  are genuinely the Owner's.

## `start` — execute an approved task

- Requires a task record. With an Issue reference, use it. Without one, proceed
  only if the request already fixes goal, non-goals, scope and delivery stop
  well enough to write the record yourself: create the Issue with the task
  template (`gh issue create --template`, or the same fields in a private record
  when `gh` is unavailable), state your interpretation once, and do not ask for
  the same approval again.
- Freeze before writing: task ID, allowed paths, non-goals, preserved behavior,
  delivery stop. A user-visible change also needs the Behavior Matrix the
  Constitution requires.
- Use the task's worktree under
  `~/Developer/worktrees/moya-inscriptions-web/<task-id>/`: resume an existing
  one on its branch, or create one from freshly fetched `origin/main` with an
  explicit start point. Never treat the main checkout as a task worktree.
- Implement only inside the approved scope. A needed change outside it is a
  scope extension: stop and report it as a `change` request or an Owner
  decision.
- Verify with the applicable entry:
  `node scripts/verify-task.mjs --base origin/main --output <new private directory>`
  selects checks from the actual diff; pure Web work may use `pnpm verify`; pure
  Apple work `node scripts/verify-apple.mjs --output <new private directory>`.
  One shared 120-second execution budget; a timeout is a failure. Record
  preparation time separately.
- Deliver to the recorded stop, by default a Draft PR that follows the PR
  template, with the exact base and head SHAs and the Issue reference. Never
  mark Ready, merge, change remote settings or touch Production without the
  explicit authorization the task record names.
- Finish with `yoyi-handoff save` so the next session, whichever tool, can
  resume without rediscovery.

## `change` — apply an explicit delta

- Reread the latest Issue revision first. Apply only the stated delta; every
  unaffected requirement stays verbatim.
- Bump the revision (`r1` → `r2`) and record, in the Issue, what changed, what
  remains unchanged and which earlier requirement is replaced. Never silently
  rewrite an accepted requirement.
- If the delta widens scope into another authority (new subsystem, Contract,
  migration, Production), stop with `STOPPED — OWNER DECISION REQUIRED`.

## `status` — report facts only

- Report worktree, branch, HEAD, PR state, CI result for the exact head, review
  threads, evidence paths, remaining items and open Owner decisions.
- Launch no tests, builds or services; change no scope; open no task.

## Boundaries that hold in every mode

- The authority chain wins over this skill. Conflicts stop the task with
  `STOPPED — OWNER DECISION REQUIRED`, the conflict, why, and the smallest
  options.
- Do not stop, restart or delete another task's processes, containers,
  databases, worktrees or outputs. Persistent Development / Owner-QA data is
  never test data.
- Keep credentials, private paths and private acceptance content out of Issues,
  PRs and tracked files.
- Speak to the Owner in Chinese; write instructions, code and configuration in
  English.
