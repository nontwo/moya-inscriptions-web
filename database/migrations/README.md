# Database migrations

所有数据库结构变更必须通过带唯一编号的 migration 提交，并由架构总控协调编号。当前没有正式 Schema、migration、migration
runner 或数据库连接；T01 JSON/Schema 不等同于数据库 Schema。

T04.0 只冻结以下编号：

| 编号   | 预留范围                                 |
| ------ | ---------------------------------------- |
| `0001` | source files / source catalog            |
| `0002` | region enrichment / candidate / evidence |
| `0003` | heritage records / categories            |
| `0004` | image assets                             |
| `0005` | search / list indexes                    |

编号冻结不代表 Schema 或 migration 内容已经批准。T04.0 不创建任何 migration 文件。

`0002`
只保留编号；province/prefecture/county-level、行政区 code/type/version、candidate/evidence
verification 和冲突解决由 D01 负责。实际字段和约束必须等待 D01 Region Contract
Handoff，不能由 T04.0 提前定义。

PostgreSQL 仍是目标数据库，`pg` 是后续 adapter 的推荐 driver。`node-pg-migrate`
仅作为 T04.1
proof 候选，需先验证稳定编号、history、transaction、locking、显式 SQL 和 CI/部署兼容性，再决定是否采用。T04.0 不安装
`pg`、`node-pg-migrate`、Hono 或 ORM。
