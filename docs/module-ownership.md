# Module ownership

## Collaboration ownership

| 路径或职责                   | 实施负责人     | 必须审批/合并者 |
| ---------------------------- | -------------- | --------------- |
| 根配置                       | `@nontwo`      | `@nontwo`       |
| `.github/**`                 | `@nontwo`      | `@nontwo`       |
| `packages/contracts/**`      | `@nontwo`      | `@nontwo`       |
| `database/**`                | 任务分支负责人 | `@nontwo`       |
| `infra/**`                   | 任务分支负责人 | `@nontwo`       |
| `apps/**` 具体业务模块       | 任务分支负责人 | `@nontwo`       |
| `services/**` 具体业务模块   | 任务分支负责人 | `@nontwo`       |
| `packages/**` 非公共契约模块 | 任务分支负责人 | `@nontwo`       |
| `main` 最终合并              | 仅 `@nontwo`   | `@nontwo`       |
| `integration/mvp` 最终合并   | 仅 `@nontwo`   | `@nontwo`       |

任务分支负责人只能修改 Issue 或任务说明明确授权的路径。协作者不得成为关键目录的唯一所有者。

## MVP task ownership

| 路径                               | 任务 | 状态   |
| ---------------------------------- | ---- | ------ |
| `packages/contracts/**`            | T01  | 已重建 |
| `packages/design-tokens/**`        | T02  | 已完成 |
| `packages/ui/**`                   | T02  | 已完成 |
| `docs/design-system/**`            | T02  | 已完成 |
| `infra/**`                         | T03  | 已完成 |
| `docs/deployment/**`               | T03  | 已完成 |
| `database/**`                      | T04  | 待开发 |
| `services/public-api/**`           | T04  | 待开发 |
| `packages/data-access/**`          | T04  | 待开发 |
| `scripts/**`                       | T05  | 待开发 |
| `packages/image/**`                | T05  | 待开发 |
| `apps/web/app/layout.tsx`          | T06  | 待开发 |
| `apps/web/app/page.tsx`            | T06  | 待开发 |
| `apps/web/features/home/**`        | T06  | 待开发 |
| `apps/web/app/regions/**`          | T07  | 待开发 |
| `apps/web/app/categories/**`       | T07  | 待开发 |
| `apps/web/features/browse/**`      | T07  | 待开发 |
| `apps/web/app/search/**`           | T08  | 待开发 |
| `apps/web/features/search/**`      | T08  | 待开发 |
| `apps/web/app/items/**`            | T09  | 待开发 |
| `apps/web/features/item-detail/**` | T09  | 待开发 |

`docs/prototypes/mobile-preview/**`
是已归档的非生产原型，只能用于交互参考；任何正式页面实现都必须在对应 T06–T09 任务中重新接入 Repository、真实契约和图片适配器。

## Architecture-controlled files

以下内容只能由架构总控修改：

- 根目录 `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- 公共 TypeScript 配置
- ESLint 和 Prettier 配置
- Next.js 全局配置
- CI 文件
- 环境变量名称
- 数据库迁移编号
- 公共契约
- 公共 UI 组件
- 设计 token

任何 Agent 需要修改非所属路径时，必须停止并报告，不得自行越界。架构总控确认任务拆分、依赖和合并顺序后，才能继续。
