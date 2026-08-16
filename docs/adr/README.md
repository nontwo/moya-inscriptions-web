# Architecture Decision Records

| ADR                                                          | 状态                 | 决策范围                                   |
| ------------------------------------------------------------ | -------------------- | ------------------------------------------ |
| [0001](0001-modular-monolith-and-boundaries.md)              | Accepted             | Modular Monolith；Reader示例为历史记录     |
| [0002](0002-public-contracts-and-openapi.md)                 | Superseded           | 原 T04 v2 公开 API 边界                    |
| [0003](0003-inscription-first-public-archive-boundary.md)    | Superseded           | T04.0-R Archive compatibility历史边界      |
| [0004](0004-catalog-contract-design-freeze.md)               | Partially superseded | Catalog Contract；三值Kind为历史决定       |
| [0005](0005-catalog-kind-top-level-evolution.md)             | Accepted             | 两值一级CatalogKind；退役cliff_inscription |
| [0006](0006-long-term-data-governance-and-runtime-source.md) | Accepted             | 长期数据治理、runtime source与写入边界     |
| [0007](0007-yoyi-progressive-web-glass.md)                   | Accepted             | Progressive Web Glass 与语义导航边界       |

ADR 记录已经接受的架构决定；每份 ADR 必须单独声明 implementation status。
`Accepted` 表示决策已冻结，不自动表示代码已经实现；implementation
status仍由每份ADR独立声明。ADR 0001–0003中的Archive术语保留为历史决策记录；ADR
0004的Catalog contract、identity、Query Port和public route
migration已由T04.1-D与T04.2实现，其中三值CatalogKind决定由ADR
0005取代。PostgreSQL read foundation与HTTP runtime已由T05.0–T05.2实现。

受控`catalog-import/v1` CSV validation/dry-run/apply与PostgreSQL
persistence已经实现；XLSX parser、Importer Admin
CRUD、地区审核和真实数据接入尚未实现。ADR
0002 保留为历史记录，其中的搜索、分类和图片公开边界已由 ADR 0003 取代。ADR
0006 冻结这些未来能力必须遵守的数据权威、identity、provenance、publication 与写入治理边界，不代表提前实现相应 subsystem。
