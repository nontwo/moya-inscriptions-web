# `@moya/backend-runtime`

T05.0/T05.1 的 Node.js HTTP runtime。当前负责：

- 验证 `HOST`、`PORT` 和 `NODE_ENV`；
- 启动与关闭 HTTP listener；
- 把请求路由到 handler，并通过统一 JSON responder 返回结果；
- 实现 `GET /health`、`GET /v1/catalog` 和 `GET /v1/catalog/{catalogId}`。

Catalog handler 通过 `@moya/api` 已冻结的 parser、mapper 和
`CatalogQueryPort`工作。development/test缺省使用三个条目的确定性内存fixture；它只用于HTTP
boundary验证，不是production
persistence、不是1658条正式数据导入，也不定义正式排序或搜索语义。
`@moya/api`继续保持无HTTP runtime；`@moya/public-api`继续拥有T04 OpenAPI
contract。

## 配置

development 和 test 默认使用 `HOST=127.0.0.1`、`PORT=3001`；环境变量可以覆盖。
`NODE_ENV=production`
时必须显式提供 HOST 和 PORT。外部 PORT 只接受 1–65535；测试可以通过内部
`startServer` 接口使用 port 0 请求 OS 分配临时端口。

显式注入的`catalogQueryPort`在所有环境中优先。未注入时只有development/test可使用fixture；production
composition会在listener创建前失败。本阶段没有production Catalog
adapter、数据库、对象存储、媒体、搜索、认证或Frontend集成。

## 启动

```sh
pnpm --filter @moya/backend-runtime build
HOST=127.0.0.1 PORT=3001 NODE_ENV=development pnpm --filter @moya/backend-runtime start
```

```sh
curl -i http://127.0.0.1:3001/health
curl -i 'http://127.0.0.1:3001/v1/catalog?page=1&pageSize=2'
curl -i http://127.0.0.1:3001/v1/catalog/fixture-catalog-001
```
