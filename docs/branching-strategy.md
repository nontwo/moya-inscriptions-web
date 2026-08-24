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
- 目标为 `integration/mvp` 的机器可验证任务，在适用验证、独立实际 diff
  review 和全部适用 Owner gate 通过后，可由独立 review agent 标记 Ready、按预期
  head SHA squash merge，并完成 merged-head verification。
- 只有视觉/真机验收、重大产品或架构方向、生产权限操作、或尚未解决的 mandatory
  STOP condition 需要 Owner 判断；Owner 不承担例行 GitHub 合并操作。
- `integration/mvp` 提升到 `main` 会建立稳定里程碑，因此必须先取得明确的 Owner
  milestone decision。批准后，可由独立 review agent 执行 PR 合并和 merged-head
  verification。
- 经批准的阶段基准进入 `main`
  后建立带说明的基准标签。短期任务分支在 merged-head verification 通过后按获批流程删除。

## Status source

动态任务、roadmap 和里程碑状态仅由[当前项目状态](project-status.md)维护。本文件只定义分支拓扑和里程碑提升规则。
