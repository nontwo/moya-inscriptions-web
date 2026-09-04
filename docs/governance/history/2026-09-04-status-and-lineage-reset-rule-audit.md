# STATUS-AND-LINEAGE-RESET Governance Audit

Date: 2026-09-04

## Purpose

This audit records the rule treatment required to align repository current
truth with the merged implementation at the audited pre-task baseline
`14ee3c0c57a73ee3a3995e9d64c698243c0a2447`.

The audit covered the complete repository tree, current Formal route and E2E
proof, active authority documents, current status and architecture documents,
open Issue and pull-request state, all remote branches, and the separate Catalog
Research repository's P5 closure index.

No product behavior, Public Contract, database schema, migration, importer
semantics, dependency, lockfile, CI workflow, Production resource, or credential
is changed by this task.

## Evidence summary

The executable current Formal path is:

```text
apps/web/app/page.tsx
  → loadProductionProductStates()
  → T02pProductPreview
  → ProductShell
```

`tests/e2e/formal-web.spec.ts` explicitly rejects the old static Formal DOM and
requires the request-rendered React Product Shell.

The previous static composition remains reachable only through the direct
Prototype route and legacy unit-test seam. It is not the Formal `/` route.

Catalog Content V1 Contract, PostgreSQL/API read support, and
`catalog-import/v2` are merged. `T09-F1` frontend presentation remains pending.

## Rule classification

| Existing rule or current claim | Classification | Treatment |
| --- | --- | --- |
| No silent scope expansion | PRESERVE | Unchanged. |
| Development and Production remain distinct | PRESERVE | Unchanged. |
| Real runtime identity must never receive unrelated QA data | PRESERVE | Unchanged. |
| PostgreSQL → Public API → Web presentation is the formal data path | PRESERVE | Unchanged. |
| Prototype and P5 fixtures are non-production | PRESERVE | Unchanged. |
| Public Contract, migration, importer, dependency, and secret boundaries | PRESERVE | Unchanged. |
| User-visible work requires a frozen Behavior Matrix and applicable Owner visual judgment | PRESERVE | Unchanged. |
| Independent actual-diff review and merged-head verification | PRESERVE | Unchanged. |
| Mandatory STOP conditions | PRESERVE | Unchanged. |
| “T02 is awaiting a future Productionization task” | MODERNIZE | The accepted React Product Shell and Formal cutover are now current authority. Future protection applies to replacing the current React implementation. |
| “Production Formal Root is `apps/web/app/route.ts` using the static T02 document” | RETIRE | False after MIG-CUTOVER. Current route is `apps/web/app/page.tsx`. |
| “Production T02 bridge remains current” | RETIRE | Static composition is legacy Prototype/regression evidence only. |
| `transcription persistence/API` as an unimplemented future example | MODERNIZE | Content V1 persistence/API/import is implemented; unrelated future domains remain deferred. |
| Mutable `Current verified commit/tree` fields in dynamic status | RETIRE | A copied branch head becomes stale after the next status commit. Status records an immutable audit baseline and requires resolving the live branch head. |
| T09-C0 as the next backend task | RETIRE | T09-C0, B1A, and B1B are merged; T09-F1 is next. |
| PR #72 as an open implementation pull request | RETIRE | Closed as read-only design reference; no history was deleted. |
| Issue #11 as open work | RETIRE | Closed as completed/superseded by the implemented T04–T09 lineage. |
| Legacy branch disposition scattered across PR history | MERGE | Consolidated in current status: merged-history, superseded, or design-reference; none is an active implementation lineage. |
| Historical milestone narration | PRESERVE + MODERNIZE | Historical facts remain, while the index now includes the later React cutover, paging, P2-00, and Content V1 deliveries. |

## Branch disposition

| Remote branch | Pull request | Disposition |
| --- | ---: | --- |
| `fix/t02-development-composition` | #54 | MERGED HISTORY; squash result is already in `integration/mvp`. |
| `feat/catalog-detail-ui-t09-2` | #52 | SUPERSEDED; closed unmerged and replaced by the accepted React Detail/MIG lineage. |
| `feat/t02p-12-react-detail-gallery-viewer-acceptance` | #69 | SUPERSEDED REFERENCE; closed unmerged after bounded concepts were reimplemented in the current lineage. |
| `feat/t02-petal-quick-actions-rebuild` | #72 | DESIGN REFERENCE ONLY; closed unmerged and must not be rebased, retargeted, merged, or bulk cherry-picked. |

Remote refs may remain for historical traceability. Their existence grants no
implementation authority. Every new task must start from a freshly resolved
latest `origin/integration/mvp`.

## Result

The current authority chain is restored by:

1. a new active amendment recording the React Product and Content V1 state;
2. corrected status, README, Web README, architecture, and milestone documents;
3. an architecture regression test that rejects the old Formal route claim and
   mutable stale-status markers;
4. closure of the obsolete open Issue and design-reference PR;
5. explicit branch dispositions without deleting Git history.
