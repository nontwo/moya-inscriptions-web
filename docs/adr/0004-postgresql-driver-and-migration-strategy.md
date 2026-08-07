# ADR 0004：PostgreSQL driver 与 migration 策略

- 状态：Accepted for staged evaluation
- 日期：2026-08-08
- 范围：T04.0 编号冻结；T04.1 工具验证

## 数据库方向

目标数据库保持 PostgreSQL。`pg` 是后续 PostgreSQL
adapter 的推荐 driver，但 T04.0 不安装 driver、不建立连接、不创建 Schema，也不实现 adapter。

PostgreSQL adapter 必须实现 `CatalogRepository`，并位于 `packages/data-access`
之外。最终采用 service-local
infrastructure 还是独立 package，推迟到 T04.3 根据复用和部署边界决定。

## Migration runner

`node-pg-migrate` 是 T04.1 的候选工具，不是 T04.0 已完成选型。T04.1 必须先验证：

- 稳定编号与执行顺序；
- migration history；
- transaction；
- advisory locking；
- 显式 SQL；
- CI 和部署环境兼容性。

验证通过后再最终决定是否安装。T04.0 不安装 `pg`、`node-pg-migrate` 或任何 ORM。

## 编号冻结

- `0001`：source files / source catalog
- `0002`：region enrichment / candidate / evidence
- `0003`：heritage records / categories
- `0004`：image assets
- `0005`：search / list indexes

这些编号只用于避免并行任务冲突，不代表 Schema 已获批准或 migration 已创建。`0002`
的实际字段和约束必须等待 D01 Region Contract
Handoff，T04.0 不预先设计地区验证 Schema。

## 当前明确不做

- 不创建 migration 文件或数据库表。
- 不导入第一批数据。
- 不生成 `SiteId` 或 source-to-site mapping。
- 不引入 Prisma、TypeORM、Sequelize 或 Kysely。
- 不实现 PostGIS、`pg_trgm` 或搜索索引。
