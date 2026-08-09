# `@moya/contracts`

跨模块公共类型和 runtime
schema 的唯一来源。本包只定义碑刻 MVP 当前已批准的 Public DTO、transport
query、分页和安全错误，不保存或导入真实数据。

当前 `ArchiveItem*` 是 T04.0-R list/detail 的最小过渡 Public Read
Contract，不是最终领域模型。T04.1 将依据 Catalog 架构重新冻结
`CatalogRecord`、最终 Public DTO 和映射，但 Public Contract 仍留在共享 HTTP
boundary，不搬入 service implementation。

- 根入口和 `@moya/contracts/types` 只导出 TypeScript 类型。
- `@moya/contracts/schemas` 提供固定版本的 Zod runtime schema。
- `@moya/contracts/json-schema` 提供 Draft 2020-12 JSON Schema。
- 当前 Archive
  DTO 不暴露内部生命周期、原始来源、审核、持久化、Media/storage 或关系字段。未来
  `PublicMediaDTO.src` 可以承载由后端解析的 public/signed runtime URL，但 object
  key、bucket 和 provider internals 永不进入 Frontend contract。
- HTTP query string 使用独立 transport schema，规范化后才能传给只读 Query Port。
- T04.0-R 只保留 list/detail 需要的契约；搜索、分类、图片和内部生命周期由后续负责任务引入。

后续模块不得在功能目录本地重定义共享类型，也不得把数据集、审核候选或来源记录放入本包。
