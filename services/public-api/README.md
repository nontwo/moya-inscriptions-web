# Public API service

公开API的无数据库contract package。T04.2完成canonical Catalog migration后提供：

- `GET /health`、`GET /v1/catalog`和`GET /v1/catalog/{catalogId}`三个只读契约；
- 全路由strict query policy：未声明、重复或非法query返回`INVALID_QUERY`；
- Catalog list只声明optional `kind`、`page`与`pageSize`，其中kind只允许
  `inscription | calligraphy`；
- `pnpm --filter @moya/public-api generate:openapi` 确定性生成入口；
- 与 `GET /health` 成功响应一致的纯函数。

`openapi/openapi.json` 是生成文件，不得人工修改。数据 component schema 全部来自
`@moya/contracts/json-schema`；path、method、parameter 和 HTTP
status 由本包定义。

Catalog path、parameter、operation和component只使用canonical
Catalog语言。Frontend只能依赖HTTP与`@moya/contracts` Public
types，不得导入本包runtime implementation。

`GET /health`是unversioned operational endpoint；它不属于Catalog
application/service/Port contract。

本包没有HTTP Router/listener、handler、Query Port实现、数据库、Importer、Admin
CRUD、搜索、分类或地区接口。
