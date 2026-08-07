# T01 / PR #5 代码与数据审查报告

> **历史报告，阻断问题已在 PR #5 合并前修复。** 本文保存的是早期 PR
> head 的 Request
> Changes 记录，不描述最终合并代码，也不作为当前项目状态。最终交付见
> [`docs/reports/T01-delivery-report.md`](../../reports/T01-delivery-report.md)。

## 1. 报告信息

| 项目         | 内容                                                     |
| ------------ | -------------------------------------------------------- |
| 审查对象     | `nontwo/moya-inscriptions-web` Pull Request #5           |
| PR 地址      | <https://github.com/nontwo/moya-inscriptions-web/pull/5> |
| PR Head      | `85ad6820d2919206155d5d84cbc17bb6c0abbec7`               |
| PR Merge Ref | `0bfb2ef7086f03efb14d02d89640815f860334a2`               |
| 审查日期     | 2026-08-07                                               |
| 审查结论     | **Request changes（暂不合并）**                          |

本报告基于 PR
#5 当前 head、仓库架构与协作规范、PR 完整 diff、数据文件独立统计以及一次性副本中的安装和工程验证结果编制。

## 2. 执行摘要

PR #5 的方向与 T01 目标基本一致，已经提供首批目录数据、公共类型、Zod
Schema 和单元测试；但当前版本仍存在会阻止合并的工程问题，以及会影响数字档案可信度的数据问题。

最优先的三个合并阻断为：

1. PR 实际以 `main` 为 base，而不是项目规定的 `integration/mvp`。
2. 新增 `zod` 依赖后没有更新 `pnpm-lock.yaml`，标准 CI 安装直接失败。
3. `@moya/contracts` 的编译产物无法被 Node
   ESM 正常导入，现有测试配置绕开了真实产物，未能发现该问题。

此外，“地区信息 100% 覆盖、0 条需复核”的结论缺少逐条证据，并通过重复填写行政层级制造了部分虚假覆盖；公共图片契约也违反了仓库既定的 object-key 架构规则。

## 3. 问题总览

| 编号 | 严重级别 | 问题                                     | 影响                                     |
| ---- | -------- | ---------------------------------------- | ---------------------------------------- |
| F-01 | 阻断     | PR base 错误，实际指向 `main`            | 绕过集成分支，并夹带 T03 CloudBase 改动  |
| F-02 | 阻断     | `pnpm-lock.yaml` 未同步                  | frozen-lockfile/CI 安装失败              |
| F-03 | 阻断     | Contracts 编译产物无法在 Node ESM 中导入 | 服务端消费者运行时崩溃                   |
| F-04 | 高       | 地区核实结果没有逐条 provenance          | 无法审计“academic/official verified”结论 |
| F-05 | 高       | 行政层级被重复填写以达到 100% 覆盖       | 搜索、筛选与地区树会产生错误数据         |
| F-06 | 高       | `SiteSummary` 暴露图片 URL               | 违反项目 object key + 派生 URL 规则      |
| F-07 | 中       | 数据提取不可复现，`sourcePage` 为推算值  | 档案记录不能可靠回溯到原始页             |
| F-08 | 中       | 完成报告、统计和格式检查结果不准确       | 审核者无法依赖交付报告                   |

## 4. 详细发现

### F-01：PR 目标分支错误（阻断）

远端引用核对结果：

- `main`: `1d8567239bc59e9e67e08133164659bc3f8bed87`
- `integration/mvp`: `4b3474baf1100df2305da40272b5e1844e4f0a6c`
- PR #5 merge ref 的第一父提交：`1d8567239bc59e9e67e08133164659bc3f8bed87`

因此，PR #5 当前实际以 `main` 为 base。PR 报告中声称 base 为
`integration/mvp`，与远端状态不符。

功能分支 `feat/contracts-v1` 本身是 `integration/mvp`
的后代。当前错误 base 导致 PR diff 同时包含 `4b3474b`
的 CloudBase/T03 内容，共显示 23 个修改文件；若改回
`integration/mvp`，T01 实际 diff 为 15 个文件。

**整改要求：**

- 将 PR #5 的 base 改为 `integration/mvp`。
- 确认改完后 `infra/**`、`docs/deployment/**` 等 T03 文件不再出现在 PR diff 中。
- 按仓库规定通过 PR squash merge，不采用报告末尾的本地直接 merge/push 操作。

### F-02：依赖清单与锁文件不一致（阻断）

[`packages/contracts/package.json`](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/packages/contracts/package.json#L19-L21)
新增：

```json
"dependencies": {
  "zod": "^3.24.0"
}
```

但 PR 没有更新 `pnpm-lock.yaml`。实际运行标准安装命令得到：

```text
ERR_PNPM_OUTDATED_LOCKFILE
Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date
```

CI 环境默认使用 frozen
lockfile，因此后续 lint、test 和 build 在干净环境中不会开始执行。

**整改要求：**

- 由项目负责人明确批准本次必要的锁文件变更。
- 使用仓库规定的 Node/pnpm 版本重新执行 `pnpm install`。
- 提交与两个 workspace manifest 完全匹配的 `pnpm-lock.yaml`。
- 在干净副本中先运行 `pnpm install --frozen-lockfile`，再运行全部工程检查。

### F-03：构建产物无法被 Node ESM 导入（阻断）

[`packages/contracts/src/index.ts`](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/packages/contracts/src/index.ts#L26-L49)
使用无扩展名的相对 specifier：

```ts
from "./catalog-types";
from "./catalog-schemas";
```

TypeScript 构建后，`dist/index.js` 仍然引用 `./catalog-schemas`。由于该包声明了
`"type": "module"`，Node ESM 不会自动补充 `.js`，运行时验证结果为：

```text
ERR_MODULE_NOT_FOUND
Cannot find module '.../packages/contracts/dist/catalog-schemas'
```

[`tests/vitest.config.ts`](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/tests/vitest.config.ts#L5-L12)
又将 `@moya/contracts` alias 到 `src/index.ts`，使测试完全绕开 `package.json`
exports 与 `dist`，因此“测试通过”没有证明发布/构建产物可用。

**整改要求：**

- 在 TypeScript 源码中使用 Node ESM 可解析的 `.js`
  specifier，或采用等价且经运行时验证的 ESM 构建方案。
- 移除测试中绕过产物的源码 alias。
- 增加从 `@moya/contracts` 包入口导入的运行时 smoke test。
- 保证 `pnpm build` 后执行 `node -e 'import("@moya/contracts")'` 成功。

### F-04：地区核实结论缺少逐条证据（高）

对最终 `region-enrichment.json` 的独立统计为：

| `dataSource`          | 实际数量 |
| --------------------- | -------: |
| `unit_name_inference` |      710 |
| `official_catalog`    |      807 |
| `academic_db`         |      141 |
| `local_chronicle`     |        0 |
| `web_search`          |        0 |
| 合计                  |     1658 |

全部 1658 条记录均为 `needsReview: false`，且没有非空
`reviewNotes`。然而数据模型只记录了笼统来源类别，没有记录：

- 具体来源名称与 URL；
- 页码、条目 ID 或查询关键词；
- 获取/核实日期；
- 核实人或核实方式；
- 证据摘录、置信度或版本信息。

因此无法复查 141 条 `academic_db`、807 条 `official_catalog`
的具体依据，也无法证明 710 条单位名推断已经人工核实。

另一个直接矛盾是：数据集 README 明确表示序号 1000 的重复处理“需人工确认”，但
[`source-catalog.json` 对应记录](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/data/catalog/first-batch/source-catalog.json#L10992-L11000)
仍为 `needsReview: false`。

**整改要求：**

- 为地区富集记录增加可审计的来源引用和核实元数据，或建立独立、可关联的 evidence 文件。
- 无法提供证据的推断记录恢复为 `needsReview: true`。
- 区分“字段非空”“自动推断”“外部查询”和“人工核实”，不要将它们都描述为 verified。
- 从最终数据自动生成来源与复核统计，避免手写数字。

### F-05：错误填充行政层级以制造 100% 覆盖（高）

数据模型将 `city` 定义为“地级市/州”，将 `county`
定义为“县/区/县级市”，但最终数据存在 14 条 `city === county` 的记录，包括：

- 河南省 / 济源市 / 济源市：6 条；
- 广东省 / 东莞市 / 东莞市：3 条；
- 海南省 / 陵水黎族自治县 / 陵水黎族自治县：3 条；
- 海南省 / 定安县 / 定安县：1 条；
- 甘肃省 / 嘉峪关市 / 嘉峪关市：1 条。

例如
[`sourceIndex: 901`](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/data/catalog/first-batch/region-enrichment.json#L9003-L9010)
把东莞市同时写入市、县字段。东莞市官方资料明确说明东莞是“不设区、县的地级市”，不能将“东莞市”再次当作 county：<https://nyncj.dg.gov.cn/zixun/snkd/content/post_4475587.html>。

这说明当前“市+县 100%”不是有效的行政层级覆盖率。对省直辖县、直筒子市等特殊结构，应允许缺失中间层或末级层，而不是复制名称。

**整改要求：**

- 按真实行政层级修正上述记录；不存在的层级使用 `null`。
- 明确定义直辖市、省直辖县级行政区和不设区县地级市的建模规则。
- 重新计算 city、county 和完整行政路径覆盖率。
- 增加行政层级一致性测试，至少禁止无解释的 `city === county`。

### F-06：图片 URL 契约违反架构约束（高）

项目规定：图片必须以 object
key 表示，并由适配器派生 URL，不得在公共契约中硬编码或传递存储/CDN 地址。

但
[`SiteSummary`](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/packages/contracts/src/catalog-types.ts#L167-L185)
定义了：

```ts
coverImage: string;
coverThumbnail: string;
```

[`docs/data-dictionary.md`](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/docs/data-dictionary.md#L141-L160)
又明确将这两个字段解释为图片 URL。

**整改要求：**

- 改为 `coverImageId`、`coverObjectKey`/`coverThumbnailKey`
  或项目负责人确认的等价引用形式。
- URL 只在图片适配器/展示边界派生，不进入持久化数据和共享业务契约。
- 同步修改 TypeScript 类型、Zod Schema、数据字典与相关测试。

### F-07：源数据提取不可复现，页码为估算值（中）

[`data/catalog/first-batch/README.md`](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/data/catalog/first-batch/README.md#L29-L35)
说明：

- 数据来自维基文库 raw 页面；
- 使用 Python 脚本解析；
- `sourcePage` 按每 44 条记录推算。

但交付物没有给出精确源 URL、Wikisource
revision、原始内容 hash 或可执行提取脚本。`docs/data-extraction-report.md`
声称脚本为 `scripts/parse_wiki.py`，而 PR 中不存在该文件。

此外，所有 `sourcePage` 都严格等于
`ceil(sourceIndex / 44)`，这只是分桶结果，不是实际 PDF 页码。将其命名并描述为“源 PDF 页码”会给后续引用者造成错误的档案定位信息。

维基文库原表确实包含重复的序号 1000，随后继续为 1001，而非报告所写的整体重编号：<https://zh.wikisource.org/zh-hans/%E7%AC%AC%E4%B8%80%E6%89%B9%E5%8F%A4%E4%BB%A3%E5%90%8D%E7%A2%91%E5%90%8D%E5%88%BB%E6%96%87%E7%89%A9%E5%90%8D%E5%BD%95>。

**整改要求：**

- 提供精确来源 URL、revision/oldid、抓取时间、原始内容 hash 和转换说明。
- 使用实际 PDF 页码；如果无法可靠取得，则删除 `sourcePage`，或明确改名为
  `estimatedSourcePage`，不得作为精确出处。
- 修正文档中关于 1001—1658 被重新编号及“原 1659”的错误描述。
- 提取脚本如需放入 `scripts/**`，应先按模块所有权规则与 T05/项目负责人协调。

### F-08：完成报告与实际状态不一致（中）

[`docs/T01-final-report.md`](https://github.com/nontwo/moya-inscriptions-web/blob/85ad6820d2919206155d5d84cbc17bb6c0abbec7/docs/T01-final-report.md#L12-L29)
中的 base、最新 SHA 和提交数均已过期或错误：

- 报告写 `integration/mvp`，实际 PR base 为 `main`；
- 报告写最新 SHA `eedc6a3`，实际 head 为 `85ad682`；
- 报告写 4 次提交，正确 base 下实际包含 5 个 T01 提交；
- 报告写修改 14 个文件，正确 base 下为 15 个（报告遗漏了自身）。

报告的数据来源分布写为 758/807/93/0，与最终 JSON 的 710/807/0/141 不一致。报告还出现“city
1657、county 1657、两者同时存在 1658”的集合逻辑矛盾。

报告声称 `pnpm format:check` 通过，但实测以下文件未通过 Prettier：

- `data/catalog/first-batch/region-enrichment.json`
- `docs/data-extraction-report.md`
- `docs/needs-review-table.md`
- `docs/T01-final-report.md`

数据字典仍保留 Phase
1 的 46.7%/53.3%/57.2% 统计，数据提取报告的结论部分也继续描述约 47% 覆盖，与同一文件上方宣称的 Phase
3 100% 相互冲突。

**整改要求：**

- 从最终 JSON 自动生成统计数据。
- 全面同步 README、数据字典、提取报告、人工复核表和完成报告。
- 修复格式后重新运行 `pnpm format:check`。
- 报告只记录实际执行且可复现的检查结果。

## 5. 验证记录

### 5.1 原始 PR 状态

| 检查                             | 结果                                   |
| -------------------------------- | -------------------------------------- |
| `pnpm install --frozen-lockfile` | **失败**：`ERR_PNPM_OUTDATED_LOCKFILE` |
| PR base 核对                     | **失败**：实际为 `main`                |
| 修改范围核对                     | **失败**：包含 T03 CloudBase 内容      |

### 5.2 一次性副本补齐临时锁文件后的工程检查

| 检查                                     | 结果                             |
| ---------------------------------------- | -------------------------------- |
| `pnpm format:check`                      | **失败**：4 个文件               |
| `pnpm lint`                              | 通过                             |
| `pnpm typecheck`                         | 通过                             |
| `pnpm test`                              | 通过：2 个测试文件、18 个测试    |
| `pnpm build`                             | 通过                             |
| Node ESM 导入 `@moya/contracts` 构建产物 | **失败**：`ERR_MODULE_NOT_FOUND` |

通过 lint、typecheck、test 和 TypeScript/Next
build 不能抵消安装失败与真实包入口运行失败。现有测试仅证明源码 alias 下的 Schema 和数据断言可以运行。

## 6. 建议整改顺序

1. 将 PR base 改为 `integration/mvp`，确认 diff 范围恢复为 T01。
2. 修复 ESM 包入口和测试绕过问题。
3. 获得锁文件修改许可，更新 `pnpm-lock.yaml`，验证 frozen install。
4. 修正图片契约的 object-key 边界。
5. 建立地区数据的证据与复核模型，纠正行政层级和覆盖率。
6. 补齐数据来源版本、hash 和可复现提取说明，处理虚构页码。
7. 从最终数据重新生成所有报告与统计，执行 Prettier。
8. 在干净副本中重新运行 install、format、lint、typecheck、test、build 和运行时包导入测试。

## 7. 重新批准条件

只有同时满足以下条件，PR 才适合重新进入批准流程：

- [ ] PR base 为 `integration/mvp`，不存在 T01 以外的 diff。
- [ ] `pnpm install --frozen-lockfile` 在干净环境成功。
- [ ] `@moya/contracts` 的构建产物可由 Node ESM 正常导入。
- [ ] 测试不再通过 alias 绕过 package exports/dist。
- [ ] 图片契约不包含需要持久化或跨层传递的 URL。
- [ ] 地区数据具备逐条可追溯证据，未核实记录保持 review 状态。
- [ ] 特殊行政区层级正确，覆盖率由最终数据重新计算。
- [ ] 源数据来源、revision/hash 与页码策略明确且可复现。
- [ ] 所有报告与最终数据一致。
- [ ] format、lint、typecheck、test、build 全部通过。

## 8. 建议提交到 PR 的审核意见

> 审核结论：Request changes，当前版本暂不合并。请先把 PR base 从 `main` 改为
> `integration/mvp`，排除夹带的 T03/CloudBase 内容；随后修复未更新 lockfile 导致的 frozen
> install 失败，以及 `@moya/contracts` 构建产物在 Node
> ESM 下无法导入的问题。数据部分不能仅凭字段非空就宣称 100%
> verified：请为地区富集补充逐条来源证据，恢复未核实推断记录的 review 状态，纠正 city/county 重复填充及覆盖率。另请按项目架构把封面图片 URL 改为 image
> ID/object
> key，补齐可复现的数据来源信息，统一所有报告统计并修复 Prettier。完成后请在干净环境重新运行 frozen
> install、format、lint、typecheck、test、build 和构建产物导入测试，再重新请求审核。

## 9. 审查范围说明

本次审查没有修改 PR
#5 的代码、数据或远端状态。工程验证在一次性临时副本中完成；报告仅记录可复现的本地 Git、数据统计和运行结果。
