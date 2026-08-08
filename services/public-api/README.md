# Public API service

公开 API 的无数据库 contract package。当前提供：

- `GET /health`、`GET /v1/items` 和 `GET /v1/items/{id}` 三个只读契约；
- `pnpm --filter @moya/public-api generate:openapi` 确定性生成入口；
- 与 `GET /health` 成功响应一致的纯函数。

`openapi/openapi.json` 是生成文件，不得人工修改。数据 component schema 全部来自
`@moya/contracts/json-schema`；path、method、parameter 和 HTTP
status 由本包定义。

本包没有 HTTP Router/listener、handler、Reader 实现、数据库、Importer、Admin
CRUD、搜索、分类或地区接口。
