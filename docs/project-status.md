# 当前项目状态

最后更新：2026-08-31（Asia/Shanghai）

本文件是 `current project status`、`active Phase 2 work` 与 `Production gaps`
的单一当前来源。历史计划与实现过程保留在既有历史文档和 PR 中，不作为当前事实。

## 当前基线

```text
Current shared development branch:
integration/mvp

Current verified commit:
02de3c1f1d1baeb5eb938d88030c56bc37a2cadc

Current verified tree:
cefd28f8522a63582510444a728beb17ce6ad652
```

该基线已包含：

- accepted React Product Shell；
- Formal React root Cutover；
- Catalog Detail；
- bounded media Carousel；
- full-screen media Viewer；
- Calligraphy `全部 / 墨迹 / 拓本` Pager；
- Inscriptions progressive loading；
- Calligraphy `全部` progressive loading；
- page 2 Detail/Viewer 返回后的精确恢复；
- Production 与 Development、QA surfaces 的隔离。

## 当前阶段

```text
Current phase:
Phase 2 — read-only digital Catalog MVP
```

当前 Phase 2 目标是：

> Publish a trustworthy read-only Catalog using governed data, real media,
> formal search, controlled publication and recoverable Production operations.

Phase 2 不扩展到普通 public-user
identity、favorites/likes、comments、posts、user upload、social
following、messaging、native mobile applications、transactions、AI
recommendation、OCR 或 knowledge graphs。

## 已完成的公开产品能力

### Formal Web

```text
Formal `/`
→ React Server Page
→ Production-only state composition
→ accepted React Product Shell
```

Formal `/` 已不再是旧的 static T02 document。

### Product Shell

当前 Product Shell 包含：

- Home；
- Inscriptions；
- Calligraphy；
- Settings；
- Back/Forward；
- source scroll restoration；
- Detail scroll restoration；
- opener focus restoration；
- mutually exclusive primary、Detail、Viewer、Topic 与 Settings layers。

### Home

```text
Discover:
real Public Catalog data, first bounded page

Nearby:
truthful unavailable in Production

Topics:
truthful unavailable in Production
```

Development 仍可保留明确的 synthetic Nearby 与 Topic
scenarios；它们不是 Production data。

### Browse

```text
Inscriptions:
real kind=inscription Catalog data
+ explicit progressive loading

Calligraphy 全部:
real kind=calligraphy Catalog data
+ explicit progressive loading

Calligraphy 墨迹:
classification-unavailable

Calligraphy 拓本:
classification-unavailable
```

当前不存在 canonical `ink/rubbing` field。Formal/canonical
UI 不得根据 title、alias、summary、period、media 或 hard-coded Catalog
IDs 推断分类。

### Detail 与 media

共享 Catalog Detail 与 Viewer 当前支持：

- 当前 `CatalogDetail` Contract fields；
- truthful loading、not-found、unavailable 与 unexpected-error states；
- no-media、single-media 与 multiple-media records；
- bounded Detail Carousel；
- full-screen Viewer；
- zoom、pan 与 pinch；
- owned-media validation；
- direct Detail 与 Viewer query entry；
- 精确的 Back/Forward 与 focus restoration。

### Pagination

```text
Initial server page:
page=1
pageSize=24

Later pages:
explicit “继续加载”

Failure:
existing records remain
manual same-page retry

Completion:
active load control is removed
```

已加载页面在当前 Product Shell 保持 mounted 时保留在内存中；full document
reload 会回到 server-rendered first page。Home Discover 当前没有 progressive
loading。

## 当前后端与数据基础

现有基础包括：

- strict Public Catalog list 与 Detail Contracts；
- Public Catalog list 与 Detail API；
- `kind=inscription|calligraphy`；
- page-based Catalog listing；
- PostgreSQL Catalog read adapter；
- append-only migrations；
- strict CSV/XLSX importer；
- dry-run；
- authorization-bound apply；
- transactional、idempotent import behavior；
- backend-owned `StorageUrlResolver`；
- Development 与 QA media mappings；
- Production readiness checks。

```text
The repository does not currently contain a persistent Production Catalog
dataset, Production credentials or a configured Production media provider.
```

此前的 28-record Pilot verification 使用 disposable
infrastructure，不构成 persistent Production dataset。Production
media 在配置真实 `StorageUrlResolver` 前继续 fail closed。

当前 Production gaps 仍包括持久化 PostgreSQL 与正式数据/媒体、formal
search、minimal Operator
governance，以及可恢复的 Production 发布与运维能力；它们分别由下述 P2-02、P2-03、P2-04 与 P2-R2
gates 约束，不能把当前仓库描述为 Production-ready。

## 当前团队分工

### Frontend partner

Frontend partner 负责：

- accepted Product presentation；
- React components；
- CSS 与 design tokens；
- responsive behavior；
- gestures；
- accessibility；
- visual QA；
- frontend component tests；
- frontend interaction E2E；
- bounded extraction of Owner-approved visual behavior from PR #72。

每个真实实现都必须从最新 fetched `origin/integration/mvp`
创建新的独立 branch/worktree。PR #72 不是当前产品的 implementation branch。

### Owner/backend track

Owner/backend track 负责：

- `packages/contracts/**`；
- `services/**`；
- `services/catalog-postgres/**`；
- `services/catalog-importer/**`；
- `database/**`；
- `packages/image/**`；
- `packages/search/**`；
- `infra/**`；
- Production data；
- media storage；
- search semantics；
- Operator authorization；
- publication；
- backup、restore 与 release operations；
- Web same-origin API boundaries 与 Production server loaders。

> Frontend decides how governed data is presented. Backend decides what the data
> means, how it is validated, stored, queried and published.

## 当前 Phase 2 路线图

### P2-01 — T09 Content V1

```text
T09-C0:
freeze description / historicalContext / scholarlyResearch Contract semantics

T09-B1:
database, importer, read projection and Public API implementation

T09-F1:
frontend presentation by the frontend partner after Contract freeze
```

字段语义为：

```text
description = 简介
historicalContext = 历史背景
scholarlyResearch = 学术研究
```

本文件不定义这些阶段的具体实现。

### P2-02 — Production Data and Media Pilot

范围仅包括：

- persistent PostgreSQL environment；
- approved 28-record import；
- readback 与 replay；
- rollback rehearsal；
- real media manifest；
- configured Production storage resolver；
- real Public media URLs；
- backup 与 recovery evidence。

Pilot 不以先完成全部 1658 records 为前提。

### P2-03 — T08 Search V1

范围仅包括：

- governed Search Contract；
- Chinese normalization；
- PostgreSQL search 与 ranking；
- deterministic pagination；
- Golden Query Set；
- Public Search API；
- frontend partner 的 frontend search presentation。

Local array filtering 不是 T08 Search。本路线图不预先授权 Elasticsearch、vector
databases 或 AI embeddings。

### P2-04 — Minimal Operator Governance

范围仅包括：

- Operator identity；
- import-batch visibility；
- validation-error review；
- publication approval；
- withdrawal；
- audit identity 与 timestamps。

这不是普通 public-user identity system。

### P2-R2 — Production Release Gate

范围仅包括：

- Web；
- backend；
- PostgreSQL；
- object storage；
- domain 与 HTTPS；
- secrets；
- logs 与 basic monitoring；
- database backup；
- restore rehearsal；
- deployment rollback；
- real-device Production smoke；
- eventual `integration/mvp → main` promotion。

## 下一后端任务

```text
Next backend task after P2-00:
T09-C0 — Content Contract Freeze
```

P2-00 不开始 T09-C0。

## 当前前端工作

```text
The frontend partner may continue bounded, Owner-approved Product presentation
tasks in independent branches from the latest integration baseline.
```

PR #72 仅是 read-only visual/behavior reference，不属于 active merge
lineage。Favorites、likes 或其他 quick actions 当前不承诺已有 backend behavior。

## 明确延期

当前 Phase 2 critical path 不包括：

- public-user authentication；
- favorites 与 likes backend；
- comments；
- posts；
- user uploads；
- follow relationships；
- notifications；
- Nearby implementation；
- Production Topics provider；
- native iOS、Android 或 HarmonyOS applications；
- transactions；
- OCR；
- recommendation；
- knowledge graph；
- generic taxonomy framework；
- broad directory refactoring；
- cosmetic cleanliness 的 component renaming；
- full Prototype/bridge cleanup。

Bridge 与 Prototype cleanup 只能在 Production stability 之后，经单独 reference
audit 再考虑。

## 分支与发布政策

- shared branches 为 `main` 与 `integration/mvp`；
- short-lived tasks 从最新 fetched `origin/integration/mvp` 开始；
- 每个任务使用 isolated worktree 与 bounded branch；
- 每个任务经过 Draft PR、CI、actual-diff review、expected-head
  merge 与 merged-head verification；
- 禁止 direct push shared branches；
- 禁止 force-push 或 history rewrite；
- `main` 保持 stable milestone branch；
- Production Release Gate 前不执行 `integration/mvp → main` promotion。
