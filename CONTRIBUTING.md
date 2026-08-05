# 贡献与双人协作规范

## 标准流程

1. 先同步最新的 `integration/mvp`，再创建任务分支。
2. 一个 Issue 对应一个分支和一个 Pull Request。
3. 分支名称使用以下格式：
   - `feat/<issue>-<name>`
   - `fix/<issue>-<name>`
   - `chore/<issue>-<name>`
4. 禁止直接推送 `main` 或 `integration/mvp`。
5. 开发未完成时创建 Draft PR，目标分支为 `integration/mvp`。
6. 提交 PR 前运行
   `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 和
   `pnpm build`。
7. 涉及界面的 PR 必须附手机端和桌面端截图；无界面变化时明确说明。
8. Review 问题必须在 PR 对话中回应、修复并标记解决。
9. 新提交会使旧批准失效，需要重新审核。
10. 仅仓库所有者 `@nontwo` 负责最终合并。
11. 合并方式统一使用 Squash and merge。
12. 合并后删除功能分支。
13. 禁止提交 `.env`、Token、云密钥、生产数据库凭据或其他 Secret。
14. 未经 `@nontwo`
    明确批准，不得修改公共契约、根依赖、锁文件、数据库 Schema、CI 或部署配置。

## 范围边界

协作者只修改 Issue 和任务说明授权的路径。需要越界时应停止编码，在 Issue 或 PR 中说明原因并等待
`@nontwo` 批准。

当前 Private 仓库的 GitHub 套餐不支持强制 Branch
Protection 或 Ruleset。在套餐能力改变前，上述禁止直接推送和必须审核的规则属于强制团队约定，不能由 GitHub 完全技术阻断。
