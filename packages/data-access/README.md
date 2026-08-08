# `@moya/data-access`

公开页面的数据仓储抽象入口。T04.0 只定义 `CatalogRepository` port：它接收
`@moya/contracts` 的 normalized query/type，并返回 public DTO。

本包不包含 Repository implementation、PostgreSQL/SQL、HTTP、Zod
runtime、环境变量或 `data/catalog/**` 读取。`getSiteById` 未找到实体时返回
`null`，HTTP 404 由未来 application/HTTP adapter 映射。
