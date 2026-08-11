# Architecture

## Monorepo overview

本项目使用 pnpm
workspace 管理单一仓库，并由 Turborepo 统一调度构建、lint、类型检查和测试。根配置由架构总控维护，以保证多个 Agent 使用一致工具链。

## Layer responsibilities

- `apps/web` 提供移动优先的公开页面，只负责页面组合和交互。
- `apps/admin` 提供管理端界面边界，当前仍不含任何管理业务。
- `services/public-api` 拥有公开 OpenAPI contract 与无副作用的 health contract
  helper，不启动 listener。
- `services/backend-runtime` 是T05.0/T05.1 HTTP transport/runtime
  boundary，负责启动Node.js listener、runtime config、router、handler、JSON
  response与graceful shutdown；当前实现health与Catalog list/detail HTTP
  boundary。
- `services/api` 是backend-only Modular Monolith application
  boundary，当前拥有Catalog normalized query、internal read projections、
  `CatalogQueryPort`、transport parser和Public Contract
  mapper，但没有HTTP或persistence runtime。
- `packages/contracts` 是共享 HTTP boundary 的 Public DTO、Public Query、Public
  Error、Public ID 和 runtime
  schema 唯一来源；它既不是后端内部模型，也不是前端业务层。
- `packages/ui` 和 `packages/design-tokens` 分别承载共享组件与视觉 token。
- `packages/data-access`是T04.2按最小清理策略保留的空backend
  workspace，当前不导出port、repository或adapter。
- `packages/search` 和 `packages/image` 隔离搜索与图片能力。
- `database/migrations` 是数据库结构变更的唯一入口。

## Data boundaries

UI 组件不得直接查询 PostgreSQL。Web、Admin、SSR 和 Server
Component 必须通过 HTTP
API 获取业务数据，不得直接导入 Reader、Repository、backend
application 或 service runtime implementation。Frontend 可以使用 `import type`
从 `packages/contracts` 获取 Public
DTO/API 类型。业务模块不得本地重复定义公共契约。

Object key、bucket 和 provider 细节只存在于后端。未来由 backend
`StorageUrlResolver` 生成 public/signed runtime URL，并通过 `PublicMediaDTO.src`
交给 Frontend；Frontend 不得自行拼接 CDN URL。`PUBLIC_CDN_BASE_URL`
是 legacy/deprecated frontend
convention，不是未来 Resolver 已批准的配置名。不得硬编码生产域名、CDN 地址、存储桶或密钥。

后端采用 Modular Monolith。T04.2完成canonical migration后的读边界为：

```text
Public transport input
→ backend Catalog transport parser
→ normalized CatalogListQuery
→ CatalogQueryPort
→ internal read projection
→ explicit Public Contract mapper
```

T05.1以小型deterministic development/test adapter实现现有Query
Port；它不是production persistence或正式数据集。当前没有production
adapter或PostgreSQL。`CatalogListTransportQuery`属于Public Contract；normalized
`CatalogListQuery`只属于application layer。Transport parser位于独立backend
transport boundary，application不得反向依赖transport。

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
response必须经过application mapper；fixture private metadata不得进入HTTP。

地区规范化、行政区证据和审核流程不属于 T01/T04.0-R。未来如需这些能力，必须以新的独立任务建立 internal
contract、数据源和审核流程；不得恢复旧 D01 pilot。

Raw source 默认不得被任何 runtime
workspace 读取。只有经架构 allowlist 明确批准的 backend importer
package，并同时声明
`moyaArchitecture.rawSourceAccess = "controlled-importer"`，才可获得例外；Frontend
workspace 永久不得授权。T04.0-R 当前 allowlist 为空。

## Interface principle

所有公开界面从窄屏和触控场景开始设计，再渐进增强到更宽视口。公共组件和设计 token 由对应所有者统一维护。

## Current implementation boundary

工程和设计基础已完成，业务开发尚未开始：

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
  persistence或1658条正式数据导入；数据库、图片管线以及T05.2/T06–T09能力尚未实现。

正式页面必须通过 HTTP API 消费数据；UI 不得直接读取Query Port、service
implementation、数据文件或 PostgreSQL。Frontend 可以 type-import
`packages/contracts` 的 Public DTO和transport type，但不得依赖
`@moya/public-api`、`@moya/backend-runtime`、`@moya/api`或任何 `services/**`
runtime。原型中的本地状态、Mock 内容和浏览器 history 不属于生产架构。已接受的边界记录在
[`docs/adr/`](adr/README.md)。
