# Pull Request

## Task and exact revisions

- Work reference (Issue, task ID, or other Owner-approved reference):
- Base SHA:
- Head SHA:

## Scope

- Goal:
- Non-goals:
- Allowed path scope:
- Modified files:
- Scope deviations (write `None` or explain):

## Behavior

- Behavior Matrix: `Not applicable` / link or table
- Development behavior:
- Production behavior:
- Behavior that must remain unchanged:

## Automated validation

List only applicable checks and include command plus result.

| Surface                                  | Applicability and result              |
| ---------------------------------------- | ------------------------------------- |
| Format / lint / typecheck / unit / build |                                       |
| PostgreSQL validation                    | `Not applicable` / command and result |
| E2E validation                           | `Not applicable` / command and result |
| Other scoped validation                  |                                       |

## Change boundaries

- Dependencies: `None` / details and approval
- Lockfile: `Unchanged` / details and approval
- Database or migrations: `None` / details and approval
- Public Contract or API: `None` / details and approval

## Independent review

- Actual diff and exact-head review: `Pending` / reviewer and result
- Current remote state and review-thread check: `Pending` / result
- Expected head SHA pinned for merge: `Pending` / SHA

## Core-credential check

- Exact staged content and proposed message result:
- Newly outgoing commits and intermediate changes result:
- Exact PR/comment text and specified attachment result:
- Shared delivery allowance, elapsed security time and reused results:
- Any WARN or concrete INCOMPLETE coverage limitation:

Use repository-relative paths, line numbers and categories without matched
values. Ordinary identifiers, public certificates and Git configuration forms do
not require privacy approval. Preserve the configured anonymous identity. The
incremental local check, normal code review and GitHub push protection remain;
there is no separate confidentiality approval process.

## Owner decision gates

Use `Not applicable` unless a gate genuinely applies.

- Visual or real-device acceptance:
- Major product/architecture/data-governance direction:
- Production resource, credential, or deployment authority:
- Unresolved mandatory STOP condition:

A fully machine-verifiable PR with no unresolved Owner gate may be marked Ready,
squash merged by an independent review agent, and verified at the merged head.
Green CI or the implementation-agent report alone is not sufficient.

For an applicable Owner gate, record the Owner judgment for the exact reviewed
head. The independent review agent then performs the routine Ready, merge, and
merged-head operations.

## Risk and follow-up

- Risks:
- Deferred work:
- Merged-head verification plan:
