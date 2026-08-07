# ADR 0001：Modular Monolith 与依赖边界

- 状态：Accepted
- 日期：2026-08-08
- 范围：T04.0 及后续后端实现

## 背景

项目当前是单一 TypeScript pnpm workspace，Web、Admin 和 Public
API 仍是骨架，Repository、数据库 Schema 和正式 HTTP
API 尚未实现。当前没有独立团队、独立扩缩容或独立发布节奏足以支持过早拆分微服务。

## 决策

后端继续采用 Modular Monolith。逻辑调用链固定为：

```text
Web / Admin
→ HTTP API 或 server-side application boundary
→ application handler
→ CatalogRepository port
→ infrastructure adapter
→ PostgreSQL
```

模块职责如下：

- `packages/contracts`：公共类型和 runtime contract 的唯一来源。
- `packages/data-access`：只保存 Repository port。
- `services/public-api`：transport、application orchestration 和 composition
  root；HTTP Router 选择推迟到 T04.4。
- PostgreSQL adapter：实现 Repository port，但必须位于 `packages/data-access`
  之外；物理目录在 T04.3 根据复用需求决定。
- `database/migrations`：数据库结构变更的唯一入口。
- `packages/ui`：纯呈现层，不拥有业务、数据访问或 runtime API contract。

## 禁止的依赖方向

- UI、Client Component 或浏览器代码依赖 PostgreSQL、数据库基础设施、Repository
  implementation 或 raw catalog。
- `packages/contracts` 依赖 apps、database、Router、Repository 或基础设施。
- `packages/data-access` 依赖 `pg`、SQL、Hono、apps、services 或
  `data/catalog/**`。
- HTTP route 直接执行 SQL，或向上返回 PostgreSQL driver 类型。
- 正式运行时代码直接读取 `data/catalog/**`。
- 跨 workspace 使用相对路径导入其他包的 `src/**`。
- 使用未在所属 package manifest 中声明的 workspace dependency。

以上边界通过 package exports、workspace manifests、ESLint restricted
imports 和 Vitest architecture guards 共同执行，不新增大型 architecture
framework。

## 后果

- T04.0 只建立 contracts、Repository port 和 transport
  contract，不实现数据库或 HTTP server。
- 未来可以独立部署 Web 与 API，但不因此把领域边界拆成微服务。
- 任何新的 adapter 都必须朝向 Repository port，不能让 port 反向依赖实现。
