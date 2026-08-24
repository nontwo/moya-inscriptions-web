# 摩崖碑刻数字平台

面向中国摩崖与石刻资料的移动优先数字档案。本仓库把Public Web、Admin、Public HTTP
API、backend application、PostgreSQL
persistence、importer与共享设计系统保持为显式边界；正式页面只通过Public HTTP
API消费业务数据。

项目的唯一动态进度来源是 [当前项目状态](docs/project-status.md)。

## Monorepo 结构

- `apps/web`：Next.js App Router公开站点，通过server-side Public HTTP
  boundary加载Catalog数据。
- `apps/admin`：管理端的最小 Next.js App Router 骨架。
- `services/public-api`：不依赖数据库的只读 OpenAPI contract。
- `services/backend-runtime`：Node.js HTTP listener、router、JSON
  response、runtime config、graceful shutdown与Catalog handler。
- `services/catalog-postgres`：private PostgreSQL 18 read adapter、显式migration
  runner与readiness validation；不拥有Public contract。
- `services/backend-production`：只组合HTTP runtime与PostgreSQL
  adapter的production entrypoint；启动时只读验证migration ledger，不自动迁移。
- `services/api`：backend-only Catalog application boundary，包含 normalized
  query、read projections、`CatalogQueryPort`、transport parser 与 Public
  Contract mapper。
- `packages/contracts`：来源无关的 Public DTO、transport query 与 runtime
  schema。
- `packages/design-tokens`、`packages/ui`：共享视觉 token、公共组件与正式资产。
- `packages/search`、`packages/image`：搜索与backend-owned Media
  runtime职责边界。
- `database/migrations`：数据库迁移的唯一入口。
- `tests`：单元、集成、端到端测试和 fixture。
- `docs`：文档权威地图、架构、状态、分支策略和模块所有权文档。
- `infra`、`scripts`：候选基础设施与自动化脚本入口。

## 环境要求

- Node.js 24 LTS（见 `.nvmrc`）
- Corepack
- pnpm 11.9.0（由根 `package.json` 固定）

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install
```

## 本地开发

```bash
pnpm dev
```

该命令并行启动公开站点和管理端。也可以单独运行：

```bash
pnpm --filter web dev
pnpm --filter admin dev
```

## 公共命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:postgres
pnpm format
pnpm format:check
```

## 环境变量

复制模板后按本地需要填写：

```bash
cp .env.example .env.local
```

普通`pnpm test`不依赖数据库；`pnpm test:postgres`需要已经显式迁移的PostgreSQL
18.4 test instance。不得提交`.env`、真实密钥或生产凭据。

## 分支与并行开发

`main` 只保存完整验证通过的版本。功能分支先合并到
`integration/mvp`，不得直接推送 `main`，不得对共享分支 force
push。每个 Agent 必须遵守
[模块路径所有权](docs/module-ownership.md)，越界修改时应停止并报告。详细流程见
[贡献指南](CONTRIBUTING.md) 和 [分支策略](docs/branching-strategy.md)。

## 架构入口

- Public contracts与runtime schemas：`packages/contracts`
- Catalog application boundary：`services/api`
- PostgreSQL
  adapter与显式migration：`services/catalog-postgres`、`database/migrations`
- PostgreSQL-backed composition：`services/backend-production`
- Public Web HTTP boundary：`apps/web/lib/public-api`
- 设计系统与非生产原型：`packages/design-tokens`、`packages/ui`、`docs/prototypes`

当前已完成能力、活动任务和后续范围只在[当前项目状态](docs/project-status.md)维护，README不复制roadmap状态。文档分类和权威关系见[文档地图](docs/README.md)。
