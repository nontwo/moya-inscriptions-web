# `@moya/contracts`

跨模块公共类型和 runtime
schema 的唯一来源。本包只定义碑刻 MVP 当前已批准的 Public DTO、transport
query、分页和安全错误，不保存或导入真实数据。

- 根入口和 `@moya/contracts/types` 只导出 TypeScript 类型。
- `@moya/contracts/schemas` 提供固定版本的 Zod runtime schema。
- `@moya/contracts/json-schema` 提供 Draft 2020-12 JSON Schema。
- Public DTO 不暴露内部生命周期、原始来源、审核、持久化、图片或关系字段。
- HTTP query string 使用独立 transport schema，规范化后才能传给只读 Query Port。
- T04.0-R 只保留 list/detail 需要的契约；搜索、分类、图片和内部生命周期由后续负责任务引入。

后续模块不得在功能目录本地重定义共享类型，也不得把数据集、审核候选或来源记录放入本包。
