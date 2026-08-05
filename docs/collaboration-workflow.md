# 双人协作与审核流程

## 流程

```text
Issue
→ 功能分支
→ Draft PR
→ 自动测试
→ Ready for review
→ 仓库所有者代码审核
→ 测试环境人工测试
→ Request changes 或 Approve
→ Squash merge
→ 删除功能分支
```

协作者从最新 `integration/mvp` 创建功能分支，完成后向 `integration/mvp`
提交 Pull Request。不得直接修改或推送 `main` 与
`integration/mvp`，也不得修改任务范围之外的文件。所有 PR 都必须通过
`lint`、`typecheck`、`test` 和 `build`，并由 `@nontwo` 完成最终审核和合并。

## 权限和环境边界

- 协作者没有生产环境权限，也不持有生产密钥。
- PR 测试环境与正式环境隔离，不使用生产数据库或生产凭据。
- 只有合并到 `main` 后才允许触发正式部署流程。
- 需要修改公共契约、根配置、数据库或基础设施文件时，必须先获得 `@nontwo` 批准。
- 仓库不在 Repository
  Secrets 或 Environments 中保存生产凭据；后续如需部署，应把生产 Secret 放入受所有者审批保护的独立 Environment。

## 当前技术限制

当前 GitHub 套餐不支持为 Private 仓库启用 Branch Protection 或 Repository
Ruleset。因此直接推送限制、强制批准和 Code Owner
Review 暂时只能作为团队约定；自动 CI 仍会在目标为 `main` 或 `integration/mvp`
的 PR 上运行。不得通过改为 Public 或未经批准升级套餐来绕过该限制。
