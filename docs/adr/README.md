# Architecture Decision Records

本目录记录已经由仓库所有者批准、会约束后续实现的架构决策。ADR 只说明边界、理由和后果，不代表对应运行时代码已经实现。

## T04.0 决策

- [0001：Modular Monolith 与依赖边界](0001-modular-monolith-and-dependency-boundaries.md)
- [0002：Runtime contracts 与 OpenAPI](0002-runtime-contracts-and-openapi.md)
- [0003：平台身份、来源身份与公共模型](0003-site-and-source-identity.md)
- [0004：PostgreSQL driver 与 migration 策略](0004-postgresql-driver-and-migration-strategy.md)

新的决策通过新增 ADR 演进；已经生效的 ADR 不通过静默改写改变历史。如需推翻决策，应新增 superseding
ADR 并注明被替代记录。
