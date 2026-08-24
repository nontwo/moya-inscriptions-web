# Branching strategy

```text
main
└── integration/mvp
    └── <work-reference 对应的短期任务分支>
```

- `main` 是经 Owner 批准的里程碑基准分支；`integration/mvp` 是当前共享集成分支。
- 短期任务分支从最新 `integration/mvp` 创建，并通过 PR squash merge 回
  `integration/mvp`。
- 不得直接推送 `main` 或 `integration/mvp`。共享分支禁止 force
  push，任何人不得重写他人历史。
- 只有完成适用验证、独立 diff/code
  review 和 Owner 验收的集成基准，才可由 Owner 通过 PR 从 `integration/mvp`
  提升到 `main`。
- 经批准的阶段基准进入 `main`
  后建立带说明的基准标签。短期任务分支的删除遵循获批的合并后流程。

## Status source

动态任务、roadmap 和里程碑状态仅由[当前项目状态](project-status.md)维护。本文件只定义分支拓扑和里程碑提升规则。
