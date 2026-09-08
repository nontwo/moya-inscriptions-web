# `@moya/catalog-postgres`

T05.2 private PostgreSQL infrastructure adapter。它实现application-owned
`CatalogQueryPort`，但不定义第二套port，也不导出Public
DTO或HTTP能力。T05.3使list count与page rows共享同一个参数化optional kind
predicate；未提供kind时保持既有全Catalog listing语义。

Schema migration必须通过独立命令执行：

```sh
pnpm --filter @moya/catalog-postgres build
DATABASE_URL='postgresql://...' pnpm --filter @moya/catalog-postgres migrate
```

Production application启动只读验证required migration
ledger，不自动执行DDL。当前兼容性与Compose/CI测试基线固定为PostgreSQL
18.4。数据库存在更新ledger
row不代表旧binary可以安全rollback；schema演进必须使用经审核的expand/contract策略。

Search V1 additionally implements the independent application
`CatalogSearchQueryPort`. The fixed OpenCC transformation applies only to
rebuildable search documents and queries. Search uses literal substring AND,
orders all matching records by the approved tiers and then CatalogId in C
collation, and applies the existing page pagination. Only the combined text has
a trigram GIN index; similarity scans and additional search engines are absent.

After applying the search migration, explicitly rebuild under the existing
authorized operator configuration:

```sh
pnpm --filter @moya/catalog-postgres search:rebuild
```

The command reads `DATABASE_URL` from protected configuration; do not put a real
connection string on the command line. It reports only completion counts or a
generic failure. Rebuild locks the three public source tables for a consistent
snapshot and changes only derived search documents. It does not import Catalog,
change identity, read internal sources, or touch media.

The existing controlled importer refreshes each record inside its content write
transaction. Replay remains a no-write operation. Direct changes to searchable
source fields clear and invalidate the corresponding copy. Invalidation and
refresh serialize on the same projection row; refresh acquires that row before
reading source fields, including an unchanged-content import. Missing or
outdated copies make search unavailable until rebuilt. Search never writes on
startup or on the first request, and does not silently return incomplete
results.

Deployment must retain separate identities: the existing runtime role requires
SELECT on the new search table, while the authorized content/rebuild operator
requires its INSERT/UPDATE/DELETE privileges. Migration does not change roles or
grants. The invalidation triggers use invoker privileges. Existing Catalog
visibility is enforced by joining the current role's Catalog read set; no new
publication or ACL model is introduced.
