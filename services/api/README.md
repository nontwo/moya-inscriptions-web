# `@moya/api`

Backend-only modular-monolith application boundary。当前提供：

- internal `CatalogRecord` 和list/detail read projections；
- optional `kind`与normalized number形式的 `CatalogListQuery`；
- application-owned、只读的 `CatalogQueryPort`；
- application-owned、批量的 `StorageUrlResolver` port；
- 独立transport parser，把 `CatalogListTransportQuery` 转为application query；
- 注入`CatalogQueryPort`的`CatalogReadService`，负责list/detail application
  orchestration与Media URL resolution；
- internal projection到 `CatalogSummary`、`CatalogDetail`、`CatalogPage`
  的显式mapper和strict response validation，包括resolved `PublicMedia.src`。

依赖方向固定为
`@moya/api → @moya/contracts`。Application层不得依赖transport；transport可以依赖application
query type和Public runtime schema。Frontend、`packages/ui`和
`@moya/public-api`不得依赖本包。

本包当前不包含HTTP server、router、handler、database、SQL、ORM、persistence
adapter、storage provider
implementation、Search、Site、Feed或recommendation实现。
