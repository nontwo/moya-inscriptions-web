# Repository Development Authority

Before planning or modifying repository files, read:

1. `docs/governance/OWNER-DEVELOPMENT-CONSTITUTION.md`;
2. every active amendment under `docs/governance/amendments/`.

The authority order is:

1. explicit current Owner instructions and active Owner amendments;
2. the Constitution;
3. task-specific frozen Scope and Behavior Matrix;
4. approved Plan and implementation prompt;
5. model, agent, or tool inference.

The active amendments are:

- [`2026-08-24 machine-verified review and merge`](docs/governance/amendments/2026-08-24-machine-verified-review-and-merge.md),
  which reserves Owner involvement for visual or real-device judgment,
  major-direction decisions, production authority, and unresolved STOP gates;
- [`2026-09-04 React Product current authority`](docs/governance/amendments/2026-09-04-react-product-current-authority.md),
  which records the merged React Formal Root, the non-production Prototype
  boundary, and the implemented Catalog Content V1 state.
- [`2026-09-04 single-main trunk unification`](docs/governance/amendments/2026-09-04-single-main-trunk-unification.md),
  which establishes `main` as the sole shared development branch and defines
  tag- and release-based stable milestones.
- [`2026-09-07 confidentiality and preflight`](docs/governance/amendments/2026-09-07-confidentiality-and-preflight.md),
  explicitly revised by the Owner to incremental core-credential checks with a
  shared 120-second security-work allowance. Ordinary identifiers and Git
  configuration forms are not credential findings or approval gates.

- [`2026-09-07 P2-04 Payload editorial automation`](docs/governance/amendments/2026-09-07-p2-04-payload-editorial.md),
  which authorizes the bounded CMS server integration and controlled content
  automation while preserving public contracts and separate cutover authority.
- [`2026-09-11 Community V1 scope`](docs/governance/amendments/2026-09-11-community-v1-scope.md),
  which authorizes the bounded Community V1 domain — public-user identity,
  Backend-owned sessions, the Comment V1 model, its API boundary, the
  Owner-controlled publication setting and moderation — through the Mission 2A →
  2B → 2C sequence, with the Owner's product decisions recorded.

No lower-level prompt, Plan, implementation decision, PR description, inferred
best practice, or code comment may relax or override a higher authority.

If a task conflicts with the current authority chain: STOP and report the
conflict. Do not silently expand scope. Do not modify nested Owner-local
instruction files unless explicitly authorized.

Before commit, push or exact non-Git publication, follow the active core-check
amendment. Scan actual staged versions/messages and all newly outgoing commits,
reuse context-aware results, and share one delivery allowance. Distinguish PASS,
WARN, BLOCK and INCOMPLETE. Only high-confidence core credentials cause BLOCK;
INCOMPLETE pauses only the unchecked outward action. Preserve the anonymous Git
identity without repeated identity approval or a separate privacy review.

## Task scope and tool compatibility

Before planning or writing, read
[`docs/development/task-workflow.md`](docs/development/task-workflow.md). It is
the shared task, verification, review and handoff convention for every tool. For
an Apple task, also read [`apps/apple/AGENTS.md`](apps/apple/AGENTS.md), even
when the session starts at the repository root. For other affected directories,
read their applicable existing local instructions. Reading another platform's
instructions or interfaces does not grant write authority there.

Scope follows the current task, actual changed paths and necessary dependencies.
It does not follow the model, tool, author account or branch prefix. Codex and
Claude Code may each implement, test, independently review or take over any
authorized task. One mutable worktree has one writer at a time; the shared
workflow explains how to transfer that role without discarding work.

Use `node scripts/verify-task.mjs --base origin/main --output <private-output>`
from the task worktree root to select applicable verification. The daily
`pnpm verify` requirement in contributor guidance applies to Web work; it is not
a prerequisite for Apple-only or instruction/documentation-only work. Do not run
unrelated platform checks or expand a failed check into another task. Preserve
real shared-contract and integration obligations.

Honor an explicit task delivery stop, including a Draft PR stop. It takes
precedence over the general amendment permitting routine agent-managed merges.

## Code Review Rules

Review the assigned task's actual diff and exact HEAD against its scope and
applicable evidence. A separate session can provide independent review using the
same or a different tool; tool branding and author self-report do not prove
independence. Preserve existing required reviews and Owner visual/device gates.
Do not monitor unrelated PRs or create review/fix loops. New changes require
review of their impact; changing tools alone does not invalidate valid evidence.
