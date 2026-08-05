# Development workflow

## Install and run

使用 `.nvmrc` 指定的 Node.js 24 LTS，并启用根 `package.json` 固定的 pnpm：

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install
pnpm dev
```

## Validate changes

提交前依次执行：

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

修复真实原因后重新运行失败命令，再运行完整检查；不得隐藏、跳过或降级检查。

## Feature branches and pull requests

从最新 `integration/mvp` 创建任务分支。分支名应包含任务性质和范围，例如
`feat/contracts-v1`。提交应保持小而可审阅，并通过 Pull Request 合并到
`integration/mvp`；只有完整集成验证通过的版本才能进入 `main`。

PR 必须填写任务编号、目标、允许路径、修改文件、测试结果、越界情况、风险和建议合并顺序。

## Scope and ownership

开始任务前查阅
`docs/module-ownership.md`。需要修改非所属路径时必须停止并报告，由架构总控决定拆分、移交或授权，Agent 不得自行越界。

## New dependencies

新依赖必须说明用途、现有工具不能满足的原因、体积与运行风险、版本兼容范围和维护状态。涉及根
`package.json` 或锁文件的升级必须由架构总控明确批准并执行。
