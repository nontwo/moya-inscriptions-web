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
- real record media absent → existing T02 QA virtual media

Development must not require Owner to remember a hidden/manual environment flag
merely to inspect the complete implemented design.

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

## 4. No semantic mixing of real and QA data

Development may show:

real Record A + QA Record B

But must never create:

real CatalogId + prototype facts/title/description

unless a value is explicitly presentation-only QA fallback.

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

- real data;
- QA data;
- Development;
- Production;
- media present/missing;
- content present/missing;
- errors;
- preserved T02 behavior.

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

A future T02 → formal Web migration may happen only through a separately
approved task explicitly named/scoped as T02 Productionization.

It must have its own:

- Scope;
- Behavior Matrix;
- Plan;
- Owner approval.

No ordinary feature task may silently perform that migration.

## 16. Model choice does not alter authority

Suggested resource workflow:

- architecture/Plan → GPT-5.6 Sol High
- implementation → GPT-5.6 Terra High
- mechanical Git/small fixes → GPT-5.6 Luna

Model choice never changes or overrides constitutional rules.

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

## 21. Legacy root `AGENTS.md` audit

This audit covers
`integration/mvp@c9bf6eceab55d55ebedd25f7af6e4e46fb4d9830:AGENTS.md`. Each
substantive legacy rule has one classification. `MODERNIZE` retains the
architectural purpose with more precise current wording; `MERGE` identifies the
existing Constitution rule that already provides its protection.

| Legacy rule                                                                                                                                                 | Classification | Current disposition and rationale                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build a mobile-first digital archive for Chinese cliff inscriptions and stone inscriptions.                                                                 | MODERNIZE      | The inscription-only wording is now too narrow because the current repository formally supports `inscription` and `calligraphy`. §19 now states the broader source-independent Chinese cultural-object Catalog and community product purpose without authorizing speculative implementation; mobile-first remains separately protected by the modernized mobile-first rule. |
| Install: `pnpm install`.                                                                                                                                    | RETIRE         | This is a setup command, not a universal completion rule. The committed `pnpm-lock.yaml` pins the workspace dependency graph, while installation depends on the task environment. §19 requires proportionate validation instead.                                                                                                                                            |
| Development: `pnpm dev`.                                                                                                                                    | RETIRE         | A development server has no validation role for a documentation-only change and is not required for every implementation task. User-visible work still requires the scoped validation and Owner acceptance required by §§10, 12, and 14.                                                                                                                                    |
| Build: `pnpm build`.                                                                                                                                        | MODERNIZE      | §19 requires a build where the affected scope is buildable and relevant, avoiding meaningless builds for documentation-only work.                                                                                                                                                                                                                                           |
| Lint: `pnpm lint`.                                                                                                                                          | MODERNIZE      | §19 requires lint where applicable rather than ritual execution for every non-runtime task.                                                                                                                                                                                                                                                                                 |
| Type check: `pnpm typecheck`.                                                                                                                               | MODERNIZE      | §19 requires typecheck where applicable rather than ritual execution for every non-runtime task.                                                                                                                                                                                                                                                                            |
| Test: `pnpm test`.                                                                                                                                          | MODERNIZE      | §19 requires relevant automated tests where applicable and keeps §10's Behavior Matrix validation policy.                                                                                                                                                                                                                                                                   |
| UI components must not query PostgreSQL directly.                                                                                                           | PRESERVE       | §19 retains this direct frontend data-boundary protection.                                                                                                                                                                                                                                                                                                                  |
| Shared data types may only be defined in `packages/contracts`.                                                                                              | MODERNIZE      | §19 confines Public API, cross-workspace, and domain-boundary contracts to `packages/contracts`, while allowing genuinely feature-local presentation/helper types to remain local. This matches the current public-contract boundary without forcing local UI types into a shared package.                                                                                  |
| Shared colors, spacing and typography may only be defined in `packages/design-tokens`.                                                                      | MODERNIZE      | §19 reserves shared semantic design-system values for `packages/design-tokens`, while allowing component-local geometry/layout values and preventing duplication of existing tokens. This matches ADR 0007's semantic token direction without token sprawl.                                                                                                                 |
| Public Web, Admin, SSR and Server Components must obtain business data through the HTTP API and may only type-import Public DTOs.                           | MODERNIZE      | §19 preserves the approved Web/Admin HTTP/Public API boundary and forbids frontend imports of repository/query-port/backend runtime implementations. It does not overgeneralize HTTP to every internal server-side concern where no such boundary exists.                                                                                                                   |
| Object keys and storage details are backend-only; frontend receives resolved URLs and must not compose CDN URLs.                                            | PRESERVE       | §19 retains the media/storage boundary established by ADRs 0003 and 0006.                                                                                                                                                                                                                                                                                                   |
| Do not hard-code production domains, API keys or CDN addresses.                                                                                             | PRESERVE       | §19 retains the production configuration restriction.                                                                                                                                                                                                                                                                                                                       |
| All public interfaces must be mobile-first.                                                                                                                 | MODERNIZE      | §19 preserves mobile-first responsive behavior for end-user Yoyi product interfaces without incorrectly imposing the same priority on Admin/internal tooling.                                                                                                                                                                                                               |
| Do not modify files outside paths assigned in the task prompt.                                                                                              | MODERNIZE      | §19 freezes functional scope while allowing necessary supporting files; deliberate Owner file allowlists remain binding. This avoids invalidating a correctly scoped implementation solely because a required test/helper file was not enumerated word-for-word.                                                                                                            |
| Do not upgrade dependencies unless explicitly requested.                                                                                                    | PRESERVE       | §19 retains explicit task approval for dependency upgrades.                                                                                                                                                                                                                                                                                                                 |
| Database changes must use migrations.                                                                                                                       | PRESERVE       | §19 retains migrations as the required database schema-change path.                                                                                                                                                                                                                                                                                                         |
| Never commit secrets, tokens or real environment credentials.                                                                                               | PRESERVE       | §19 retains the credential and secret protection.                                                                                                                                                                                                                                                                                                                           |
| Do not redefine contracts locally inside feature modules.                                                                                                   | MODERNIZE      | §19 prohibits local redefinition of existing Public Contracts while allowing feature-local types that are not shared/domain-boundary contracts.                                                                                                                                                                                                                             |
| Runtime workspaces must not read raw source datasets except through an explicitly approved controlled importer; frontend can never receive that capability. | MODERNIZE      | §19 retains the frontend prohibition and limits source input to the architecture-approved, manifest-controlled backend importer, consistent with ADR 0006's canonical runtime source.                                                                                                                                                                                       |
| Every task runs lint, typecheck, relevant tests, and build where applicable.                                                                                | MODERNIZE      | §19 makes the same delivery intent applicability-based and explicitly permits proportionate governance validation.                                                                                                                                                                                                                                                          |
| Every task lists modified files.                                                                                                                            | PRESERVE       | §19 retains this completion-reporting requirement.                                                                                                                                                                                                                                                                                                                          |
| Every task reports deviations from assigned scope.                                                                                                          | MERGE          | §§1, 9, 17, 18, and §19 already require frozen scope, STOP reporting for conflicts/blockers, and delivery reporting of deviations.                                                                                                                                                                                                                                          |
