# 当前项目状态

最后审计：2026-09-04

本文件是 current project status、active Phase 2 work、Production
gaps 与远端 lineage disposition 的唯一动态来源。历史实现过程保留在 PR、ADR 与
`docs/history/`，不作为当前任务状态。

## 基线读取规则

```text
Shared development branch:
integration/mvp

Audited capability baseline:
14ee3c0c57a73ee3a3995e9d64c698243c0a2447
feat(import): add Catalog import v2 (#86)
```

该 SHA 是本次全仓审计所依据的不可变能力基线，不是一个会自动更新的“current
head”字段。每个新任务开始前必须 fetch 并实时解析最新
`origin/integration/mvp`；不得复制本文件中的历史审计 SHA 作为分支起点。

`main` 仍是待 Owner milestone promotion 的稳定基线，不是当前开发主线。

## 当前阶段

```text
Phase 2 — trustworthy read-only digital Catalog MVP
```

目标是发布具有受治理内容、真实媒体、正式搜索、最小 Operator
governance 和可恢复 Production operations 的只读 Catalog。

Phase 2 当前不扩展到普通 public-user
identity、favorites/likes、comments、posts、user upload、social
following、messaging、native mobile apps、transactions、AI
recommendation、OCR 或 knowledge graph。

## 已完成的 Formal Web

### Formal root

```text
apps/web/app/page.tsx
  → request-rendered Production states
  → T02pProductPreview
  → ProductShell
```

Formal `/` 已完成 React cutover。旧 static T02 document 不再是 Formal
runtime；它只保留为 direct Prototype 和 legacy regression evidence。

### Product Shell

当前正式 React Product 包含：

- Home、Inscriptions、Calligraphy；
- Settings、theme 与 feed-layout preference；
- platform/orientation handling；
- Back/Forward 与 canonical query/history；
- per-destination scroll restoration；
- Detail scroll restoration；
- opener focus restoration；
- mutually exclusive Topic、Detail、Viewer 与 Settings layers；
- Development/QA 与 Production isolation。

### Home and Browse

```text
Home Discover:
real Public Catalog first page

Home Nearby:
truthful unavailable in Production

Home Topics:
truthful unavailable in Production

Inscriptions:
kind=inscription + explicit progressive loading

Calligraphy 全部:
kind=calligraphy + explicit progressive loading

Calligraphy 墨迹 / 拓本:
truthful classification-unavailable
```

Initial server page is `page=1&pageSize=24`. Later pages use explicit
“继续加载”, preserve existing records on failure, support same-page retry, and
retain mounted list/scroll/opener state across Detail/Viewer journeys. Home
Discover does not yet progressively load.

No canonical `ink/rubbing` field exists. Formal UI must not infer classification
from titles, aliases, summaries, periods, media, or hard-coded IDs.

### Detail and media

One shared Catalog Detail and Viewer currently support:

- truthful loading/not-found/unavailable/unexpected-error states；
- current pre-Content-V1 Detail presentation；
- no-media、single-media、multiple-media and failed-media states；
- bounded Detail Carousel；
- full-screen Viewer；
- fit、zoom、pan、pinch and media paging；
- owned-media validation；
- direct Detail/Viewer query entry；
- Back/Forward、scroll and focus restoration。

## Backend, data, and import capabilities

Completed foundation includes:

- strict Public Catalog list/detail Contracts；
- `CatalogKind = inscription | calligraphy`；
- page-based list query and error contracts；
- Public Catalog list/detail HTTP API；
- backend application boundary and `CatalogQueryPort`；
- PostgreSQL 18.4 adapter、queries、migrations and readiness ledger；
- backend-owned `StorageUrlResolver` boundary；
- controlled CSV/XLSX importer；
- dry-run、hash-bound approval、transactional apply and idempotent replay；
- `catalog-import/v1` backward compatibility；
- `catalog-import/v2` Content V1 support；
- deterministic JSON Schema and OpenAPI generation；
- format、lint、typecheck、unit/integration、PostgreSQL、build and browser E2E
  CI。

## P2-01 — Catalog Content V1

```text
T09-C0:  CLOSED / PASS
Contract, roles, content fields, citation scopes, JSON Schema, OpenAPI, ADR

T09-B1A: CLOSED / PASS
PostgreSQL persistence, ordered contributors, citation scopes, read projection,
explicit Public mapping and Detail API readback

T09-B1B: CLOSED / PASS
catalog-import/v2 XLSX/CSV, canonical hash, dry-run, approval, transactional
apply, rollback, replay and v1 compatibility

T09-F1:  PENDING
React Detail presentation for all Content V1 fields and scoped citations
```

Current Content V1 fields are:

- `contributors`;
- `scriptStyle`;
- `transcription`;
- `historicalContext`;
- `scholarlyResearch`;
- source-citation `appliesTo`.

The backend and importer support these fields. Current React Detail still
renders the earlier field set, so T09-F1 is the next bounded Product task.

## Production gaps

The repository does not currently contain:

- a persistent Production PostgreSQL dataset；
- Production database credentials；
- a configured Production media provider；
- a real Production media manifest and URLs；
- formal Search V1；
- Operator identity/publication governance；
- deployment automation or a Production release；
- verified backup/restore and release rollback evidence；
- Production domain、HTTPS、logs or monitoring。

The earlier 28-record P5 validation used disposable PostgreSQL and backend
infrastructure. It proved importer/API correctness but did not create a
persistent Production dataset or publication.

## Remaining Phase 2 roadmap

### P2-01 remaining — T09-F1

Present contributors, script style, transcription, historical context, scholarly
research, and scoped citations in the existing React Detail without creating a
second Detail implementation or inventing missing Production values.

### P2-02 — Production Data and Media Pilot

Bounded scope:

- persistent PostgreSQL environment；
- approved 10–30 record initial import；
- readback and replay；
- real media manifest；
- approved storage resolver；
- real Public media URLs；
- backup and restore rehearsal；
- rollback and Production smoke evidence。

The Pilot does not require all 1658 SourceRecords to be researched first.

### P2-03 — Search V1

Bounded scope:

- governed Search Contract；
- Chinese normalization；
- PostgreSQL search/ranking；
- deterministic pagination；
- Golden Query Set；
- Public Search API；
- frontend Search presentation。

Local array filtering is not Search V1. Elasticsearch, vector databases, and AI
embeddings are not pre-authorized.

### P2-04 — Minimal Operator Governance

Bounded scope:

- Operator identity；
- import-batch and validation visibility；
- publication approval；
- withdrawal；
- audit identity and timestamps。

This is not ordinary public-user authentication or a full CMS.

### P2-R2 — Production Release Gate

Bounded scope:

- Web、backend、PostgreSQL and object storage；
- domain、HTTPS and secrets；
- logs and basic monitoring；
- backup/restore；
- deployment rollback；
- real-device Production smoke；
- explicit `integration/mvp → main` milestone promotion。

## Next task

```text
Next Product task:
T09-F1 — Catalog Content V1 React Detail presentation

Required branch origin:
fresh latest origin/integration/mvp
```

After T09-F1, the next backend/operations milestone is the bounded P2-02
Production Data and Media Pilot. Do not extend importer or persistence
infrastructure without a concrete Pilot blocker.

## Current remote lineage disposition

No historical feature branch is an active implementation base.

| Branch                                                |  PR | Current disposition                                                               |
| ----------------------------------------------------- | --: | --------------------------------------------------------------------------------- |
| `fix/t02-development-composition`                     | #54 | MERGED HISTORY; squash result is already in `integration/mvp`.                    |
| `feat/catalog-detail-ui-t09-2`                        | #52 | SUPERSEDED; closed unmerged and replaced by the current React Detail/MIG lineage. |
| `feat/t02p-12-react-detail-gallery-viewer-acceptance` | #69 | SUPERSEDED REFERENCE; closed unmerged after bounded concepts were reimplemented.  |
| `feat/t02-petal-quick-actions-rebuild`                | #72 | CLOSED DESIGN REFERENCE ONLY; never merge, retarget, rebase, or bulk cherry-pick. |

Remote refs may remain for traceability. Their existence does not grant
implementation authority. PR #72 is closed, and obsolete Issue #11 is closed as
completed.

## Research relationship

`moya-catalog-research` remains an independent private research/evidence system.

Its P5 software delivery is CLOSED / PASS:

- 1658 immutable SourceRecords were ingested and validated；
- the Pilot resolved and researched a bounded subset；
- 28 canonically ready records were exported；
- 5 title-blocked PART records were safely excluded；
- 28 records passed disposable PostgreSQL import and Public API readback；
- zero silent loss and zero silent invention were recorded。

The current Research export target remains `catalog-import/v1`. A future
separately scoped research delivery is required to produce approved Content V1
data through `catalog-import/v2`.

## Explicitly deferred

Phase 2 critical path excludes:

- public-user authentication；
- favorites、likes、comments and posts；
- user uploads and social graph；
- notifications and messaging；
- native iOS、Android、HarmonyOS or visionOS apps；
- transactions；
- OCR and recommendation；
- knowledge graph；
- generic taxonomy framework；
- broad Prototype/static-seam cleanup；
- cosmetic directory or component renaming。

## Branch and release policy

- shared branches are `integration/mvp` and `main`；
- task branches start from a freshly fetched latest `integration/mvp`；
- each task uses an isolated worktree and bounded branch；
- each task passes Draft PR、CI、actual-diff review、expected-head merge and
  merged-head verification；
- no direct push to shared branches；
- no force-push or history rewrite；
- `main` changes only after an explicit Owner milestone decision；
- Production release requires the P2-R2 gate。
