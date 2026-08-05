# Module ownership

| 路径                               | 所有者 |
| ---------------------------------- | ------ |
| `packages/contracts/**`            | T01    |
| `packages/design-tokens/**`        | T02    |
| `packages/ui/**`                   | T02    |
| `infra/**`                         | T03    |
| `database/**`                      | T04    |
| `services/public-api/**`           | T04    |
| `packages/data-access/**`          | T04    |
| `scripts/**`                       | T05    |
| `packages/image/**`                | T05    |
| `apps/web/app/layout.tsx`          | T06    |
| `apps/web/app/page.tsx`            | T06    |
| `apps/web/features/home/**`        | T06    |
| `apps/web/app/regions/**`          | T07    |
| `apps/web/app/categories/**`       | T07    |
| `apps/web/features/browse/**`      | T07    |
| `apps/web/app/search/**`           | T08    |
| `apps/web/features/search/**`      | T08    |
| `apps/web/app/sites/**`            | T09    |
| `apps/web/features/site-detail/**` | T09    |

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
