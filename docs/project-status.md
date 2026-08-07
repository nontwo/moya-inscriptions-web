# 当前项目状态

> 最后更新：2026-08-07（Asia/Shanghai）。本文件是项目进度的唯一动态来源；任务交付报告和审查归档只记录各自发生时的历史事实。

## 阶段结论

第一批基础任务已完成，业务开发尚未开始。

`integration/mvp` 已集成 T00、T01、T02、T03 和独立手机交互原型；`main`
继续保留稳定的 T00/治理基线，不提前接收尚未完成的 MVP。T04–T09 均未开始。

| 任务     | 状态       | 当前成果                                                    |
| -------- | ---------- | ----------------------------------------------------------- |
| T00      | 已完成     | pnpm/Turborepo Monorepo、Web/Admin/API 骨架、CI、协作治理   |
| T01      | 已完成     | 1658 条 PDF 源数据、1665 个地区候选、公共类型与 JSON Schema |
| T02      | 已完成     | Design tokens、公共 UI、正式视觉资产、组件目录与单元测试    |
| T03      | 已完成     | CloudBase 中国大陆候选架构、无密钥示例和人工检查/回滚文档   |
| 手机原型 | 已隔离保存 | 非生产交互参考；不连接 Repository、数据库、搜索或生产图片   |
| T04–T09  | 未开始     | 后端、图片管线、正式 Web 浏览/搜索/详情                     |

## 当前能做什么

- 安装、lint、类型检查、测试和构建完整 Monorepo。
- 使用 `@moya/contracts` 的 T01 公共契约校验源数据、候选地区和应用/API 形状。
- 使用 `@moya/design-tokens` 与 `@moya/ui` 开发后续正式界面。
- 在本地静态服务器查看组件目录和手机交互原型。
- 依据 T03 文档评估 CloudBase 方案，但不能据此直接创建或发布生产资源。

当前不能把项目视为可上线产品：正式 Web/Admin 仍是骨架，Public
API 只有纯函数健康检查；数据库 Schema、Repository、搜索、图片管线、登录、地图、互动、上传、生产环境和正式部署都不存在。

## 数据状态

- PDF 源数据：1658 条，序号 1–1658；源页码来自 38 页 PDF。
- 源数据复核：序号 1307 的一个字符仍以 `?` 保留，等待更清晰权威原件。
- 地区候选：1658 条关联记录、1665 个候选、7 条冲突记录。
- 候选核验：0 个已选择、0 个 verified、0 条逐条证据 URL；所有候选均不得写入规范化市县。
- 规范化样例：5 条，不代表完整应用数据库。

详见[数据字典](data-dictionary.md)、[提取报告](data-extraction-report.md)和
[T01 静态交付报告](reports/T01-delivery-report.md)。

## 测试与可运行入口

当前完整测试为 7 个测试文件、47 个测试：

- T01 契约/数据与工程 fixture：15 个；
- T02 token、资产、组件和架构：26 个；
- 手机原型交互：6 个。

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

1. T04：建立数据库 migration、Repository、正式 Public
   API 和首批数据审核/导入边界。
2. T05：建立 object key 驱动的图片适配与处理管线，以及经批准的自动化脚本。
3. T06：将 T02 组件接入正式移动优先 Web 首页，不复制原型 Mock 状态。
4. T07：实现地区与分类浏览。
5. T08：实现搜索索引、查询和正式搜索页。
6. T09：实现碑刻详情与真实图片/参考文献呈现。

只有 T04–T09 完成并通过集成回归后，才评估把 `integration/mvp` 合并到 `main`。
