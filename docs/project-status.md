# 当前项目状态

> 最后更新：2026-08-10（Asia/Shanghai）。本文件是项目进度的唯一动态来源。

## 阶段结论

工程、设计与部署方案基线已经建立，业务开发尚未开始。旧 T01 把特定来源数据与公共契约混合，现已撤回并移出应用仓库；新的 T01 已从来源无关的平台档案模型重新建立。

`integration/mvp`
当前任务分支在T00、重建后的T01、T02、T03、T04.0-R后端边界和独立手机交互原型之上完成T04.1
Catalog Contract Phase 1及T04.2 canonical
migration；`main`继续保留稳定的T00/治理基线。

| 任务     | 状态           | 当前成果                                                        |
| -------- | -------------- | --------------------------------------------------------------- |
| T00      | 已完成         | pnpm/Turborepo Monorepo、Web/Admin/API 骨架、CI、协作治理       |
| T01      | 已重建         | 来源无关的公开档案 DTO 与 runtime schema                        |
| T02      | 已完成         | Design tokens、公共 UI、正式视觉资产、组件目录与单元测试        |
| T03      | 已完成         | CloudBase 中国大陆候选架构、无密钥示例和人工检查/回滚文档       |
| T04.0-R  | 已完成         | 兼容 ArchiveCatalogReader、三路由 OpenAPI、架构守卫             |
| T04.1-D  | Phase 1 已实现 | Catalog contracts、Query Port、read projections、mapper与guards |
| T04.2    | 已实现         | Catalog-only contracts、Query Port和canonical OpenAPI routes    |
| 手机原型 | 已隔离保存     | 非生产交互参考；不连接 Reader、数据库、搜索或生产图片           |
| T05–T09  | 未开始         | 图片管线、正式 Web 浏览/搜索/详情                               |

## 当前能做什么

- 安装、lint、类型检查、测试和构建完整 Monorepo。
- 使用 `@moya/design-tokens` 与 `@moya/ui` 开发后续正式界面。
- 在本地静态服务器查看组件目录和手机交互原型。
- 依据 T03 文档评估 CloudBase 方案，但不能据此直接创建或发布生产资源。
- 使用canonical `CatalogId`、三值 `CatalogKind`和suffix-free Catalog Public
  Contracts，并在backend使用 `CatalogQueryPort`、internal projections、transport
  parser与显式mapper。
- 确定性生成/验证由`/health`与Catalog list/detail组成的三路由OpenAPI 3.1.1
  artifact。

当前不能把项目视为可上线产品：正式 Web/Admin 仍是骨架，Public API 仍没有 HTTP
server/handler；Catalog Query
Port只有contract而没有实现。数据库 Schema、真实数据、Importer、搜索实现、图片管线、登录、地图、互动、上传、生产环境和正式部署都不存在。

## 数据状态

应用仓库当前不保存真实档案数据集、地区候选或审核证据。旧 T01/D01 资产已经过 SHA-256 验证并迁移到 owner 持有的本地 AES-256 加密归档，不得作为前端资产或运行时数据重新引入。

## 测试与可运行入口

当前测试覆盖工程fixture、Catalog contracts/application boundary、Query
Port、OpenAPI、架构边界、T02 token/资产/组件和手机原型交互。

标准命令：

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

启动骨架应用：

```sh
pnpm dev
```

启动静态预览：

```sh
python3 -m http.server 4173
```

- 组件目录：`http://localhost:4173/docs/design-system/catalog/`
- 手机原型：`http://localhost:4173/docs/prototypes/mobile-preview/`

手机原型只用于直观检查导航与交互，不是 `apps/web` 的正式实现。

## 分支与 GitHub 限制

- 长期活动分支只保留 `main` 和 `integration/mvp`。
- `mvp-foundation-v1` 保留 T00 基准。
- `archive/integration-mvp-v2-20260807`
  保留已废弃 v2 的完整历史；该历史不整体回灌。
- 功能开发从最新 `integration/mvp` 创建短期分支，通过 PR、四项 CI 和 `@nontwo`
  审核后 squash 合并。
- 仓库为 GitHub Private；当前套餐不支持技术强制 Branch
  Protection/Ruleset。因此禁止直推、批准失效、Code Owner
  Review 和对话解决只能由协作约定执行，不能宣称为平台强制。

## 下一步

1. 审核并集成T04.2 Catalog canonical migration。
2. T05：建立 object key 驱动的图片适配与处理管线，以及经批准的自动化脚本。
3. T06–T09：依次实现正式 Web 首页、浏览、搜索和档案详情。

只有 T04–T09 完成并通过集成回归后，才评估把 `integration/mvp` 合并到 `main`。
