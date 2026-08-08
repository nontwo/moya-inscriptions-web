# Architecture Decision Records

| ADR                                                       | 状态       | 决策范围                                    |
| --------------------------------------------------------- | ---------- | ------------------------------------------- |
| [0001](0001-modular-monolith-and-boundaries.md)           | Accepted   | Modular Monolith、Query Port 与依赖方向     |
| [0002](0002-public-contracts-and-openapi.md)              | Superseded | 原 T04 v2 公开 API 边界                     |
| [0003](0003-inscription-first-public-archive-boundary.md) | Accepted   | 碑刻 MVP 优先的 ArchiveItem 与公开 API 边界 |

ADR 只记录已经随代码和测试落地的决定。数据库、Router、Importer、Admin
CRUD、地区审核和真实数据接入尚未决策或实现。ADR
0002 保留为历史记录，其中的搜索、分类和图片公开边界已由 ADR 0003 取代。
