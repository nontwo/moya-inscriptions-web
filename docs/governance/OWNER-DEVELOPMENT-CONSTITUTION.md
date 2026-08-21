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

T02 remains the single current authority for Web user-facing UI and interaction behavior.

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

Development must preserve QA fixtures needed to test scenarios not yet covered by real data, including:

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

Development must not require Owner to remember a hidden/manual environment flag merely to inspect the complete implemented design.

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

real Record A
+
QA Record B

But must never create:

real CatalogId
+
prototype facts/title/description

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

PostgreSQL
→ Public API
→ Web presentation.

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

Development UI placeholders are allowed without creating formal persistence/contract fields.

Formal evolution happens only when an approved real requirement requires it.

## 7. Mandatory Behavior Matrix

Every task affecting user-visible behavior MUST freeze a Behavior Matrix before implementation.

Required shape:

| Scenario | Development | Production | Must Preserve |
| --- | --- | --- | --- |

Implementation may not begin before this matrix is approved.

If implementation/tests conflict with the Behavior Matrix:

the Behavior Matrix wins.

## 8. Plan Mode limitations

Plan Mode may only determine:

> the smallest implementation that satisfies the already frozen Scope and Behavior Matrix.

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

Automated tests start during implementation and continuously validate the approved Behavior Matrix.

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

Owner visual/manual testing happens only after the scoped user-facing vertical slice is complete and automated validation passes.

## 11. Git workflow

Implementation stage:

implementation
→ automated validation
→ commit
→ push
→ Draft PR
→ independent review.

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

Layer 1:
Independent GitHub code review of actual diff, architecture, dependencies, CI and scope.

Codex self-report is not sufficient.

Layer 2:
Owner manual/real-device acceptance for user-visible work.

Both must pass before merge.

## 13. Bug-fix boundaries

Owner acceptance failures must first be classified as:

A. bounded implementation bug;
B. requirement/Behavior-Matrix ambiguity;
C. genuine architecture blocker.

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

A future T02 → formal Web migration may happen only through a separately approved task explicitly named/scoped as T02 Productionization.

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
