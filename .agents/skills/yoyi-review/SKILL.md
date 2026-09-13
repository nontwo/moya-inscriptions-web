---
name: yoyi-review
description:
  Independently review one ArtVenn / Yoyi task against its Issue specification,
  the actual diff at the exact head SHA, applicable evidence and review threads.
  Reports blockers with location, consequence and evidence and keeps suggestions
  separate. Use when asked to review a PR, a task branch or a handoff for
  correctness before delivery (审查 / review).
---

# yoyi-review

A reviewer reads; it does not write source. Review binds a task ID, a PR, an
exact head SHA and the actual impact, nothing else.

## Invocation

```text
yoyi-review <PR number | branch | task ID> [--head <sha>]
```

Codex: `$yoyi-review ...`. Claude Code: `/yoyi-review ...`.

## Inputs to inspect, in this order

1. The task record: the Issue at its latest revision (goal, non-goals, scope,
   preserved behavior, acceptance criteria, delivery stop) or the formal
   specification it links.
2. The exact head: `gh pr view <n> --json headRefOid,baseRefName,isDraft` and
   `git diff <base>...<head> --stat`; state the SHA you reviewed. A later commit
   invalidates the review.
3. The actual diff, file by file, against the approved scope: paths outside the
   scope, deletions, both sides of renames, lockfile, migrations, Contracts, CI
   and instruction files.
4. Applicable evidence: CI check runs for that head, the task's private
   validation `summary.json` when the writer shared its path, and whether the
   evidence matches the reviewed head (previous-head evidence never counts).
5. Review threads and the PR template sections; Owner gates that apply (visual
   or real-device acceptance, directional decisions, Production authority).

## What the reviewer must not do

- Edit, format, generate or test-write in the writer's worktree. If a
  reproduction needs a checkout, use a separate review worktree and separate
  output directory; hand findings back to the writer for fixes.
- Reopen settled design merely because another implementation is possible.
- Infer delivery authority. `Ready` and merge follow the task record's explicit
  authorization and the active review-and-merge amendment; an explicit Draft
  stop overrides the general permission. Production authority is never inferred.
- Poll unrelated PRs, start review-of-review loops or repeat unchanged full
  suites.

## Report format

```text
Reviewed: <PR> at <head sha>; base <sha>; task <id> r<n>
Blockers (must fix before delivery):
  - <path:line> — what is wrong — consequence — evidence
Suggestions (non-blocking): ...
Scope: within approved paths | deviations: ...
Evidence: CI <result for head> | private summary <PASS/FAIL/NOT TESTED> | Owner gates: <applicable / satisfied / pending>
Decision: approve for the recorded delivery stop | changes requested | STOPPED — OWNER DECISION REQUIRED
```

Blockers name a location, a consequence and the evidence that supports the
claim; a suspicion without evidence is a suggestion. Tool or model identity does
not make a review independent; a separate session that read the actual diff
does. Write the report to the PR as a review comment only when the task asks for
it; otherwise return it to the Owner.
