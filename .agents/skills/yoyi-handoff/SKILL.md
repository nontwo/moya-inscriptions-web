---
name: yoyi-handoff
description:
  Save or resume one ArtVenn / Yoyi task's writer checkpoint so Codex and Claude
  Code can continue the same worktree, branch and PR without rediscovery, resets
  or lost work. `save` releases the writer role after writing a compact
  checkpoint; `resume` verifies live state and acquires it. Use for 交接 /
  handoff / 接手 / continue this task.
---

# yoyi-handoff

One mutable worktree has one writer at a time. The checkpoint is the private,
machine-specific record that transfers that role; the Issue stays the
specification and the PR stays the evidence.

## Invocation

```text
yoyi-handoff save   [task ID]
yoyi-handoff resume <task ID | worktree path>
```

Codex: `$yoyi-handoff ...`. Claude Code: `/yoyi-handoff ...`. The checkpoint
lives at `~/Developer/artifacts/moya-inscriptions-web/<task-id>/handoff.md`
(mode 0600, never tracked). Do not create a global HANDOFF file in the
repository.

## Checkpoint fields

```text
Task ID and scope: <id> r<n> · Apple / Web / Shared · allowed paths · non-goals
Worktree, branch, HEAD, PR: <path> · <branch> · <sha> · <PR or none>
Writer and handoff state: released <tool> <ISO time> | held by <tool> <ISO time>
Completed / remaining / waiting: ...
Staged / unstaged / untracked paths: (from git status --short)
Commands, results, elapsed execution and preparation time: ...
Evidence HEAD or worktree content fingerprint; private output paths: ...
Running task processes, ports and writable data/output ownership: ...
Next smallest action: ...
Restrictions, approvals and delivery stop: ...
```

## `save`

1. Stop every source-changing activity you started: formatters, generators,
   watch modes, tests that write files. Leave other tasks' processes alone.
2. Do not reset, stash, rebuild, commit or push merely to hand off. Staged stays
   staged, unstaged stays unstaged, untracked stays untracked.
3. Record the fields above from the real state (`git status --short`,
   `git rev-parse HEAD`, `gh pr view`), including the exact commands and their
   results, and the fingerprint of the evidence you are leaving behind.
4. Write the checkpoint with `Writer and handoff state: released <tool> <time>`
   and report its path to the Owner. Never include credentials or token-bearing
   links.

## `resume`

1. Read the checkpoint. If none exists (quota exhaustion, crash), reconstruct it
   read-only from the actual worktree, branch, PR and evidence before
   continuing; say so.
2. Verify the live state against it: same worktree path, branch and HEAD;
   `git status --short` matches the recorded staged/unstaged/untracked set; the
   PR head is the recorded SHA. Any difference is reported before writing.
3. Confirm no other writer is active: the checkpoint says `released`, no process
   has the worktree open, and no newer checkpoint exists. An advisory claim is
   not proof that another machine is idle; when in doubt, stop and ask.
4. Acquire the role by rewriting
   `Writer and handoff state: held by <tool> <time>` and continue the same
   worktree, branch and PR. Never create another branch or worktree for a
   handoff.
5. Reuse valid evidence. Unchanged content keeps its results; a changed tool
   alone does not require a rerun. Previous-head CI or device acceptance is not
   current-head evidence.

## Boundaries

- Both tools read the shared rules explicitly after a handoff; a resumed session
  must not assume its startup prompt refreshed edited instructions.
- The checkpoint carries local facts only. Task-level decisions belong in the
  Issue; verification evidence in the PR and the private output directory.
