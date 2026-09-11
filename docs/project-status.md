> 2026-09-11 update: T09-F1、Search V1、P2-04 Payload editorial/MCP
> automation 与 P2-R2A 均已合入 `main`。P2-R2B Stage
> B 目标环境已装载 3 条批准资料与 20 个媒体对象并在目标内发布，但公开入口、媒体自定义域名、Production 启动与发布仍未完成，该云端轨道明确 parked。当前没有公开的 Production
> release。Public
> user/community 开发可独立于 parked 的 Production-release 轨道继续，但须先通过其自身的 Owner
> amendment（Community V1）冻结范围。

# 当前项目状态

能力基线审计：2026-09-04；本轮有限事实更新：2026-09-11

本文件是 current project status、active Phase 2 work、Production
gaps 与远端 lineage disposition 的唯一动态来源。历史实现过程保留在 PR、ADR 与
`docs/history/`，不作为当前任务状态。

## 基线读取规则

```text
Shared development branch:
main

Audited capability baseline:
14ee3c0c57a73ee3a3995e9d64c698243c0a2447
feat(import): add Catalog import v2 (#86)
```

该 SHA 是本次全仓审计所依据的不可变能力基线，不是一个会自动更新的“current
head”字段。每个新任务开始前必须 fetch 并实时解析最新
`origin/main`；不得复制本文件中的历史审计 SHA 作为分支起点。

`main` 是唯一长期 shared branch、默认分支和当前开发主线。

## 当前阶段

```text
Phase 2 — trustworthy read-only digital Catalog MVP
```

目标是发布具有受治理内容、真实媒体、正式搜索、最小 Operator
governance 和可恢复 Production operations 的只读 Catalog。

Phase 2 的 Production-release critical path 不包含普通 public-user
identity、favorites/likes、comments、posts、user upload、social
following、messaging、native mobile apps、transactions、AI
recommendation、OCR 或 knowledge graph。自 2026-09-11 起，public
user/community 开发作为独立轨道进行，不以 Production
release 为前提，也不阻塞 Production release；其第一步是 Community V1
scope/architecture
amendment，在该 amendment 获批前不得实现 community 持久化、身份或 API。

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
- Search V1 presentation（fullscreen search、Search → Detail → Back）；
- QA long-press quick actions（Development/QA only）；
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
Discover does not yet progressively load; this remains a separate known product
gap (see “下一步任务”).

No canonical `ink/rubbing` field exists. Formal UI must not infer classification
from titles, aliases, summaries, periods, media, or hard-coded IDs.

### Detail and media

One shared Catalog Detail and Viewer currently support:

- truthful loading/not-found/unavailable/unexpected-error states；
- Catalog Content V1 Detail presentation（contributors、script
  style、transcription、historical context、scholarly research、scoped
  citations；PR #89）；
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
- Public Search API（`GET /v1/catalog-search`）；
- backend application boundary and `CatalogQueryPort`；
- PostgreSQL adapter、queries、migrations and readiness ledger（18.4 local
  development；18.6 verified remote target）；
- backend-owned `StorageUrlResolver` boundary；
- controlled CSV/XLSX importer；
- dry-run、hash-bound approval、transactional apply and idempotent replay；
- `catalog-import/v1` backward compatibility；
- `catalog-import/v2` Content V1 support；
- Payload CMS editorial source（native draft/version/media、Owner
  approval、published-only public reads、editorial MCP automation）；
- deterministic JSON Schema and OpenAPI generation；
- format、lint、typecheck、unit/integration、PostgreSQL、CMS、build and browser
  E2E CI。

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

T09-F1:  CLOSED / PASS
React Detail presentation for all Content V1 fields and scoped citations
(PR #89, merged 2026-09-04)
```

Current Content V1 fields are:

- `contributors`;
- `scriptStyle`;
- `transcription`;
- `historicalContext`;
- `scholarlyResearch`;
- source-citation `appliesTo`.

Backend、importer 与 React Detail 均已支持这些字段。P2-01 整体 CLOSED。

## Production gaps

The repository now contains the P2-R2A production topology (three loopback
services behind Nginx, distinct service users, env templates and systemd units)
and the necessary IP-identity TLS fix for a literal-IP PostgreSQL endpoint (PR
#107). Backup/restore and rollback guidance is still the pre-existing
provider-neutral rollback plan and the P2-04 CMS recovery notes; P2-R2A defers
backup/restore execution to a separately approved production operation. The
repository still does not contain, and no public environment yet provides:

- a public Production release or release tag；
- an Owner-controlled media custom domain bound to the private COS bucket and a
  configured `COS_MEDIA_ORIGIN`；
- a public protected HTTPS entry serving Web and Backend；
- Production real-device smoke, logs or monitoring evidence for a public entry。

The P2-R2B Stage B target environment (new CVM, TencentDB PostgreSQL 18.6 with
`verify-full` TLS, private COS with two least-privilege identities) has been
prepared and loaded with the 3 approved Catalog records and 20 hash-verified
media objects; the 3 records are published on that target, a formal backup and
an isolated restore were verified, and a real Payload Owner account exists. Web
and Backend are not started there because the media domain is unresolved. This
is deployment-candidate evidence, not a Production release. The old personal
server, old COS and the isolated restore database remain unchanged pending Owner
acceptance.

## Remaining Phase 2 roadmap

### P2-01 — CLOSED

All four P2-01 tasks are closed; see above.

### P2-02 — Production Data and Media Pilot

Delivered as the bounded remote HTTPS Pilot (PR #97; protected IP entry, three
real records, twenty verified COS objects). It remains non-production evidence
and was superseded as a data source by the P2-R2B Stage B export and target
load.

### P2-03 — Search V1

已实现并合入主干（PR #101）；保留其已验收前端与公共 API 行为。已交付范围：

- governed Search Contract；
- Chinese normalization；
- PostgreSQL search/ranking；
- deterministic pagination；
- Golden Query Set；
- Public Search API；
- frontend Search presentation。

Local array filtering is not Search V1. Elasticsearch, vector databases, and AI
embeddings are not pre-authorized.

### P2-04 — Payload editorial workflow and Codex automation

The Owner-approved P2-04 amendment replaces the earlier minimal-operator-only
scope with self-hosted Payload Admin, official MCP/REST, PostgreSQL and COS. It
includes native draft/version/media editing, scoped automated batches,
exact-revision Owner approval and published-only public reads. It does not add
ordinary public-user accounts or community features.

Payload Admin、editorial MCP automation 与 published-only 数据读取已合入主干（PR
#102、#104），Stage A 已完成。P2-R2B Stage
B 已在目标环境执行正式 migrations、导入并发布 3 条资料，但正式内容源切换、traffic
cutover 与 XLSX 写入口退役仍未执行；既有写入口继续保留。历史验证与实施过程见
[implementation and evidence](cms/p2-04-implementation.md) and the
[single operations guide](cms/operations.md).

### P2-R2 — Production Release Gate

```text
P2-R2A  Production topology & development readiness   CLOSED / PASS (PR #105)
P2-R2B  Tencent Stage B transfer                      IN PROGRESS — PARKED
```

P2-R2B completed on the target: database identity/TLS/migrations/role
separation, media transfer 20/20 hash-verified, 3 records published, backup and
isolated restore, real Owner account. Parked until explicit Owner instruction:
media custom domain and `COS_MEDIA_ORIGIN`, public protected HTTPS entry,
Web/Backend Production start, real-device Production smoke, release tag, GitHub
Release, ICP/domain work. Do not resume these without explicit instruction.

## 下一步任务

```text
Required branch origin for every task:
fresh latest origin/main
```

Active development tracks (independent of the parked cloud track):

1. **Community V1 scope decision** — the proposed
   [Community V1 scope amendment](governance/amendments/2026-09-11-community-v1-scope.md)
   freezes public-user identity, authentication/session ownership, the Comment
   V1 contract, API boundary, moderation minimum and the #106 integration seam,
   and lists the Owner decisions still open. No Community persistence, identity
   or API is implemented before the Owner records approval. Implementation then
   proceeds in three separately reviewable stages: identity/session foundation →
   comment contract, persistence, API and moderation → connecting the #106 UI
   seam, once Owner-accepted, to the real API.
2. **Home Discover progressive loading** — small product task using the
   established explicit “继续加载” pattern; not mixed into Community work.
3. **Editorial hardening on the local P2-R2A environment** — independent of
   Community work.
4. **Content growth** — separately scoped research delivery through
   `catalog-import/v2`; parallel, non-blocking.

## Current remote lineage disposition

No historical feature branch is an active implementation base.

| Branch                                                |   PR | Current disposition                                                                                       |
| ----------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------- |
| `codex/comment-feature-main`                          | #106 | OPEN DRAFT; QA-only community/comment presentation prototype pending Owner real-device visual acceptance. |
| `ops/p2-r2b-tencent-stage-b`                          | #107 | MERGED; necessary PostgreSQL IP-identity TLS fix and guarded remote 18.6 verification only.               |
| `codex/t02-adaptive-quick-actions`                    |  #94 | CLOSED; superseded by the merged minimal quick actions (#95). Reference only.                             |
| `fix/t02-development-composition`                     |  #54 | MERGED HISTORY; squash result is already in the current `main` lineage.                                   |
| `feat/catalog-detail-ui-t09-2`                        |  #52 | SUPERSEDED; closed unmerged and replaced by the current React Detail/MIG lineage.                         |
| `feat/t02p-12-react-detail-gallery-viewer-acceptance` |  #69 | SUPERSEDED REFERENCE; closed unmerged after bounded concepts were reimplemented.                          |
| `feat/t02-petal-quick-actions-rebuild`                |  #72 | CLOSED DESIGN REFERENCE ONLY; never merge, retarget, rebase, or bulk cherry-pick.                         |

Remote refs may remain for traceability. Their existence does not grant
implementation authority. PR #72 is closed, and obsolete Issue #11 is closed as
completed. #106 is not an implementation base for Community persistence; its QA
data seam is the integration point to be defined by the Community V1 amendment.

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

Phase 2 Production-release critical path excludes:

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

Public-user identity and comments are no longer deferred indefinitely: they form
the independent Community V1 track above, gated by the proposed
[Community V1 scope amendment](governance/amendments/2026-09-11-community-v1-scope.md)
until the Owner records approval. The other items remain deferred unless
separately authorized.

## Branch and release policy

- `main` is the sole long-lived, default, and shared development branch；
- task branches start from a freshly fetched latest `origin/main`；
- each task uses an isolated worktree and bounded branch；
- each task returns to `main` through Draft PR、CI、actual-diff
  review、expected-head squash merge and merged-head verification；
- no direct push to `main`；
- no force-push or history rewrite；
- a stable milestone uses a verified `main` commit, explicit Owner decision,
  annotated tag, and GitHub Release；
- Production release requires an approved tag and the P2-R2 protected
  environment, deployment, smoke, and rollback gates。
