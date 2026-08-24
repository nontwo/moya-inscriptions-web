# Architecture

## System shape

由艺（Yoyi）使用 pnpm
workspace 与 Turborepo 管理单一 repository。当前公开 Catalog 范围严格为
`inscription | calligraphy`；长期产品目的不自动授权新的 Contract
values、subsystems 或 deployment provider。

```text
Browser
  → Public Web / Formal Root
  → Public HTTP API
  → backend Catalog application
  → CatalogQueryPort
  → PostgreSQL adapter

PostgreSQL media rows
  → backend StorageUrlResolver
  → resolved PublicMedia.src
  → Public HTTP API
  → Web presentation
```

Frontend 不直接读取 PostgreSQL、Query Port、backend implementation、raw
dataset、object key、bucket 或 provider configuration。

## Workspace responsibilities

- `apps/web`：Public Web composition、interaction 与 server-side Public HTTP
  client。
- `apps/admin`：独立最小 Admin boundary，当前没有管理业务。
- `services/backend-runtime`：Node.js listener、runtime
  config、router、handlers、JSON response、readiness injection 与 graceful
  shutdown。
- `services/backend-production`：PostgreSQL adapter、runtime 与显式 unconfigured
  storage resolver 的 production composition root。
- `services/api`：backend-only Catalog application boundary，拥有 normalized
  query、internal projections、`CatalogQueryPort`、`StorageUrlResolver`、read
  service 与 Public mapper。
- `services/catalog-postgres`：private PostgreSQL adapter、migration
  runner 与 required ledger/readiness validation。
- `services/catalog-importer`：private controlled importer；对 strict
  CSV 与 bounded XLSX 执行 canonical
  convergence、diagnostics、dry-run 与 hash-bound transactional apply。
- `services/public-api`：Public OpenAPI contract 与 deterministic
  generator；不启动 HTTP listener。
- `packages/contracts`：Public DTO/query/error/ID 与 runtime
  schema 的唯一来源，并隔离 server-only Catalog Import contract。
- `packages/image`：backend-only `StorageUrlResolver`
  implementations；不拥有 provider credentials、upload 或 transport status
  policy。
- `packages/ui`、`packages/design-tokens`：共享 semantic
  components、assets 与 tokens。
- `packages/search`：尚未实现业务搜索的隔离 boundary。
- `database/migrations`：database schema evolution 的唯一入口。

CLEAN-03 已删除退休的空 data-access workspace；它不再是 active
dependency 或 current architecture
recommendation。旧 ADR/audit 只保留当时的历史事实。

## Formal Web composition

当前 Formal Root 由 `apps/web/app/route.ts` 实现，不存在
`apps/web/app/page.tsx`。`GET /` 在 `connection()` 后并行执行：

```text
load all Catalog
load kind=inscription
load kind=calligraphy
  → validated HomeCatalogState values
  → readT02Document(..., "formal-root")
  → current T02 document with runtime Catalog cards
```

`apps/web/lib/public-api/` 是 Web business reads 的唯一 HTTP boundary。它读取
`MOYA_PUBLIC_API_BASE_URL`，验证 Public query/response，并把 transport
outcomes 映射为 presentation state。`app/route.ts` 不导入 backend
service 或 PostgreSQL code。

`readT02Document` 复用 checked-in T02 document 作为当前正式 UI/interaction
authority。Development Formal Root 可保留语义明确的 QA/Prototype
coverage；Production composition 先移除 Prototype cards、fixture
scripts 与 Prototype-only detail image，再追加真实 runtime records。

`/docs/prototypes/mobile-preview/` 是直接 Prototype
route：它读取相同 document 但不执行 Formal Root runtime composition。它的 local
state、fixtures、P5 snapshot 与 demo media 不属于 Production architecture。

React T02P 已建立 browser regression、typed Catalog scenarios、platform
observation、 `PrimaryShell`、navigation/pager 与 Home/Browse
presentation。`/dev/t02p` 仅在 Development 提供 acceptance
coverage，Production 返回 404。React Production cutover、T02 static
bridge 删除与 direct Prototype route 删除都不属于当前架构变更。

## Public HTTP and application boundary

当前 Public endpoints：

- `GET /health`；
- `GET /v1/catalog`；
- `GET /v1/catalog/{catalogId}`。

全部 endpoint 执行 strict query policy。Catalog list 的 optional `kind` 只允许
`inscription | calligraphy`，并支持分页。Catalog detail 暴露已批准的 canonical
chronology/location/facts/description/source projection 与 ordered Public
Media；缺失 optional values 不得由 transport 或 UI 虚构。

```text
Public transport input
→ backend transport parser
→ normalized application query
→ CatalogReadService
→ CatalogQueryPort
→ internal read projection
→ StorageUrlResolver (when media exists)
→ explicit Public mapper
→ strict Public DTO
```

Public response 不能泄漏 SQL rows、driver errors、citation evidence、private
source、object key、storage configuration 或 credentials。

## Media boundary

Backend `StorageUrlResolver` 批量把 logical object keys 解析为 public/signed
runtime URLs。Public API 只输出 `PublicMedia.src`；Frontend 与 `@moya/ui`
直接消费这个已解析值，不得从 object key 推导、拼接或猜测 provider/CDN URL。

`PUBLIC_CDN_BASE_URL` 只作为 negative architecture guard 和历史 candidate
evidence 保留，不是 active configuration。Development fixture 使用 explicit
mapped resolver；Production composition 在未选择 provider 时使用 unconfigured
resolver 并 fail closed，不会伪造 URL。没有 Media 的 Catalog 仍可正常读取。

## PostgreSQL, migrations and importer

PostgreSQL 是 Production runtime canonical source of truth。Production
startup 与 migration 严格分离：

```text
explicit migration command
→ verify migration success
→ production startup
→ read-only required-ledger validation
→ listener starts
```

普通 startup 不执行 DDL。当前 Compose/CI compatibility baseline 为 PostgreSQL
18.4；minor upgrade 与 schema evolution 都需要独立批准和相应 validation。

已实现写入路径是 controlled importer：

```text
Owner XLSX or strict CSV
→ bounded parsing and canonical rows
→ shared validation
→ duplicate/diff dry-run
→ hash-bound authorization
→ transactional PostgreSQL apply
```

Importer 不自动读取 repository Prototype/P5 snapshot，也不构成 Public API、Admin
CMS 或 publication workflow。完整 production workbook 默认不进入 code Git。

## Development and Production composition

Development 可以同时包含真实 runtime records 与独立的 T02 QA
records，以覆盖媒体比例、多图、缺失内容、Detail、Gallery、Viewer 与 responsive
behavior。二者必须保持 identity 与 data
origin 可区分；真实 CatalogId 不得获取 QA title、facts 或 unrelated demo media。

Production 只消费 PostgreSQL → Public API 的真实 runtime data，排除 Prototype
fixtures、QA virtual media、`内容待接入` 与 `资料待接入`。缺失 optional
content 使用 truthful omission 或 missing-media presentation。

Repository 中 28 条 P5 snapshot 是 checked-in、non-authoritative、Prototype-only
evidence。它不自动进入 PostgreSQL，不是 Production runtime
source，也不改变 canonical data path。

## Deployment authority

当前没有选择或 provision production provider。Active deployment
documents 只保留 provider-neutral PostgreSQL readiness、migration/startup
separation、release safety 与 backup/rollback principles。历史 CloudBase T03
candidate material 位于
`docs/archive/deployment/cloudbase-t03-candidate/`，不可执行，也不是 Web
runtime、API path、storage/CDN、environment variables 或 Production
deployment 的当前权威。

Production domains、credentials、API keys、CDN configuration、purchases 与 real
cloud operations 都需要独立 Owner authority；不得硬编码或从 archived
candidate 恢复。

## Stable architecture guardrails

- Public/cross-workspace contracts 只在 `packages/contracts` 定义。
- UI/Frontend 不直接查询 PostgreSQL，也不导入 backend runtime/application。
- Database schema change 必须使用 migration。
- Dependency upgrade 必须显式批准。
- Production secret、domain、credential 与 provider value 不进入 Git。
- T02 保持 current UI/interaction authority，直到独立 T02 Productionization
  task 明确批准 material replacement/cutover。
- Prototype/QA repository presence 不授权 Production consumption。

Accepted 与 superseded architecture decisions 见
[ADR index](adr/README.md)；动态 milestone 状态只见
[project status](project-status.md)。
