# `@moya/contracts`

公共数据类型与 runtime contract 的唯一来源。Zod 4
schema 是事实来源，TypeScript 类型从 schema 推导，JSON Schema Draft
2020-12 再从 Zod 派生。

入口边界：

- `@moya/contracts` 或 `@moya/contracts/types`：仅类型，适合
  `import type`，不会加载 Zod；
- `@moya/contracts/schemas`：Zod runtime schemas 与 query parse functions；
- `@moya/contracts/json-schema`：从 Zod 派生的 JSON Schema 对象。

已有 T01 export 的迁移记录见
[`EXPORT_COMPATIBILITY.md`](EXPORT_COMPATIBILITY.md)。当前契约包括：

- 1658 条 PDF 源记录使用的 `SourceCatalogRow`；
- 未核验地区候选与证据边界；
- 内部 `HeritageRecord`、严格 public `SiteSummary` / `SiteDetail` 和图片 object
  key；
- `SiteId` / `SourceId`、transport/normalized query、`items` 分页和安全 API
  error；
- 从 runtime schemas 派生的 JSON Schema。

地区边界在本次迁移中保持 T01 语义等价。`PublicRegion`
只是当前 v1 的 province-only safety projection；长期
`NormalizedRegion`、city/county 模型和 `RegionFacet` 等待 D01.1 Contract Change
Request，不在本 Commit 冻结。

源数据与限制见
[`data/catalog/first-batch/`](../../data/catalog/first-batch/README.md) 和
[`docs/data-dictionary.md`](../../docs/data-dictionary.md)。后续模块只能从本包导入共享类型，不得本地重定义。
