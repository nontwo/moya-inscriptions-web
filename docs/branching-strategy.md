# Branching strategy

```text
main
└── integration/mvp
    └── <issue 对应的短期任务分支>
```

- `main` 只存放完整测试和 CI 均通过的版本。
- 功能分支从最新 `integration/mvp` 创建，并先合并回 `integration/mvp`。
- 功能任务不得直接推送 `main`。
- 共享分支禁止 force push，也不得重写他人历史。
- 阶段基准通过 PR squash merge 进入 `main`，再建立带说明的基准标签。

## 当前任务状态

动态任务状态仅由[当前项目状态](project-status.md)维护；本文件不复制roadmap或里程碑进度。

旧数据任务以及 T02、T03 的功能分支均不是活动长期分支。`integration/mvp-v2`
的完整历史保存在 `archive/integration-mvp-v2-20260807`
标签，仅供查阅，不作为实现来源。当前长期活动分支只应保留 `main` 和
`integration/mvp`。
