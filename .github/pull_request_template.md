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

## Public safety

- Git identity setup:
  `node scripts/setup-safe-git-identity.mjs --verify-and-apply`
- Public-safety range check:
- PR title and body scanned with `node scripts/check-public-text.mjs`:
- GitHub noreply identity confirmed:
- Personal paths and private locators absent:
- Changed binary files: `None` / list files
- New or modified image/document metadata scanned: `Not applicable` / result
- No unsafe public content or metadata added:

## Change boundaries

- Dependencies: `None` / details and approval
- Lockfile: `Unchanged` / details and approval
- Database or migrations: `None` / details and approval
- Public Contract or API: `None` / details and approval

## Independent review

- Actual diff and exact-head review: `Pending` / reviewer and result
- Current remote state and review-thread check: `Pending` / result
- Expected head SHA pinned for merge: `Pending` / SHA

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
