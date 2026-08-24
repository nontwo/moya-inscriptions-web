# `@moya/backend-runtime`

T05 的 Node.js HTTP runtime。当前负责：

- 验证 `HOST`、`PORT` 和 `NODE_ENV`；
- 启动与关闭 HTTP listener；
- 把请求路由到 handler，并通过统一 JSON responder 返回结果；
- 实现 `GET /health`、`GET /v1/catalog` 和 `GET /v1/catalog/{catalogId}`。
- 对所有endpoint执行strict query validation；未声明、重复或非法query返回
  `INVALID_QUERY`。
- 接受可选async readiness check，并提供可复用、幂等的process
  lifecycle；shutdown先停止HTTP listener并等待在途请求，再清理注入的resource。

Catalog handler通过`@moya/api` parser调用`CatalogReadService`，service再通过
`CatalogQueryPort`读取internal projection并执行Public
mapping。development/test缺省使用三个条目的确定性内存fixture；它只用于HTTP
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
composition会在listener创建前失败。T05.2 production root显式注入PostgreSQL
adapter和DB-aware readiness；runtime本身不依赖driver、migration或production
composition。Development fixture通过显式mapped `StorageUrlResolver`生成
`PublicMedia.src`；production composition保持unconfigured/fail-closed
resolver，尚未选择storage provider或接入真实Media
ingestion。搜索与认证仍未实现。

缺省development/test
health不依赖外部资源。production注入的`/health`语义是readiness；DB不可用时返回既有`SERVICE_UNAVAILABLE`
503。它是独立operational endpoint，不经过Catalog service/Port，也不是process
liveness probe。

## 启动

```sh
pnpm --filter @moya/backend-runtime build
HOST=127.0.0.1 PORT=3001 NODE_ENV=development pnpm --filter @moya/backend-runtime start
```

```sh
curl -i http://127.0.0.1:3001/health
curl -i 'http://127.0.0.1:3001/v1/catalog?page=1&pageSize=2'
curl -i 'http://127.0.0.1:3001/v1/catalog?kind=inscription'
curl -i 'http://127.0.0.1:3001/v1/catalog?kind=calligraphy'
curl -i http://127.0.0.1:3001/v1/catalog/fixture-catalog-001
```
