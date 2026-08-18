# Architecture

## Monorepo overview

本项目使用 pnpm
workspace 管理单一仓库，并由 Turborepo 统一调度构建、lint、类型检查和测试。根配置由架构总控维护，以保证多个 Agent 使用一致工具链。

## Layer responsibilities

- `apps/web` 提供移动优先的公开页面，只负责页面组合和交互。
- `apps/admin` 提供管理端界面边界，当前仍不含任何管理业务。
- `services/public-api` 拥有公开 OpenAPI contract 与无副作用的 health contract
  helper，不启动 listener。
- `services/backend-runtime` 是T05 HTTP transport/runtime
  boundary，负责启动Node.js listener、runtime config、router、handler、JSON
  response与graceful shutdown；当前实现health与Catalog list/detail HTTP
  boundary。
- `services/catalog-postgres` 是private PostgreSQL infrastructure
  adapter，依赖application-owned port、internal projections、contracts与`pg`
  driver，不定义HTTP或Public contract。
- `services/backend-production` 是production composition
  root，只组合runtime、PostgreSQL adapter与显式unconfigured storage
  resolver，并管理pool lifecycle。
- `services/catalog-importer` 是private server-only `catalog-import/v1`
  boundary，负责bounded XLSX / strict CSV parse、shared canonical
  validation、PostgreSQL-backed dry-run与transactional apply；它不定义Public
  API，也不读取external research project或SQLite。
- `services/api` 是backend-only Modular Monolith application
  boundary，当前拥有Catalog normalized query、internal read projections、
  `CatalogQueryPort`、`StorageUrlResolver`、transport parser和Public Contract
  mapper，但没有HTTP或persistence runtime。
- `packages/contracts` 是共享 HTTP boundary 的 Public DTO、Public Query、Public
  Error、Public ID 和 runtime
  schema 唯一来源；它既不是后端内部模型，也不是前端业务层。
- `packages/ui` 和 `packages/design-tokens` 分别承载共享组件与视觉 token。
- `packages/data-access`是T04.2按最小清理策略保留的空backend
  workspace，当前不导出port、repository或adapter。
- `packages/search`隔离搜索能力；server-only
  `packages/image`实现显式mapped和unconfigured storage URL resolver，不拥有HTTP
  status policy。
- `database/migrations` 是数据库结构变更的唯一入口。

## Data boundaries

UI 组件不得直接查询 PostgreSQL。Web、Admin、SSR 和 Server
Component 必须通过 HTTP
API 获取业务数据，不得直接导入 Reader、Repository、backend
application 或 service runtime implementation。Frontend 可以使用 `import type`
从 `packages/contracts` 获取 Public
DTO/API 类型。业务模块不得本地重复定义公共契约。

Object key、bucket 和 provider 细节只存在于后端。backend
`StorageUrlResolver`批量生成 public/signed runtime URL，并通过 `PublicMedia.src`
交给 Frontend；Frontend 不得自行拼接 CDN URL。`PUBLIC_CDN_BASE_URL`
是 legacy/deprecated frontend
convention，不是未来 Resolver 已批准的配置名。不得硬编码生产域名、CDN 地址、存储桶或密钥。

后端采用 Modular Monolith。T04.2完成canonical migration后的读边界为：

```text
Public transport input
→ backend Catalog transport parser
→ normalized CatalogListQuery
→ CatalogReadService
→ CatalogQueryPort
→ internal read projection
→ explicit Public Contract mapper
→ strict Public DTO
```

T05.1以小型deterministic development/test adapter实现现有Query
Port；它不是production persistence或正式数据集。T05.2的private PostgreSQL
adapter实现同一port，并由独立production root显式注入，不修改T04
contract。`CatalogListTransportQuery`属于Public Contract；normalized
`CatalogListQuery`只属于application layer。Transport parser位于独立backend
transport boundary，application不得反向依赖transport。T05.3的
`CatalogReadService`负责port orchestration与Public
mapping，handler不得直接操作projection或SQL。

`packages/data-access`不再承载兼容Reader，且不得建立第二套Catalog
port。该workspace保持dependency-free，不得依赖PostgreSQL
driver、SQL、HTTP、runtime
schema、数据文件或环境变量。删除整个workspace不属于T04.2。

公共契约采用以下单向事实链：

```text
Zod 4 runtime schema
→ inferred TypeScript type
→ JSON Schema Draft 2020-12
→ OpenAPI 3.1.1 components
```

contracts 根入口与 `./types` 只提供类型；runtime schema 和 JSON
Schema 必须从显式子路径导入。Web、Admin、共享 UI 和 Client
Component 不得直接导入 Reader、runtime schema、数据库或数据文件；Client
Component 只能 type-import 公开 DTO/API 类型。

当前公开路由边界只有`GET /health`、`GET /v1/catalog`和
`GET /v1/catalog/{catalogId}`。公共响应使用`CatalogSummary`、`CatalogDetail`
和`CatalogPage`，不包含内部生命周期、审核、删除、图片、关系或下级地区状态。搜索、分类和图片由T08、T07和T05分别引入。

T05.1 runtime已把三条冻结route接入Router。未知路径返回JSON
404；已知路径的不允许方法返回JSON 405与`Allow: GET`。Catalog Public
response必须经过`CatalogReadService`和application mapper；fixture private
metadata不得进入HTTP。PostgreSQL row同样先由adapter-private
mapper投影为既有internal read projection，再经过application Public mapper；SQL
row、citation evidence、driver error和连接信息不得越过HTTP privacy boundary。

Production migration与startup是两个独立阶段：

```text
explicit migration command
→ verify success
→ production startup read-only ledger validation
→ HTTP listener
```

普通backend startup绝不执行DDL或创建migration
ledger。当前兼容与测试基线固定为PostgreSQL 18.4；minor
upgrade必须以显式infrastructure maintenance
change同步更新Compose、CI和兼容文档。未知的更新ledger
row可以存在，但不证明旧binary可安全rollback；未来变更必须遵循经审核的backward-compatible
expand/contract策略。

Production中的`GET /health`是DB-aware readiness：数据库不可用返回既有
`SERVICE_UNAVAILABLE` 503。它未经新的deployment decision不得同时用作process
liveness probe。Health是独立unversioned operational endpoint，不经过Catalog
service、DTO或Port。

所有当前HTTP endpoint执行strict query policy：未声明、重复或非法query参数返回
`INVALID_QUERY`。Catalog list只增加optional `kind` filter，并由transport
schema、application
query和adapter共同限制为`inscription | calligraphy`；过滤发生在fixture或PostgreSQL
adapter，不发生在Frontend、Router或handler。

地区规范化、行政区证据和审核流程不属于 T01/T04.0-R。未来如需这些能力，必须以新的独立任务建立 internal
contract、数据源和审核流程；不得恢复旧 D01 pilot。

Raw source 默认不得被任何 runtime
workspace 读取。只有经架构 allowlist 明确批准的 backend importer
package，并同时声明
`moyaArchitecture.rawSourceAccess = "controlled-importer"`，才可获得例外；Frontend
workspace 永久不得授权。当前 allowlist 精确且仅包含
`@moya/catalog-importer`，能力范围只覆盖caller显式提供的 `catalog-import/v1` CSV
bundle与`catalog-import-xlsx/v1` workbook。

## Long-term data governance

PostgreSQL 是 production runtime 的 canonical source of
truth。XLSX 是 Owner/Editor working format，CSV/canonical rows 是 canonical bulk
interchange/import boundary；完整 production
workbook 默认不进入代码 Git。Frontend、HTTP
runtime 与 application 不得读取 XLSX、CSV、fixture 或 raw source 作为 production
database。

已批准写入路径固定为：

```text
Owner XLSX / CSV
→ canonical rows
→ shared validation
→ duplicate candidates
→ diff / dry-run
→ Owner review and approval
→ PostgreSQL

Admin CMS
→ Admin API
→ same core domain validation
→ PostgreSQL
```

`CatalogId`、`SourceId`和未来`SiteId`保持独立；多个SourceRecord可以对应同一Catalog
Entity，但不得自动destructive merge。Raw provenance、evidence与publication
decision必须可追溯，Owner publication authority不等同于absolute factual truth。

Official Catalog与UGC是硬边界。User Submission必须经moderation与明确publication
decision后才能关联或创建Catalog Entity。详细治理决定见
[`ADR 0006`](adr/0006-long-term-data-governance-and-runtime-source.md)。

## Interface principle

所有公开界面从窄屏和触控场景开始设计，再渐进增强到更宽视口。公共组件和设计 token 由对应所有者统一维护。

## Current implementation boundary

工程、设计、Catalog read runtime与受控CSV
import/apply基础已完成；正式产品业务仍未完成：

- 旧 T01 数据方案已经撤回；应用仓库不保存真实数据集或审核候选。
- T01/T04.0-R的来源无关过渡契约已由T04.2 canonical migration取代。
- T04.1 Phase 1 增加了canonical Catalog contracts、internal record/read
  projections、application-owned `CatalogQueryPort`、transport
  parser、显式mapper和architecture guards；没有迁移route或实现runtime adapter。
- T04.2已删除Archive compatibility
  contracts和Reader，并把公开OpenAPI迁移到canonical Catalog
  routes；仍未实现runtime adapter。
- T02 已建立设计 token、通用 UI、正式视觉资产和组件目录；手机交互探索被隔离为非生产原型。
- T03 只提供 CloudBase 候选架构、示例变量和人工检查表，不创建云资源。
- 三路由只读OpenAPI当前由`/health`与Catalog
  list/detail组成；T05.1已接通真实Router、handler、application
  boundary与确定性fixture adapter。
- T05.1 fixture不是production
  persistence或1658条正式数据导入；T05.2建立PostgreSQL read
  schema、adapter、migration/readiness lifecycle与production composition。
- 后续批准的Catalog import persistence pipeline增加facts/states、description
  state、aliasType、internal SourceId/provenance和durable operation
  audit，并实现strict CSV parse、dry-run、hash-bound
  authorization及transactional/idempotent apply。
- Supplied `ownerNote`当前在所有apply路径共享的pre-write decision处fail
  closed；alias storage已经支持，但undefined collection replace/merge/delete
  update semantics仍fail closed。T05.4-B已实现bounded XLSX parser、CSV/XLSX
  convergence、structured diagnostics与唯一controlled-importer authorization。
- MEDIA-01已建立Catalog Media persistence、representative/gallery read
  projection与backend-owned runtime URL resolution boundary；production
  storage/CDN和真实Media ingestion仍不在当前实现内。
- T06-A已建立Web server-side Public HTTP data boundary；T06-B.1已实现formal
  request-time Home orchestration与可替换semantic presentation
  seam；T06-B.2已在不改变transport/loader的前提下接入T02
  token、共享UI、三端底部浮动主导航和正式Home四状态视觉。T07–T09仍是后续工作。
- Importer Admin workflow与正式/production Catalog数据导入仍不在当前实现内。

正式页面必须通过 HTTP API 消费数据；UI 不得直接读取Query Port、service
implementation、数据文件或 PostgreSQL。Frontend 可以 type-import
`packages/contracts` 的 Public DTO和transport type，但不得依赖
`@moya/public-api`、`@moya/backend-runtime`、`@moya/api`或任何 `services/**`
runtime。原型中的本地状态、Mock 内容和浏览器 history 不属于生产架构。已接受的边界记录在
[`docs/adr/`](adr/README.md)。
