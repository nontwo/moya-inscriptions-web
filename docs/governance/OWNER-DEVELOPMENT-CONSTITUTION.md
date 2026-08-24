# Yoyi Owner Development Constitution

## Authority hierarchy

The repository establishes this authority order:

1. Explicit Owner amendment to the Constitution
2. `docs/governance/OWNER-DEVELOPMENT-CONSTITUTION.md`
3. task-specific frozen Scope + Behavior Matrix
4. approved Plan
5. implementation prompt
6. model/Codex inference or best-practice judgment

A lower level must never override a higher level.

Generic instructions such as:

- continue
- improve
- optimize
- use best practices
- make it long-term
- clean this up

do NOT constitute an amendment to the Constitution.

Only an explicit Owner instruction changing a specific constitutional rule may
amend it.

## 1. No silent scope expansion

Every task must freeze:

- goal;
- non-goals;
- behaviors that must remain unchanged;
- Development behavior;
- Production behavior.

Implementation may only satisfy approved scope.

No speculative:

- subsystem;
- domain;
- framework;
- abstraction;
- page;
- route;
- contract;
- DB field;
- migration;
- state framework;
- duplicate UI.

If current scope cannot satisfy the requirement:

STOP and require Owner decision.

## 2. T02 current UI authority

Until an explicit future `T02 Productionization` task is approved:

T02 remains the single current authority for Web user-facing UI and interaction
behavior.

This includes:

- layout;
- navigation;
- cards;
- Detail;
- Gallery;
- Focus Viewer;
- gestures;
- zoom/pan;
- history;
- back;
- scroll restoration;
- responsive behavior.

Functional tasks may modify narrowly scoped data/runtime wiring, including:

- data sources;
- CatalogId binding;
- API calls;
- loading/error wiring;
- presentation mapping.

They must NOT create second implementations of approved T02 behavior.

> Change the data/function path, not duplicate the approved UI.

## 3. Development and Production are permanently distinct

### Development / Owner QA

Purpose:

> real functionality + complete design/testing coverage.

Development may contain BOTH:

- real Public/runtime data;
- explicit T02 QA/prototype fixtures.

They must remain semantically distinguishable.

Development must preserve QA fixtures needed to test scenarios not yet covered
by real data, including:

- image aspect ratios;
- multi-image records;
- missing media;
- calligraphy Ink/Rubbing examples;
- sparse fields;
- Detail sections;
- gestures;
- Viewer;
- responsive behavior.

For implemented structural fields lacking authoritative data:

- 简介 missing → `内容待接入`
- 释文 unavailable → section visible + `内容待接入`
- 说明 unavailable → section visible + `内容待接入`
- 资料来源 empty → `内容待接入`
- all 基本资料 absent → `资料待接入`
- real record media absent → truthful missing-media presentation

Independent T02 QA records retain their own virtual media for Development
coverage. A real runtime record must never acquire unrelated QA/demo media.

Development must not require Owner to remember a hidden/manual environment flag
merely to inspect the complete implemented design.

QA fixtures required by the approved Behavior Matrix must be available by
default in normal Development / Owner QA. An explicit diagnostic flag may exist,
but it must not be required to restore basic QA fixtures that are part of normal
Development acceptance.

### Production

Purpose:

> truthful real data only.

Production must:

- show only formal Public/runtime data;
- exclude prototype fixtures;
- exclude QA virtual media;
- exclude `内容待接入`;
- exclude `资料待接入`;
- omit absent optional sections;
- use truthful missing-media presentation.

Frozen principle:

> 正式态忠于真实数据；开发态忠于完整设计。

### Prototype fixture boundary

Prototype/QA fixture files may remain checked into the repository and available
to the canonical T02 prototype and Development QA. Their repository presence
does not authorize the formal Production root to consume them.

Formal Production composition must exclude prototype-only records and content
sources unless a separate approved Production task explicitly promotes them.

## 4. No semantic mixing of real and QA data

Development may show:

real Record A + QA Record B

But must never create:

real CatalogId A + QA title/media/facts/Detail identity B

Presentation-only QA placeholders are permitted only when their QA nature is
explicit and they do not change canonical identity or canonical data.

Presentation-only QA values must never enter:

- PostgreSQL;
- Public API;
- Public Contracts;
- importer;
- workbook;
- Research;
- canonical runtime data.

## 5. Formal data authority

Formal runtime data follows:

PostgreSQL → Public API → Web presentation.

Prototype field names do not redefine formal Catalog semantics.

Examples:

- `description` → 简介
- `summary` → list/card/search abstract

Frontend may adapt presentation but may not redefine canonical meaning.

## 6. Do not prematurely build future domains

Future needs do not justify implementation by themselves.

Do not add future fields/domains merely because they may eventually be needed.

Examples include:

- transcription persistence/API;
- Person;
- Institution;
- Place;
- subtype taxonomy;
- seal/painting domain expansion;
- CMS;
- knowledge graph;
- annotation/OCR.

Development UI placeholders are allowed without creating formal
persistence/contract fields.

Formal evolution happens only when an approved real requirement requires it.

## 7. Mandatory Behavior Matrix

Every task affecting user-visible behavior MUST freeze a Behavior Matrix before
implementation.

Required shape:

| Scenario | Development | Production | Must Preserve |
| -------- | ----------- | ---------- | ------------- |

Implementation may not begin before this matrix is approved.

If implementation/tests conflict with the Behavior Matrix:

the Behavior Matrix wins.

## 8. Plan Mode limitations

Plan Mode may only determine:

> the smallest implementation that satisfies the already frozen Scope and
> Behavior Matrix.

Plan Mode may not independently redefine:

- product requirements;
- T02 authority;
- data semantics;
- Development/Production policy;
- scope.

Larger ideas must be recorded only as deferred considerations.

## 9. Implementation limitations

Implementation executes the approved Plan.

Implementation must not redesign the Plan.

If a blocker requires scope expansion:

STOP.

Do not compensate with architecture growth.

## 10. Testing policy

Automated tests start during implementation and continuously validate the
approved Behavior Matrix.

Tests do not define requirements.

For T02 integration, tests must distinguish as relevant:

- visible real/QA identity;
- content/Catalog ID;
- media origin;
- Detail identity;
- Development versus Production environment;
- media present/missing;
- content present/missing;
- errors;
- preserved T02 behavior.

The physical existence of an old DOM fragment is not sufficient when the
approved user-visible QA behavior or identity is no longer usable. Green CI does
not override the approved Behavior Matrix.

Owner visual/manual testing happens only after the scoped user-facing vertical
slice is complete and automated validation passes.

## 11. Git workflow

Implementation stage:

implementation → automated validation → commit → push → Draft PR → independent
review.

Never automatically:

- merge;
- force-push;
- rewrite history;
- mark Ready;
- close/recreate PR;
- modify unrelated Owner files to make CI pass.

Protected Owner-local files unless explicitly authorized:

- `apps/web/AGENTS.md`
- `apps/web/CLAUDE.md`

## 12. Two-layer review

Layer 1: Independent GitHub code review of actual diff, architecture,
dependencies, CI and scope.

Codex self-report is not sufficient.

Layer 2: Owner manual/real-device acceptance for user-visible work.

Both must pass before merge.

CI passing by itself does not mean DONE. A failed Owner manual/real-device check
keeps the task OPEN.

## 13. Bug-fix boundaries

Owner acceptance failures must first be classified as:

A. bounded implementation bug; B. requirement/Behavior-Matrix ambiguity; C.
genuine architecture blocker.

A bounded UI bug must not reopen architecture.

Architecture planning may reopen only for genuine blockers.

## 14. Definition of Done

A stage is CLOSED only when all applicable items pass:

- approved Scope complete;
- Behavior Matrix satisfied;
- automated tests pass;
- GitHub CI passes;
- actual diff review passes;
- Owner manual/real-device acceptance passes for UI work;
- no deferred scope entered silently;
- merge completed;
- merged-head verification passes.

Otherwise status remains OPEN.

## 15. T02 Productionization must be explicit

Formal Web may consume and serve the current canonical T02 presentation as its
approved UI/interaction authority.

`T02 Productionization` refers only to a future material replacement,
extraction, rewrite, or migration of that canonical presentation into another
formal UI implementation or architecture.

Such a migration may happen only through a separately approved task with its own
Scope, Behavior Matrix, Plan, and Owner approval.

No ordinary feature, data, or runtime task may silently perform that migration
or create a second implementation of approved T02 behavior.

## 16. Model and tool choice does not alter authority

Model or tool choice does not alter repository authority, Owner requirements,
Scope, the approved Behavior Matrix, or governance.

## 17. Mandatory STOP conditions

STOP and request Owner decision if any task requires or encounters:

1. unapproved subsystem;
2. unapproved Public Contract expansion;
3. unapproved DB migration;
4. changing approved T02 UI/interaction to make implementation easier;
5. removal of required QA fixtures;
6. inability to satisfy Development and Production requirements simultaneously;
7. conflict between task Plan and Constitution;
8. unexpected remote state affecting safety;
9. modification of protected Owner-local files;
10. unresolved ambiguity over whether behavior must remain or change.

Use:

`STOPPED — OWNER DECISION REQUIRED`

and report:

- conflict;
- why;
- smallest available options.

Do not silently choose.

## 18. Prompt compliance gate

Before implementation, every task must verify:

- Scope frozen;
- Behavior Matrix frozen where applicable;
- no duplicate existing implementation;
- Development/Production distinction preserved;
- T02 approved behavior preserved;
- no unapproved subsystem;
- no unintended DB/Contract/Import changes;
- no deferred scope leakage;
- tests validate Owner requirements;
- STOP conditions are included.

If any required item is missing:

do not implement.

## 19. Current technical and delivery guardrails

The following rules preserve the applicable protections from the legacy root
instructions while matching the current repository architecture.

### Architecture and data boundaries

- UI and frontend code must not query PostgreSQL directly.
- Formal Web and Admin business reads must use the approved HTTP/Public API
  boundary for the domain. Frontend code must not import repository/query-port,
  backend application, or runtime implementations directly.
- This rule does not require every server-side or internal monorepo concern to
  use HTTP where no approved HTTP/Public API boundary applies.
- Public API, cross-workspace, and domain-boundary contracts belong in
  `packages/contracts`. Feature-local presentation and internal helper types may
  remain local. No feature may redefine an existing Public Contract locally.
- Shared semantic design-system values belong in `packages/design-tokens`.
  Component-local geometry and layout implementation values do not automatically
  require global tokens, and existing shared semantic tokens must not be
  duplicated locally.
- Frontend code must not receive or access object keys, buckets, storage
  provider details, storage credentials, or raw source datasets. It must not
  compose provider or CDN URLs from object keys; it consumes resolved approved
  runtime URLs only.
- Runtime workspaces must use the approved canonical runtime source. A
  controlled backend importer may read approved source input only through its
  explicit architecture allowlist and controlled-import manifest capability.
  Frontend runtimes can never receive that capability.
- Database schema changes require migrations. Dependency upgrades require
  explicit task approval.
- Production domains, API keys, CDN configuration, credentials, secrets, and
  tokens must not be hard-coded or committed.
- Approved architecture boundaries must not be bypassed for convenience.

### Product, scope, and delivery

- Yoyi is a source-independent Chinese cultural-object Catalog and community
  product. The currently approved formal Catalog kinds remain the explicitly
  active contract values, currently `inscription` and `calligraphy`. This
  broader product purpose does not authorize future Catalog kinds, social
  domains, or other deferred systems; each requires its own approved Scope,
  Behavior Matrix, and contract/domain evolution where applicable.
- End-user Yoyi product interfaces remain mobile-first and responsive. This does
  not impose the same presentation priority on Admin or internal tooling.
- Functional scope, non-goals, and preserved behavior are binding. A task may
  modify a necessary supporting test, helper, or configuration file when it is
  within that frozen functional scope. An explicit Owner file allowlist remains
  binding.
- Every implementation task must, where applicable, run lint, typecheck,
  relevant automated tests, and a build when the affected scope is buildable and
  relevant. It must list modified files and report scope deviations or blockers.
- Documentation-only and governance-only tasks use proportionate validation;
  they do not run irrelevant runtime checks merely as ritual compliance.

## 20. Governance evolution and non-silent regression

Governance is allowed to evolve with the project.

Historical constraints are not immutable merely because they are old.

However, creating, reorganizing, consolidating, modernizing, or replacing
governance must never silently discard an existing constraint.

When changing governance:

1. audit the existing applicable rules;
2. classify each affected rule as:
   - PRESERVE
   - MODERNIZE
   - MERGE
   - RETIRE
3. document the rationale for MODERNIZE or RETIRE;
4. ensure MERGE rules retain their substantive protection elsewhere;
5. identify any genuine conflict requiring Owner decision.

A rule may be relaxed or retired when current project evidence objectively
supports doing so.

Do not make governance monotonically stricter merely for safety.

Do not make governance looser merely for implementation convenience.

## Historical governance audits

Completed audit evidence is retained under
[`docs/governance/history/`](history/). In particular, the
[2026-08-21 legacy root `AGENTS.md` audit](history/2026-08-21-legacy-root-agents-audit.md)
records the baseline and every original classification. Historical audits do not
override this Constitution or create current normative rules.
