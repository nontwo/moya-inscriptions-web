# Public API service

公开 API 的无数据库 contract package。当前提供：

- OpenAPI 3.1.1 document builder；
- `pnpm --filter @moya/public-api generate:openapi`
  单一确定性 artifact 生成入口；
- 与 `GET /health` 成功 contract 一致的纯函数。

`openapi/openapi.json` 是生成文件，不得人工修改。Component data schemas 来自
`@moya/contracts/json-schema`，path/status/parameter placement 由本包定义。

本包仍没有 HTTP Router、listen/server、handler、Repository
implementation、数据库、SQL 或数据导入。
