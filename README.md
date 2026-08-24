# 由艺（Yoyi）

由艺是来源无关的中国文化艺术 Catalog 与社区产品工程。当前已实现的公开 Catalog 范围严格为
`inscription | calligraphy`；这不预先授权其他 CatalogKind、社区域或未来产品能力。

本仓库通过显式边界组织 Public Web、最小 Admin、Public HTTP API、backend
application、PostgreSQL persistence、Catalog importer、Media URL
resolution 与共享设计系统。正式 Web 只通过 Public HTTP
API 消费业务数据，Frontend 只使用 `PublicMedia.src`
等已解析运行时 URL，不接收 object key 或存储 provider 配置。

项目的唯一动态进度来源是 [当前项目状态](docs/project-status.md)。

## Monorepo 结构

- `apps/web`：Next.js App Router 公开站点；Formal Root 由 `app/route.ts`
  在请求时加载 Catalog，再组合当前 T02 权威界面。
- `apps/admin`：独立的最小 Next.js 管理端骨架。
- `services/backend-runtime`：Node.js HTTP listener、router、runtime
  config、graceful shutdown 与 Catalog handlers。
- `services/backend-production`：PostgreSQL-backed production composition
  root；启动时只读验证 migration ledger。
- `services/api`：backend-only Catalog application boundary。
- `services/catalog-postgres`：private PostgreSQL 18 adapter 与显式 migration
  runner。
- `services/catalog-importer`：受控 CSV/XLSX validation、dry-run 与 hash-bound
  transactional apply。
- `services/public-api`：Public OpenAPI
  contract 与确定性生成入口，不启动 listener。
- `packages/contracts`：Public DTO、query 与 runtime schema。
- `packages/design-tokens`、`packages/ui`：共享视觉 token、组件与正式资产。
- `packages/image`：backend-owned `StorageUrlResolver` implementations。
- `packages/search`：尚未实现业务搜索的隔离边界。
- `database/migrations`：数据库结构变更的唯一入口。
- `docs`：文档权威地图、当前架构、动态状态、历史与非生产原型。

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

端口所有权固定为：Public Web `3000`、Backend Runtime/API `3001`、Admin `3002`。

```bash
pnpm dev         # Public Web only, port 3000
pnpm dev:web     # Public Web only, port 3000
pnpm dev:admin   # Admin only, port 3002
pnpm dev:all     # Public Web + Admin
```

Backend 不由任何根 `dev` 脚本隐式启动：

```bash
pnpm --filter @moya/backend-runtime build
HOST=127.0.0.1 PORT=3001 NODE_ENV=development \
  pnpm --filter @moya/backend-runtime start
```

## 环境变量

复制 `.env.example` 后仅按实际运行入口填写。模板只列出当前代码已实现的变量：

- `NODE_ENV`：`development | test | production`；
- `HOST`、`PORT`：Backend listener，development 默认 `127.0.0.1:3001`；
- `MOYA_PUBLIC_API_BASE_URL`：Web server-side Public API base URL；
- `DATABASE_URL`：PostgreSQL migration、importer 与 production composition；
- `TEST_DATABASE_URL`：显式 PostgreSQL integration tests。

模板不承诺存储、CDN、地图或其他尚未实现的 provider 配置。不得提交
`.env`、真实密钥、连接串或生产凭据。

## 常用验证

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

PostgreSQL integration tests 另需已迁移的 PostgreSQL 18 test instance，并通过
`TEST_DATABASE_URL` 显式提供连接。

## 当前入口与数据边界

- `/` 是 Formal Root：`apps/web/app/route.ts` 在 request
  time 分别读取全部 Catalog、 `inscription` 和 `calligraphy`，再交给 T02
  document composition。
- `/docs/prototypes/mobile-preview/` 是直接 Prototype
  route；它保留非生产 fixture，不是 Formal Root 的 canonical data source。
- `/dev/t02p` 仅在 Development 提供 React T02P machine/visual acceptance
  surface；Production 返回 404。
- repository 内的 28 条 P5
  snapshot 只用于 Prototype 压力测试，不自动进入 PostgreSQL，也不是 Production
  runtime source。
- Production canonical data path 固定为 approved importer → PostgreSQL → Public
  API → Web presentation。

## 分支与文档

短期任务分支通过 PR 合入 `integration/mvp`；`main` 只在明确的 milestone
promotion 后更新。禁止直接推送 shared branch、force-push 或改写历史。贡献流程见
[贡献指南](CONTRIBUTING.md)，架构与文档权威见 [文档地图](docs/README.md)。

当前能力、活动任务和 production gaps 只在
[当前项目状态](docs/project-status.md)维护；README 不复制动态 roadmap。
