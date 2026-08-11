# `@moya/api`

Backend-only modular-monolith application boundary。T04.1 Phase 1 当前提供：

- internal `CatalogRecord` 和list/detail read projections；
- optional `kind`与normalized number形式的 `CatalogListQuery`；
- application-owned、只读的 `CatalogQueryPort`；
- 独立transport parser，把 `CatalogListTransportQuery` 转为application query；
- 注入`CatalogQueryPort`的`CatalogReadService`，负责list/detail application
  orchestration；
- internal projection到 `CatalogSummary`、`CatalogDetail`、`CatalogPage`
  的显式mapper和strict response validation。

依赖方向固定为
`@moya/api → @moya/contracts`。Application层不得依赖transport；transport可以依赖application
query type和Public runtime schema。Frontend、`packages/ui`、
`@moya/public-api`和保留为空backend workspace的`@moya/data-access`不得依赖本包。

本包当前不包含HTTP server、router、handler、database、SQL、ORM、persistence
adapter、Search、Site、Feed或recommendation实现。
