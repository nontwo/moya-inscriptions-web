# `@moya/backend-production`

T05.2 production composition root。它把现有HTTP runtime、application-owned
`CatalogQueryPort`、private PostgreSQL adapter与显式unconfigured
`StorageUrlResolver`组合起来，不拥有Public contract、persistence
implementation或storage provider
configuration。没有代表图的Catalog可以正常读取；需要Media
URL的读取在provider未配置时保持fail closed，不伪造URL。

Migration必须在启动前显式执行；普通backend启动只读验证ledger：

```sh
pnpm --filter @moya/catalog-postgres build
DATABASE_URL='postgresql://...' pnpm --filter @moya/catalog-postgres migrate
pnpm --filter @moya/backend-production build
NODE_ENV=production HOST=127.0.0.1 PORT=3001 DATABASE_URL='postgresql://...' \
  pnpm --filter @moya/backend-production start
```

`GET /health` 是readiness，不是process liveness：PostgreSQL不可用时返回既有
`SERVICE_UNAVAILABLE` 503。若未来需要独立liveness语义，必须通过新的deployment
decision。
