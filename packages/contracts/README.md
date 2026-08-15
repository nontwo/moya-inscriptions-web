# `@moya/contracts`

跨模块公共类型和 runtime
schema 的唯一来源。本包只定义碑刻 MVP 当前已批准的 Public DTO、transport
query、分页和安全错误，不保存或导入真实数据。

`CatalogId`、`MediaId`、两值 `CatalogKind`、`PublicMedia`、`CatalogSummary`、
`CatalogDetail`、`CatalogPage`和`CatalogListTransportQuery`是canonical Public
Contract。T04.2已删除T04.0-R的Archive compatibility
exports；新代码只使用Catalog语言。

- 根入口和 `@moya/contracts/types` 只导出 TypeScript 类型。
- `@moya/contracts/schemas` 提供固定版本的 Zod runtime schema。
- `@moya/contracts/json-schema` 提供 Draft 2020-12 JSON Schema。
- `@moya/contracts/internal/catalog-import` 提供versioned、server-only的Catalog
  Import canonical rows、workbook/CSV specification、dry-run与batch
  contract；它不是Public DTO入口，Frontend与Public API不得导入。
- Catalog DTO不暴露内部生命周期、原始来源、审核、持久化或storage字段。
  `PublicMedia.src`只承载由后端解析的public/signed runtime URL；object
  key、bucket、provider internals和resolver配置永不进入Frontend contract。
- `CatalogListTransportQuery` 是本包唯一的Catalog list transport
  query，只表达并验证optional `kind`、`page`和`pageSize` query-string输入。
  `noQueryTransportSchema`为不声明query参数的endpoint执行strict
  validation。Normalized number形式的 `CatalogListQuery` 属于 `@moya/api`
  application layer，不从本包导出。
- transport到application的解析与规范化位于backend transport
  boundary，不在contracts或application layer内执行。
- 当前只保留基础list/detail和image
  Media读取需要的Catalog契约；搜索、分类、Site、Feed和内部生命周期由后续负责任务引入。

后续模块不得在功能目录本地重定义共享类型，也不得把数据集、审核候选或来源记录放入本包。T05.4-A只冻结Import
Contract与安全空白template；本包不读取XLSX/CSV、不访问数据库、不执行diff/apply，也不授权任何runtime
workspace读取raw production dataset。
