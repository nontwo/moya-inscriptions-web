# `@moya/contracts`

跨模块公共类型和 runtime
schema 的唯一来源。本包只定义碑刻 MVP 当前已批准的 Public DTO、transport
query、分页和安全错误，不保存或导入真实数据。

`CatalogId`、三值 `CatalogKind`、`CatalogSummary`、`CatalogDetail`、
`CatalogPage`和`CatalogListTransportQuery`是canonical Public
Contract。T04.2已删除T04.0-R的Archive compatibility
exports；新代码只使用Catalog语言。

- 根入口和 `@moya/contracts/types` 只导出 TypeScript 类型。
- `@moya/contracts/schemas` 提供固定版本的 Zod runtime schema。
- `@moya/contracts/json-schema` 提供 Draft 2020-12 JSON Schema。
- Catalog
  DTO不暴露内部生命周期、原始来源、审核、持久化、Media/storage或关系字段。未来
  `PublicMediaDTO.src` 可以承载由后端解析的 public/signed runtime URL，但 object
  key、bucket 和 provider internals 永不进入 Frontend contract。
- `CatalogListTransportQuery` 是本包唯一的Catalog list transport
  query，只表达并验证query-string输入。Normalized number形式的
  `CatalogListQuery` 属于 `@moya/api` application layer，不从本包导出。
- transport到application的解析与规范化位于backend transport
  boundary，不在contracts或application layer内执行。
- 当前只保留基础list/detail需要的Catalog契约；搜索、分类、图片、Site、Feed和内部生命周期由后续负责任务引入。

后续模块不得在功能目录本地重定义共享类型，也不得把数据集、审核候选或来源记录放入本包。
