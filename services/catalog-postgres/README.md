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
