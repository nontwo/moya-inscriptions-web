# `@moya/backend-runtime`

T05.0 的最小 Node.js HTTP runtime。当前只负责：

- 验证 `HOST`、`PORT` 和 `NODE_ENV`；
- 启动与关闭 HTTP listener；
- 把请求路由到 handler，并通过统一 JSON responder 返回结果；
- 实现 `GET /health`。

本包不包含 Catalog endpoint、Query
Port 实现、数据库、对象存储、媒体、搜索、认证或 Frontend 集成。`@moya/api`
继续保持无 HTTP runtime； `@moya/public-api` 继续拥有 T04 OpenAPI contract。

## 配置

development 和 test 默认使用 `HOST=127.0.0.1`、`PORT=3001`；环境变量可以覆盖。
`NODE_ENV=production`
时必须显式提供 HOST 和 PORT。外部 PORT 只接受 1–65535；测试可以通过内部
`startServer` 接口使用 port 0 请求 OS 分配临时端口。

## 启动

```sh
pnpm --filter @moya/backend-runtime build
HOST=127.0.0.1 PORT=3001 NODE_ENV=development pnpm --filter @moya/backend-runtime start
```

```sh
curl -i http://127.0.0.1:3001/health
```
