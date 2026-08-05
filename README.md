# 摩崖碑刻数字平台

面向中国摩崖与石刻资料的移动优先数字档案。本仓库目前处于阶段 0，仅提供多人及多个 Codex
Agent 并行开发所需的公共工程基础，不包含正式业务功能。

## Monorepo 结构

- `apps/web`：公开站点的最小 Next.js App Router 骨架。
- `apps/admin`：管理端的最小 Next.js App Router 骨架。
- `services/public-api`：不依赖数据库的 TypeScript 服务骨架。
- `packages/*`：公共契约、UI、设计 token、数据访问、搜索和图片处理的职责边界。
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

阶段 0 的构建和测试不依赖数据库、对象存储、地图或其他外部服务。不得提交
`.env`、真实密钥或生产凭据。

## 分支与并行开发

`main` 只保存完整验证通过的版本。功能分支先合并到
`integration/mvp`，不得直接推送 `main`，不得对共享分支 force
push。每个 Agent 必须遵守
[模块路径所有权](docs/module-ownership.md)，越界修改时应停止并报告。详细流程见
[开发工作流](docs/development-workflow.md) 和
[分支策略](docs/branching-strategy.md)。

## 当前未实现

正式首页、搜索与索引、地区与分类页面、碑刻详情、地图、登录与用户互动、上传、图片管线、数据库 Schema 与连接、云存储、部署和管理端业务均不属于阶段 0，尚未实现。
