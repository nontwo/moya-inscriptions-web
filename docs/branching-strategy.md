# Branching strategy

```text
main
└── integration/mvp
    ├── feat/contracts-v1
    ├── feat/design-system
    ├── chore/cloudbase-deployment
    ├── feat/backend-core
    ├── feat/image-pipeline
    ├── feat/web-shell
    ├── feat/browse
    ├── feat/search
    └── feat/site-detail
```

- `main` 只存放完整测试和 CI 均通过的版本。
- 功能分支从最新 `integration/mvp` 创建，并先合并回 `integration/mvp`。
- 功能任务不得直接推送 `main`。
- 共享分支禁止 force push，也不得重写他人历史。
- 阶段基准通过 PR squash merge 进入 `main`，再建立带说明的基准标签。
