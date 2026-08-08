# ADR 0001：Modular Monolith 与依赖边界

- 状态：Accepted
- 日期：2026-08-08
- 范围：来源无关 T04 v2 及后续后端实现

## 背景

项目当前是单一 TypeScript pnpm
workspace。T01 已提供来源无关的档案领域与公共 DTO，但尚无数据库、Repository 实现或 HTTP
server。现阶段没有独立团队、发布节奏或扩缩容需求支持拆分微服务。

## 决策

后端继续采用 Modular Monolith，依赖方向为：

```text
presentation
→ transport/application
→ ArchiveItemRepository port
→ infrastructure adapter
→ PostgreSQL
```

- `packages/contracts` 是共享类型与 runtime contract 的唯一来源。
- `packages/data-access` 只定义 `ArchiveItemRepository` port，并只返回 Public
  DTO。
- `services/public-api` 当前只定义 transport
  contract 和 OpenAPI；不启动 server。
- 未来 adapter 实现 Repository port，但不得放入 `packages/data-access` port
  package。
- `database/migrations` 是未来数据库结构变更的唯一入口。
- `packages/ui` 保持 domain-agnostic，不依赖 contracts、Repository 或服务层。

Web、Admin、UI 和 Client Component 不得直接读取 Repository、runtime
schema、数据库或数据文件。Client
Component 只能 type-import 公开 DTO/API 类型。架构测试和 scoped
ESLint 规则持续执行这些限制。

## 后果

T04
v2 可以冻结稳定边界而不虚构数据库或数据。未来每个 adapter 必须通过相同 Repository
contract，并由 application/transport 层负责 HTTP 语义、鉴权和错误映射。
