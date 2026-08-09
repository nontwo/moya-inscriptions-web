# ADR 0003：碑刻 MVP 优先的公开档案边界

- 状态：Accepted
- 日期：2026-08-09
- 范围：T04.0-R 公开契约、只读 Query Port 和 OpenAPI
- 取代：ADR 0002 中的搜索、分类、图片与五路由边界

## 背景

T04 v2 在没有数据库、HTTP
runtime、正式页面或真实客户端的情况下，提前冻结了搜索、分类、时期排序、图片、关系和内部生命周期。这些契约尚未被真实数据和可运行纵向切片验证。

当前产品目标仍是中国摩崖与石刻数字档案。绘画、雕塑、社区和交易是长期可能性，不是第二阶段数据库落地前的已验证需求。

## 决策

### ArchiveItem 的语义

`ArchiveItem` 是平台管理和公开展示的数字档案条目。它不是：

- 原始数据源中的 `SourceRecord`；
- 图片、衍生图或对象存储键；
- 用户帖子或社区动态；
- 商品、SKU 或交易记录。

“来源无关”意味着平台 ID 和公开 DTO 不绑定某一批数据，不意味着删除 provenance。后续 Schema 必须用显式映射连接
`ArchiveItem` 与 `SourceRecord`，但 T04.0-R 不预先决定该 Schema。

`ArchiveItemSummary`、`ArchiveItemDetail` 和 `ArchiveItemPage`
只是 T04.0-R 为验证 list/detail 边界建立的最小过渡 Public Read
Contract，不是最终 Catalog 领域模型。T04.1 将重新冻结 `CatalogRecord`
语言、内部 Read Model、最终 Public DTO 及其映射；当前名称和 `/v1/items`
路径不获得长期兼容承诺。

### 公开契约

- `@moya/contracts` 根入口只导出公开 DTO、分页、transport
  query 和安全错误的 TypeScript 类型。
- Runtime schema 继续从 `@moya/contracts/schemas` 显式导入，JSON Schema 继续从
  `@moya/contracts/json-schema` 导入。
- `ArchiveItemRecord`、持久化状态、审核状态和删除状态不属于该公开 surface。
- 公开地区只表达已允许公开的省级展示值。市、县、行政区代码和验证模型继续属于D01。
- 保护/收藏单位作为 provenance-backed 展示标签，不等于已规范化的机构实体。

### Query Port 与 OpenAPI

`packages/data-access` 只保留
`ArchiveCatalogReader`，其能力只包含分页列表和按平台 ID 获取详情。搜索和分面不再作为 Reader 的预设能力。

`packages/data-access` 是 T04.0-R 的 backend-only transitional package，
`ArchiveCatalogReader`
也是临时只读边界，不得加入 create、update、delete、publish、approve 或其他 mutation。T04.1 的目标是把 Catalog
application-owned read port 迁入
`services/api/modules/catalog/application/ports/CatalogReadRepository`；迁移完成后，若
`packages/data-access` 不再有合法职责则删除该包。

OpenAPI 3.1.1 只保留：

- `GET /health`
- `GET /v1/items`
- `GET /v1/items/{id}`

这三条路径只是 T04.0-R minimal transitional API
baseline。T04.1 将根据 Catalog 架构重新冻结正式路径和 DTO，不为临时 `/v1/items`
制造兼容债务。

页码分页保持 `page=1`、`pageSize=20`、最大
`pageSize=100`。本阶段不暴露排序、搜索、分类、地区筛选或首页 feed 参数。

### 后续任务所有权

- T05：图片、object key、媒体关系和 importer。
- T06：首页投影和 `/v1/home`。
- T07：taxonomy、facet 和地区筛选。
- T08：搜索、relevance 和 `/v1/search`。
- T09：坐标、关系、丰富引用和完整详情。
- T10-lite：审核生命周期、发布后台和审计。

这些能力是 deferred，而不是从平台架构永久删除。`not defined in T04.0-R` 不等于
`not needed by the platform`。

T04.0-R 不建立
`CatalogRecordExtension`、HomeFeedComposer、Media、Editorial、Rights 或 Outbox 模型。

### Source、Media 与相邻领域

长期来源链固定为：

```text
Raw Source / SourceRecord
→ T05 controlled importer
→ future CatalogRecord
→ Backend Application
→ Public DTO
→ HTTP
→ Frontend
```

`SourceRecord` 不等于 `ArchiveItem`，也不等于 future `CatalogRecord`；raw
source 不得进入 Web/Admin/UI runtime。

长期媒体链固定为：

```text
objectKey
→ backend StorageUrlResolver
→ runtime public/signed URL
→ future PublicMediaDTO.src
→ Frontend
```

Public/signed runtime URL 可以作为未来 Public Media
DTO 的展示值；永久禁止进入 Frontend 的是 object key、bucket、provider
internals、credentials 和客户端 URL 拼接。`PUBLIC_CDN_BASE_URL`
是已废弃的 frontend
convention，不预定为未来 Resolver 配置名；T05 实现 Resolver 时再决定 backend-only
configuration 并迁移。

Catalog、Community 与 Commerce 保持独立事实边界：

```text
CatalogRecord != CommunityPost != Product / Order
```

未来 `CommunityPost` 和 `Product` 可以引用
`CatalogRecord`，但不得建立把权威文化事实、用户内容和交易事实混为一体的 Universal
Content 基类。

## 后果

这是无 HTTP
runtime、无正式客户端阶段的一次受控破坏性收缩，不保留搜索、分类或旧内部类型的 compatibility
alias。以后的公开能力必须由负责任务根据真实数据、页面和运行时行为增量引入。
