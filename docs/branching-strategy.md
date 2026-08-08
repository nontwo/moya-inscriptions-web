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

| 任务    | 状态     | 已交付范围                                     |
| ------- | -------- | ---------------------------------------------- |
| T00     | 完成     | Monorepo、工具链、CI、协作治理                 |
| T01     | 已重建   | 来源无关的档案领域与公共契约                   |
| T02     | 完成     | Design tokens、公共 UI、组件目录、视觉资产     |
| T03     | 完成     | CloudBase 候选架构与无密钥部署文档             |
| T04 v2  | 已建边界 | ArchiveItem Repository port、OpenAPI、架构守卫 |
| 原型    | 归档     | `docs/prototypes/mobile-preview/` 非生产原型   |
| T05–T09 | 待开发   | 图片、正式 Web 浏览/搜索/详情                  |

旧数据任务以及 T02、T03 的功能分支均不是活动长期分支。`integration/mvp-v2`
的完整历史保存在 `archive/integration-mvp-v2-20260807`
标签，仅供查阅，不作为实现来源。当前长期活动分支只应保留 `main` 和
`integration/mvp`。
