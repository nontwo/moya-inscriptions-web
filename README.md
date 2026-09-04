# 由艺（Yoyi）

由艺是来源无关的中国文化艺术 Catalog 与社区产品工程。当前正式公开的 Catalog 范围严格为
`inscription | calligraphy`；这不预先授权其他CatalogKind、社区域或未来产品能力。

项目的唯一动态进度来源是 [当前项目状态](docs/project-status.md)。当前架构见
[Architecture](docs/architecture.md)。

## 当前产品入口

Formal `/` 是 request-rendered React 应用：

```text
apps/web/app/page.tsx
  → loadProductionProductStates()
  → T02pProductPreview
  → ProductShell
```

正式 Web 只通过 Public HTTP API 获取业务数据。Frontend 消费已验证的 Public
DTO 和 `PublicMedia.src`，不接触 PostgreSQL、object
key、bucket、存储 provider 配置或 raw research data。

`/docs/prototypes/mobile-preview/` 是独立的非生产 Prototype； `/dev/t02p` 与
`/dev/t02p/qa`
只在 Development 提供验收场景，Production 返回 404。Prototype 和 QA
fixture 的仓库存在不授权 Production 使用。

## Monorepo 结构

- `apps/web`：Next.js App Router Public Web、React Product Shell、same-origin
  API boundary 与用户交互。
- `apps/admin`：独立的最小 Admin 工程骨架；尚无管理业务。
- `services/backend-runtime`：Node.js listener、router、handlers、runtime
  config 与 graceful shutdown。
- `services/backend-production`：PostgreSQL-backed production composition
  root；启动时只读验证 migration ledger。
- `services/api`：backend-only Catalog application boundary。
- `services/catalog-postgres`：private PostgreSQL 18
  adapter、queries、migrations/readiness integration。
- `services/catalog-importer`：受控 CSV/XLSX parsing、canonical
  convergence、dry-run、hash-bound approval 与 transactional apply。
- `services/public-api`：Public OpenAPI
  contract 与确定性生成入口，不启动 listener。
- `packages/contracts`：Public DTO、query、error、ID 与 runtime
  schema 的唯一来源，并隔离 server-only Catalog Import contract。
- `packages/design-tokens`、`packages/ui`：共享视觉 token、semantic
  components 与正式 assets。
- `packages/image`：backend-owned `StorageUrlResolver` implementations。
- `packages/search`：Search V1 的隔离边界；业务搜索尚未实现。
- `database/migrations`：数据库结构演进的唯一入口。
- `docs`：当前状态、架构、治理、ADR、历史和非生产原型。

## 已实现的核心链路

```text
Owner-approved CSV/XLSX
  → catalog-import/v1 or catalog-import/v2
  → validation and dry-run
  → hash-bound approval
  → one PostgreSQL transaction
  → CatalogQueryPort
  → explicit Public mapper
  → Public HTTP API
  → React Product presentation
```

当前支持 Catalog list/detail、分页、Content V1、媒体读取边界、Detail
Carousel、full-screen Viewer、history、focus/scroll
restoration，以及 Development/Production 数据隔离。正式数据、正式媒体和部署状态以
`docs/project-status.md` 为准。

## 环境要求

- Node.js 24 LTS（见 `.nvmrc`）
- Corepack
- pnpm 11.9.0（由根 `package.json` 固定）

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
```

## 本地开发

端口所有权固定为：

```text
Public Web      3000
Backend/API     3001
Admin           3002
```

```bash
pnpm dev         # Public Web only
pnpm dev:web     # Public Web only
pnpm dev:admin   # Admin only
pnpm dev:all     # Public Web + Admin
```

Backend 不由根 `dev` 脚本隐式启动：

```bash
pnpm --filter @moya/backend-runtime build
HOST=127.0.0.1 PORT=3001 NODE_ENV=development \
  pnpm --filter @moya/backend-runtime start
```

复制 `.env.example` 后仅填写当前入口实际需要的值。不得提交 `.env`、真实 API
key、数据库连接串、云密钥或其他 Production credential。

## 验证

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

PostgreSQL integration tests 需要显式迁移的 PostgreSQL 18 test instance 和
`TEST_DATABASE_URL`。

## 分支与发布

`main` 是唯一长期 shared branch 和日常开发基线。所有短期任务从实时解析的最新
`origin/main` 创建独立分支，并通过 Draft PR、CI、actual-diff
review、expected-head squash merge 和 merged-head verification 返回
`main`。不得从历史功能分支继续开发，不得直接推送
`main`，也不得 force-push 或改写历史。

稳定里程碑从已验证的 `main` commit 出发，经明确 Owner
milestone 决定后创建 annotated tag 和 GitHub
Release。Production 发布只能从已批准的 tag 进入受保护环境和 deployment/smoke/rollback
gates。详细流程见 [CONTRIBUTING.md](CONTRIBUTING.md) 和
[分支策略](docs/branching-strategy.md)。

## 许可

- 代码与普通技术文档采用 [Apache License 2.0](LICENSE)。
- 精确签入的公开 fixture 内容采用
  [Creative Commons Attribution 4.0 International](LICENSE-DATA)。
- Yoyi / 由艺名称、徽标、字标与服务标识仍为保留品牌资产。
- 本仓库不包含 Production 数据或私有研究证据。
