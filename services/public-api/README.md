# Public API service

公开 API 的无数据库 contract package。当前提供 T04.0-R minimal transitional API
baseline：

- `GET /health`、`GET /v1/items` 和 `GET /v1/items/{id}` 三个只读契约；
- `pnpm --filter @moya/public-api generate:openapi` 确定性生成入口；
- 与 `GET /health` 成功响应一致的纯函数。

`openapi/openapi.json` 是生成文件，不得人工修改。数据 component schema 全部来自
`@moya/contracts/json-schema`；path、method、parameter 和 HTTP
status 由本包定义。

当前 `/v1/items` 路径和 `ArchiveItem*`
component 不获得长期兼容承诺。T04.1 将依据 Catalog 架构重新冻结正式 Catalog
URL、应用边界和最终 Public DTO；Frontend 只能依赖 HTTP 与 `@moya/contracts`
Public types，不得导入本包 runtime implementation。

本包没有 HTTP Router/listener、handler、Reader 实现、数据库、Importer、Admin
CRUD、搜索、分类或地区接口。
