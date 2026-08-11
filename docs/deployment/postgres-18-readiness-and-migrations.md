# PostgreSQL 18 migration and readiness baseline

T05.2的本地Compose与GitHub
CI固定使用官方`postgres:18.4-alpine`。18.4是本checkpoint唯一测试过的minor；升级到18.5或后续版本必须作为显式infrastructure
maintenance change，同时更新Compose、CI与本文件并重新运行真实数据库测试。

## Deployment order

```text
explicit migration command
→ verify success
→ start production backend
→ read-only required-ledger validation
→ listener starts
```

普通production
startup不执行DDL、不创建`schema_migrations`、不自动应用migration。required
migration缺失或checksum不匹配时，listener创建前失败。数据库可以包含当前binary未知的更新ledger
row；这只说明当前binary所需migration仍存在，不代表rollback到旧binary安全。

未来schema演进必须采用经审核的backward-compatible
expand/contract策略。drop、rename、不兼容类型变化或其他destructive
migration必须经过独立compatibility checkpoint。

## Health semantics

Production composition把PostgreSQL readiness注入唯一的`GET /health`：

- PostgreSQL可用：`200 {"status":"ok"}`；
- PostgreSQL不可用：既有`SERVICE_UNAVAILABLE` error envelope与HTTP 503。

T05.2没有新增第二个endpoint。部署平台不得在没有独立deployment
decision的情况下把这个DB-aware readiness endpoint同时当成process liveness
probe；否则短暂数据库故障可能导致不必要的process restart。
