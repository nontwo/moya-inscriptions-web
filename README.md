# 摩崖碑刻数字平台

面向中国摩崖与石刻资料的移动优先数字档案。`integration/mvp`
当前包含工程与治理基线、碑刻 MVP 优先的公开契约、Catalog 只读 HTTP
boundary、正式设计系统、候选部署骨架和独立手机交互原型；旧数据方案已撤回并安全归档。正式业务页面和production
Catalog persistence尚未开始。

项目的唯一动态进度来源是 [当前项目状态](docs/project-status.md)。

## Monorepo 结构

- `apps/web`：公开站点的最小 Next.js App Router 骨架。
- `apps/admin`：管理端的最小 Next.js App Router 骨架。
- `services/public-api`：不依赖数据库的只读 OpenAPI contract；当前不启动 HTTP
  server。
- `services/backend-runtime`：T05.0/T05.1 Node.js HTTP listener、router、JSON
  response、runtime config、graceful shutdown与Catalog list/detail
  handler；development/test使用小型确定性fixture。
- `services/api`：backend-only Catalog application boundary，包含 normalized
  query、read projections、`CatalogQueryPort`、transport parser 与 Public
  Contract mapper；当前没有 HTTP runtime 或数据库实现。
- `packages/contracts`：来源无关的 Public DTO、transport query 与 runtime
  schema。
- `packages/design-tokens`、`packages/ui`：T02 已交付的视觉 token、公共组件与正式资产。
- `packages/data-access`：T04.2保留的空backend workspace；当前无port或实现。
- `packages/search`、`packages/image`：后续任务的职责边界，目前尚未实现业务能力。
- `database/migrations`：未来数据库迁移的唯一入口。
- `tests`：单元、集成、端到端测试和 fixture。
- `docs`：架构、工作流、分支策略和模块所有权文档。
- `infra`、`scripts`：未来基础设施与自动化脚本入口。

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
pnpm format
pnpm format:check
```

## 环境变量

复制模板后按本地需要填写：

```bash
cp .env.example .env.local
```

当前基础任务的构建和测试不依赖数据库、对象存储、地图或其他外部服务。不得提交
`.env`、真实密钥或生产凭据。

## 分支与并行开发

`main` 只保存完整验证通过的版本。功能分支先合并到
`integration/mvp`，不得直接推送 `main`，不得对共享分支 force
push。每个 Agent 必须遵守
[模块路径所有权](docs/module-ownership.md)，越界修改时应停止并报告。详细流程见
[开发工作流](docs/development-workflow.md) 和
[分支策略](docs/branching-strategy.md)。

## 当前能力

- 从 `@moya/design-tokens`、`@moya/ui` 使用 T02 token、组件和正式视觉资产。
- 通过静态服务器查看[组件目录](docs/design-system/README.md)和[非生产手机原型](docs/prototypes/mobile-preview/README.md)。
- 使用 T03
  CloudBase 候选架构与无密钥部署检查清单进行方案评估；它不是可直接部署的 IaC。
- 从 `@moya/contracts` 使用 canonical Catalog Public Contract，并在backend从
  `@moya/api` 使用 normalized list query、internal read projections、
  `CatalogQueryPort` 和显式Public mapper。
- 依据生成的OpenAPI 3.1.1 artifact维护`/v1/catalog` list/detail canonical
  contract。
- 通过 `@moya/backend-runtime` 启动真实HTTP listener，并请求`GET /health`、
  `GET /v1/catalog`与Catalog detail验证T04 contract的HTTP boundary。

## 当前未实现

正式 Web/Admin 仍是骨架。production Catalog Query Port
adapter、数据库Schema、1658条正式数据Importer、图片管线、正式首页、地区/分类浏览、搜索、档案详情、地图、登录、互动、上传、生产云资源和正式部署尚未实现。
