# `@moya/contracts`

公共数据类型、接口和 dependency-free JSON Schema 的唯一来源。T01 已交付：

- 1658 条 PDF 源记录使用的 `SourceCatalogRow`；
- 未核验地区候选与证据边界；
- `HeritageRecord`、`SiteSummary`、`SiteDetail`、图片 object
  key、搜索与分页/API 契约；
- 与公共类型对应的 19 个 JSON Schema。

源数据与限制见
[`data/catalog/first-batch/`](../../data/catalog/first-batch/README.md) 和
[`docs/data-dictionary.md`](../../docs/data-dictionary.md)。后续模块只能从本包导入共享类型，不得本地重定义。
