# T01 首批数据契约与源数据集交付报告

> 静态交付报告：本文件只记录 T01 在 2026-08-07 合并时的交付事实，不作为项目整体进度来源。当前状态请查看
> [`docs/project-status.md`](../project-status.md)。

## 交付信息

| 项目         | 内容                                                         |
| ------------ | ------------------------------------------------------------ |
| 任务         | 基于《第一批古代名碑名刻文物名录》建立首版数据契约与源数据集 |
| PR           | [#5](https://github.com/nontwo/moya-inscriptions-web/pull/5) |
| 目标分支     | `integration/mvp`                                            |
| Squash merge | `74856b40254f41cb51a9bac7a1b79d8ca0c76a47`                   |
| 合并日期     | 2026-08-07                                                   |

PR #5 在合并前完成了 base、锁文件、Node
ESM 包入口、object-key 图片契约、地区候选证据边界、真实 PDF 页码、报告统计和格式问题的整改。早期阻断问题保留在
[合并前历史审查报告](../reviews/archive/T01-PR5-premerge-review.md)中，不代表最终合并版本。

## 正式交付

- 38 页 PDF 的 1658 条源记录，序号 1–1658，五个原始字段和真实页码均保留。
- 1658 条地区关联记录、1665 个未核验候选和 7 条冲突记录；候选不覆盖 PDF 原文。
- 5 条规范化映射样例，用于证明源数据、候选与应用模型的边界。
- `@moya/contracts` 的公共 TypeScript 类型、19 个 dependency-free JSON
  Schema 和包入口。
- 数据字典、PDF 提取与抽查报告，以及契约/数据自动回归测试。

主要路径：

```text
data/catalog/first-batch/
packages/contracts/
docs/data-dictionary.md
docs/data-extraction-report.md
tests/unit/contracts/catalog-contracts.test.ts
```

## 数据质量边界

- 源 PDF
  SHA-256：`20a444348c8c2f482a9f3262767675fdfc1be6f02be724ff53cb928f96ee5e6d`。
- 第 1307 条的一个字符在 PDF 中显示为 `?`，按原文保留并标记复核。
- 地区候选全部为
  `unverified`，`selectedCandidateIndex=null`，逐条证据 URL 为 0。
- 4 条候选现代省级归属与 PDF `regionRaw` 不同，两者分别保存。
- PDF 不提供坐标、书体、作者、详细地址、图片、释文、类别或说明，不得推测填充。
- 图片契约只保存 object key；生产 URL 必须在图片适配边界派生。

## 合并时验证

T01 合并前通过：

- `pnpm install --frozen-lockfile`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`（当时完整基线 15/15）
- `pnpm build`
- `git diff --check`
- Node ESM 从 `@moya/contracts` 包入口导入
- GitHub Actions CI

T01 的 15 个测试不是当前项目测试总数；后续 T02 和原型测试请以动态状态文档为准。

## 交付结论

T01 达到“首版数据契约与源数据集”的目标，但不等于完整碑刻数据库，也不包含持久化、Repository、HTTP
API、搜索、图片或页面实现。后续任务必须复用这些契约，并继续保持源事实、未核验候选和规范化数据之间的隔离。
