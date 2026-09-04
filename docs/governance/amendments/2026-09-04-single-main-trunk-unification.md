# Owner Amendment — Single-Main Trunk Unification

- Status: Active
- Effective date: 2026-09-04
- Applies to:
  - repository branch topology;
  - task branch baselines and pull-request targets;
  - stable milestone and release creation;
  - Production release source authority.

## 1. Owner decision

The permanent dual-branch model is retired. `main` is the sole long-lived,
default, and shared development branch.

This amendment supersedes only the former active rules that treated
`integration/mvp` as the development branch and `main` as a separate milestone
branch. It does not change Product behavior, architecture, Contracts, data,
Production authority, or the independent review and merge gates.

## 2. Ordinary task flow

Every ordinary task starts from a freshly fetched and resolved latest
`origin/main` and uses a short-lived task branch:

```text
main
└── short-lived task branch
    → Draft PR to main
    → CI
    → independent actual-diff review
    → expected-head squash merge
    → merged-head verification
    → task branch deletion
```

Direct push to `main`, force-push, history rewriting, and bypass of applicable
review or validation gates remain prohibited.

## 3. Stable milestones and Production releases

A stable milestone uses this sequence:

```text
verified main commit
→ explicit Owner milestone decision
→ annotated tag
→ GitHub Release
```

Production release uses this separate sequence:

```text
approved tag
→ protected Production environment
→ deployment, smoke, and rollback gates
```

An annotated tag or repository document does not itself authorize Production
resources, credentials, import, or deployment.

## 4. Retired topology

The following are no longer current operations:

- `integration/mvp` as a live shared branch;
- `origin/integration/mvp` as a task baseline;
- milestone promotion between permanent branches;
- back-sync between permanent branches.

Accurate historical ADRs, audits, pull-request records, and exact historical
branch-plus-SHA references remain unchanged as evidence. They do not restore the
retired topology or create an active development baseline.

## 5. Preserved protections

This amendment preserves:

- the Constitution and every other non-conflicting active amendment;
- frozen scope and mandatory STOP conditions;
- independent exact-head actual-diff review;
- required validation and merged-head verification;
- Owner gates for visual, directional, security, Production, and unresolved
  decisions;
- the prohibition on direct pushes, force-pushes, and history rewriting;
- separate approval for stable milestones and Production operations.
