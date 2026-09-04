# Single-main trunk unification rule audit

This completed governance audit records how the Owner-approved single-main
topology changes the prior active branch model without silently discarding its
protections. Historical ADRs, audits, PR records, and exact historical
branch-plus-SHA references remain evidence and are not rewritten.

| Prior rule or concern                                                                                                                               | Classification | Current disposition                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Short-lived task branches, Draft PRs, CI, independent actual-diff review, expected-head squash merge, branch deletion, and merged-head verification | PRESERVE       | The workflow is unchanged and now targets `main`.                                                                                   |
| No direct push, force-push, or history rewrite on a shared branch                                                                                   | PRESERVE       | The protection now applies to the sole shared branch, `main`, and is enforced by the active ruleset.                                |
| Permanent development branch plus separate milestone branch                                                                                         | RETIRE         | The dual-branch topology is removed by explicit Owner decision.                                                                     |
| `integration/mvp` as the live task base and PR target                                                                                               | RETIRE         | New tasks resolve `origin/main`; accurate historical references remain unchanged.                                                   |
| Milestone promotion between permanent branches                                                                                                      | MODERNIZE      | A verified `main` commit becomes a stable milestone only after Owner approval, annotated tag creation, and GitHub Release creation. |
| Production release source                                                                                                                           | MODERNIZE      | Production starts from an approved tag and proceeds through protected environment, deployment, smoke, and rollback gates.           |
| Branch topology statements spread across current contributor, architecture, status, security, and governance files                                  | MERGE          | Current authority now consistently delegates topology to the single-main amendment and branching strategy.                          |
| Historical branch names and exact historical SHAs                                                                                                   | PRESERVE       | Historical directories, ADRs, audits, and task records are excluded from current-authority anti-drift assertions.                   |

The preserved legacy line remains reachable through the annotated tag
`archive/main-before-trunk-unification-2026-09-04`. The temporary archival
branch may be deleted only after the governance reconciliation PR, required CI,
merge, and merged-head verification all pass.
