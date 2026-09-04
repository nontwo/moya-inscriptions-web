# Owner Amendment — React Product Current Authority

- Status: Active
- Effective date: 2026-09-04
- Applies to:
  - the Formal Web root and current Product presentation;
  - T02 Prototype and Development QA boundaries;
  - Catalog Content V1 implementation status;
  - future UI replacement or migration work.

## 1. Reason for this amendment

A repository-wide source, test, document, pull-request, and branch-lineage audit
confirmed that the implementation advanced beyond several current-tense
statements in the Constitution and supporting documents.

The Owner directed that repository current truth be aligned with the complete
merged code before further development. This amendment records the already
merged implementation state; it does not authorize a new product direction or
change user-visible behavior.

## 2. Current Formal Web authority

The Formal `/` route is the request-rendered React application rooted at:

```text
apps/web/app/page.tsx
  → loadProductionProductStates()
  → T02pProductPreview
  → ProductShell
```

The current approved Web presentation is the merged React Product Shell and its
bounded Home, Browse, Detail, Carousel, Viewer, Settings, history, focus,
scroll-restoration, gesture, accessibility, and responsive behavior.

This React implementation preserves the accepted T02 product behavior that was
progressively extracted, independently validated, accepted where visual judgment
applied, and merged through the R01–R03 and MIG delivery lineage. It is now the
single current Formal Web implementation. No task may create a second Formal
Product Shell, Detail, Carousel, Viewer, navigation, or history owner.

## 3. Prototype and legacy static boundary

`/docs/prototypes/mobile-preview/` remains a direct, non-production Prototype
and visual/interaction reference. Its fixtures, local state, demo media, P5
snapshot, and static document are not Production data or current Formal Web
runtime composition.

`apps/web/lib/t02-static-files.ts` and its `formal-root` test seam are retained
legacy compatibility and regression evidence. The current
`apps/web/app/page.tsx` Formal route does not call that seam. Repository
presence must not be described as current Formal runtime authority and does not
authorize Prototype consumption by Production.

Development and QA may continue using explicit synthetic scenarios that remain
semantically distinct from real runtime records. Production continues to use
truthful Public/runtime data only.

## 4. Catalog Content V1 state

Catalog Content V1 is no longer a speculative future field set.

The merged implementation now includes:

- the Content V1 Public Contract;
- contributors and contributor roles;
- script style;
- transcription;
- historical context;
- scholarly research;
- citation scopes;
- PostgreSQL persistence and read projection;
- explicit Public mapping and API population;
- versioned `catalog-import/v2` parsing, dry-run, approval, transactional apply,
  rollback, and replay.

Therefore, the Constitution §6 example `transcription persistence/API` is
superseded as a deferred example. Person, Institution, generic Place, generic
taxonomy, CMS, knowledge graph, OCR/annotation, and other unapproved domains
remain deferred unless separately authorized.

The remaining Content V1 task is bounded frontend presentation (`T09-F1`). This
amendment does not implement or visually specify that task.

## 5. Future presentation changes

The former future `T02 Productionization` migration has already occurred through
the accepted React cutover lineage. Any future material replacement, second
implementation, architecture migration, or redesign of the current React Product
presentation still requires its own explicit Scope, Behavior Matrix, Plan,
applicable Owner visual judgment, independent review, and merge verification.

Ordinary data, API, content, or backend work must change the approved data or
function path without duplicating or silently replacing the current React UI.

## 6. Preserved protections

This amendment does not relax:

- no silent scope expansion;
- Development and Production separation;
- real/QA identity isolation;
- PostgreSQL → Public API → Web data authority;
- Contract, migration, importer, media, and secret boundaries;
- user-visible Behavior Matrix and real-device gates;
- no duplicate UI;
- independent actual-diff review;
- mandatory STOP conditions;
- milestone promotion and production-authority controls.

Where Constitution §§2, 6, or 15 describe the pre-cutover or pre-Content-V1
state, this amendment supersedes only those obsolete state statements. All
substantive protections continue to apply to the current React Product
implementation.
