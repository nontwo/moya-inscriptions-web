# Architecture

## Monorepo overview

本项目使用 pnpm
workspace 管理单一仓库，并由 Turborepo 统一调度构建、lint、类型检查和测试。根配置由架构总控维护，以保证多个 Agent 使用一致工具链。

## Layer responsibilities

- `apps/web` 提供移动优先的公开页面，只负责页面组合和交互。
- `apps/admin` 提供管理端界面边界，阶段 0 不含任何管理业务。
- `services/public-api`
  承担未来公开 API 适配和服务编排，不把数据库细节暴露给 UI。
- `packages/contracts` 是跨模块公共类型的唯一来源。
- `packages/ui` 和 `packages/design-tokens` 分别承载共享组件与视觉 token。
- `packages/data-access` 定义公开页面使用的 Repository 抽象。
- `packages/search` 和 `packages/image` 隔离搜索与图片能力。
- `database/migrations` 是数据库结构变更的唯一入口。

## Data boundaries

UI 组件不得直接查询 PostgreSQL。公开页面必须通过 `packages/data-access`
的 Repository 抽象获取数据，具体数据库适配器位于服务或基础设施边界。业务模块不得本地重复定义公共契约；共享类型只能来自
`packages/contracts`。

图片在契约和数据层中使用 object
key 表示，对外 URL 由配置和适配器派生。不得硬编码生产域名、CDN 地址、存储桶或密钥。

## Interface principle

所有公开界面从窄屏和触控场景开始设计，再渐进增强到更宽视口。公共组件和设计 token 由对应所有者统一维护。

## Excluded from phase 0

阶段 0 明确不包含正式页面、搜索、地图、账号体系、互动与上传、图片处理、数据库 Schema 与连接、云存储、部署、管理端业务、正式 UI 系统或正式数据契约。
