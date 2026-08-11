# Database migrations

所有数据库结构变更必须通过 UTC 时间戳标识的 migration 提交，并由架构总控协调编号。文件名格式为
`YYYYMMDDHHMMSS_description.sql`，按文件名词典序执行。

Migration 通过独立命令应用；production
backend 普通启动只读验证所需 ledger，绝不自动修改 schema。`schema_migrations`
保存 migration ID、文件名、SHA-256
checksum 与应用时间。已应用 migration 不得修改，只能追加后续 migration。

数据库存在当前 binary 未知的更新 ledger
row，不代表回滚安全。Schema 演进必须遵循经审核的 expand/contract 策略；drop、rename 或不兼容类型变更需要独立 compatibility
checkpoint。

共享契约不等同于数据库 Schema。T05.2 migration 只建立 Catalog read
model 结构，不包含正式数据。
