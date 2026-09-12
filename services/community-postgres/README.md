# `@moya/community-postgres`

Community V1 (Mission 2A) private PostgreSQL adapter for the Backend-owned
`community` schema namespace: public users, Development test accounts and
server-side sessions. It implements the application-owned
`CommunityIdentityPort` from `@moya/api` and defines no second port, no Public
DTO and no HTTP capability. The composition root opens the pool with the
DML-only App role and passes it in; this package reads no environment variable
(the freeze guard keeps the App role variable in the composition root and the
migration command only).

The community migration family is separate from the `legacy` and `payload`
families and is never selected by `MOYA_CONTENT_SOURCE`:

```sh
pnpm --filter @moya/community-postgres build
APP_MIGRATION_DATABASE_URL='postgresql://...' pnpm db:migrate:community
```

`runCommunityMigrations` creates the `community` schema and its own ledger
`community.schema_migrations` with migration-privileged credentials; the Backend
runtime only verifies that ledger at startup and never performs DDL. Applied
migrations are immutable; later changes are appended under
`database/community-migrations/`.
