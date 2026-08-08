# Architecture

## Monorepo overview

本项目使用 pnpm
workspace 管理单一仓库，并由 Turborepo 统一调度构建、lint、类型检查和测试。根配置由架构总控维护，以保证多个 Agent 使用一致工具链。

## Layer responsibilities

- `apps/web` 提供移动优先的公开页面，只负责页面组合和交互。
- `apps/admin` 提供管理端界面边界，当前仍不含任何管理业务。
- `services/public-api`
  承担未来公开 API 适配和服务编排，不把数据库细节暴露给 UI。
- `packages/contracts` 是跨模块公共类型的唯一来源。
- `packages/ui` 和 `packages/design-tokens` 分别承载共享组件与视觉 token。
- `packages/data-access` 定义公开档案的只读 Query Port。
- `packages/search` 和 `packages/image` 隔离搜索与图片能力。
- `database/migrations` 是数据库结构变更的唯一入口。

## Data boundaries

UI 组件不得直接查询 PostgreSQL。公开页面必须通过 HTTP API 或 server-side
application
boundary 获取数据，具体数据库适配器位于服务或基础设施边界。业务模块不得本地重复定义公共契约；共享类型只能来自
`packages/contracts`。

图片在契约和数据层中使用 object
key 表示，对外 URL 由配置和适配器派生。不得硬编码生产域名、CDN 地址、存储桶或密钥。

后端采用 Modular Monolith。正式数据调用链固定为：

```text
Web / Admin presentation
→ HTTP API 或 server-side application boundary
→ application handler
→ ArchiveCatalogReader port
→ infrastructure adapter
→ PostgreSQL
```

当前只实现到公共 contract 和只读 Reader port。`packages/data-access`
不得依赖 PostgreSQL driver、SQL、HTTP、runtime
schema、数据文件或环境变量；具体 adapter、handler、Router 和数据库均留给后续 T04 阶段。

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

T04.0-R 的公开路由边界只有 `GET /health`、`GET /v1/items` 和
`GET /v1/items/{id}`。公共响应只包含 `ArchiveItemSummary`、`ArchiveItemDetail`
及分页结构，不包含内部生命周期、审核、删除、图片、关系或下级地区状态。搜索、分类和图片由 T08、T07 和 T05 分别引入。

地区规范化、行政区证据和审核流程不属于 T01/T04.0-R。未来如需这些能力，必须以新的独立任务建立 internal
contract、数据源和审核流程；不得恢复旧 D01 pilot。

## Interface principle

所有公开界面从窄屏和触控场景开始设计，再渐进增强到更宽视口。公共组件和设计 token 由对应所有者统一维护。

## Current implementation boundary

工程和设计基础已完成，业务开发尚未开始：

- 旧 T01 数据方案已经撤回；应用仓库不保存真实数据集或审核候选。
- 新 T01/T04.0-R 只建立来源无关的公开档案 DTO 和 runtime schema。
- T02 已建立设计 token、通用 UI、正式视觉资产和组件目录；手机交互探索被隔离为非生产原型。
- T03 只提供 CloudBase 候选架构、示例变量和人工检查表，不创建云资源。
- T04.0-R 已建立 `ArchiveCatalogReader` port、三路由只读 OpenAPI
  contract 和架构守卫，但未实现 Router、handler、adapter、数据库或真实数据。
- T05–T09 尚未实现图片管线、正式页面、浏览、搜索和详情。

正式页面必须通过 HTTP API 或 server-side application
boundary 间接消费数据；UI 不得直接读取 Reader、数据文件或 PostgreSQL。原型中的本地状态、Mock 内容和浏览器 history 不属于生产架构。已接受的边界记录在
[`docs/adr/`](adr/README.md)。
