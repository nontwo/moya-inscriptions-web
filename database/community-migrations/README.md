# Community migrations

Community V1 的数据库结构变更属于独立的 `community` migration family：与
`legacy`、`payload` 两个 family 分离，绝不由 `MOYA_CONTENT_SOURCE` 选择，只通过
`pnpm db:migrate:community`（`scripts/migrate-community.mjs`）以
`APP_MIGRATION_DATABASE_URL` 提供的 migration 权限凭据显式应用。

文件名格式为 `YYYYMMDDHHMMSS_description.sql`，按文件名词典序执行。Runner先创建
`community` schema 与 ledger `community.schema_migrations`（migration
ID、文件名、SHA-256 checksum 与应用时间），再逐个在事务内应用；
`services/community-postgres/src/migrations/manifest.ts`
固定每个文件的 checksum。已应用 migration 不得修改，只能追加。

Backend 运行时以 DML-only 的 `APP_DATABASE_URL`
角色启动，只读校验该 ledger，绝不执行 DDL。Development 测试账号由
`infra/development/community-development-accounts.sql`
在本地显式写入，不属于 migration，Production 不存在该数据。
