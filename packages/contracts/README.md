# `@moya/contracts`

跨模块公共类型和 runtime
schema 的唯一来源。本包只定义来源无关的档案领域类型、Public
DTO 和永久可恢复的内容生命周期，不保存或导入真实数据。

- 根入口和 `@moya/contracts/types` 只导出 TypeScript 类型。
- `@moya/contracts/schemas` 提供固定版本的 Zod runtime schema。
- `@moya/contracts/json-schema` 提供 Draft 2020-12 JSON Schema。
- 图片字段只保存 object key；Public DTO 不暴露内部生命周期。
- T04 在同一事实链上增加规范化 list/search
  query、分页、分类 facet、健康检查和公开错误契约；不加入 Repository 实现或 transport
  framework。

后续模块不得在功能目录本地重定义共享类型，也不得把数据集、审核候选或来源记录放入本包。
