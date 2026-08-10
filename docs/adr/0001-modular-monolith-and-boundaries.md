# ADR 0001：Modular Monolith 与依赖边界

- 状态：Accepted
- 日期：2026-08-09
- 范围：T04.0-R 及后续后端实现

## 背景

项目当前是单一 TypeScript pnpm
workspace。当前只有公共 DTO、查询 Port 和 OpenAPI 文档，尚无数据库、Port 实现或 HTTP
server。现阶段没有独立团队、发布节奏或扩缩容需求支持拆分微服务。

## 决策

后端继续采用 Modular Monolith，依赖方向为：

```text
presentation
→ transport/application
→ ArchiveCatalogReader port
→ infrastructure adapter
→ PostgreSQL
```

- `packages/contracts` 根入口只提供公开 DTO 和 transport 的 type-only
  surface；持久化、审核和发布状态不属于客户端共享契约。
- `packages/data-access` 只定义只读 `ArchiveCatalogReader` query
  port，并只返回 Public DTO。它不是可加载或保存领域聚合的传统 Repository。
- `services/public-api` 当前只定义 transport
  contract 和 OpenAPI；不启动 server。
- 未来 adapter 实现 Reader port，但不得放入 `packages/data-access` port
  package。
- `database/migrations` 是未来数据库结构变更的唯一入口。
- `packages/ui` 保持 domain-agnostic，不依赖 contracts、Repository 或服务层。

Web、Admin、UI 和 Client Component 不得直接读取 Reader、runtime
schema、数据库或数据文件。公共页面通过 HTTP API 或 server-side application
boundary 获取数据。Client
Component 只能 type-import 公开 DTO/API 类型。架构测试和 scoped
ESLint 规则持续执行这些限制。

## 后果

T04.0-R 只冻结实现第一个可运行纵向切片所必需的边界。未来每个 adapter 必须通过相同 Reader
contract，并由 application/transport 层负责 HTTP 语义、运行时验证和错误映射。搜索、分类、图片和首页投影不再为了“完整”而提前进入该 Port。
