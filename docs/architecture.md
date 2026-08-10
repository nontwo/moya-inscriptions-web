# Architecture

## Monorepo overview

本项目使用 pnpm
workspace 管理单一仓库，并由 Turborepo 统一调度构建、lint、类型检查和测试。根配置由架构总控维护，以保证多个 Agent 使用一致工具链。

## Layer responsibilities

- `apps/web` 提供移动优先的公开页面，只负责页面组合和交互。
- `apps/admin` 提供管理端界面边界，当前仍不含任何管理业务。
- `services/public-api`
  承担未来公开 API 适配和服务编排，不把数据库细节暴露给 UI。
- `services/api` 是backend-only Modular Monolith application
  boundary，当前拥有Catalog normalized query、internal read projections、
  `CatalogQueryPort`、transport parser和Public Contract
  mapper，但没有HTTP或persistence runtime。
- `packages/contracts` 是共享 HTTP boundary 的 Public DTO、Public Query、Public
  Error、Public ID 和 runtime
  schema 唯一来源；它既不是后端内部模型，也不是前端业务层。
- `packages/ui` 和 `packages/design-tokens` 分别承载共享组件与视觉 token。
- `packages/data-access` 是 T04.0-R backend-only compatibility
  package，当前仅保留公开档案的临时只读 Reader port。
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

后端采用 Modular Monolith。T04.1 Phase 1 已实现到以下边界：

```text
Public transport input
→ backend Catalog transport parser
→ normalized CatalogListQuery
→ CatalogQueryPort
→ internal read projection
→ explicit Public Contract mapper
```

当前没有HTTP handler、Query Port implementation、infrastructure
adapter或PostgreSQL。`CatalogListTransportQuery`属于Public Contract；normalized
`CatalogListQuery`只属于application layer。Transport parser位于独立backend
transport boundary，application不得反向依赖transport。

`packages/data-access`继续保留未实现的 `ArchiveCatalogReader`
兼容面，不得依赖PostgreSQL driver、SQL、HTTP、runtime
schema、数据文件或环境变量。Phase 4只有在consumer迁移完成后才能考虑删除该包。

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

当前公开路由边界仍只有 `GET /health`、`GET /v1/items` 和
`GET /v1/items/{id}`。公共响应只包含 `ArchiveItemSummary`、`ArchiveItemDetail`
及分页结构，不包含内部生命周期、审核、删除、图片、关系或下级地区状态。搜索、分类和图片由 T08、T07 和 T05 分别引入。

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
- 新 T01/T04.0-R 建立了来源无关的Archive compatibility DTO和runtime schema。
- T04.1 Phase 1 已增加canonical Catalog contracts、internal record/read
  projections、application-owned `CatalogQueryPort`、transport
  parser、显式mapper和architecture guards；没有迁移route或实现runtime adapter。
- T02 已建立设计 token、通用 UI、正式视觉资产和组件目录；手机交互探索被隔离为非生产原型。
- T03 只提供 CloudBase 候选架构、示例变量和人工检查表，不创建云资源。
- T04.0-R `ArchiveCatalogReader` 和三路由只读OpenAPI继续作为compatibility
  boundary；仍未实现Router、handler、adapter、数据库或真实数据。
- T05–T09 尚未实现图片管线、正式页面、浏览、搜索和详情。

正式页面必须通过 HTTP API 消费数据；UI 不得直接读取 Reader、service
implementation、数据文件或 PostgreSQL。Frontend 可以 type-import
`packages/contracts` 的 Public DTO和transport type，但不得依赖
`@moya/public-api`、`@moya/api`或任何 `services/**`
runtime。原型中的本地状态、Mock 内容和浏览器 history 不属于生产架构。已接受的边界记录在
[`docs/adr/`](adr/README.md)。
