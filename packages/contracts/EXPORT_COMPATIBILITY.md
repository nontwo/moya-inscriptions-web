# `@moya/contracts` T04.0 export compatibility map

本表记录 T01 当前公开 export 在 Zod 迁移中的处理。迁移后的根入口
`@moya/contracts` 只保留类型；所有 runtime schema 改从 `@moya/contracts/schemas`
显式导入。派生的 JSON Schema 使用 `@moya/contracts/json-schema`，并采用
`*JsonSchema` 名称，避免把 Zod schema 与 JSON Schema 对象混为一谈。

## Type exports

| T01 export                          | T04.0 处理      | 兼容性说明                                                                                    |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `SourceCatalogRow`                  | 保留            | 改为从 Zod 推导；required/optional、范围和 raw 事实不变                                       |
| `RegionCandidateSourceMethod`       | 保留            | enum 值不变                                                                                   |
| `RegionCandidateVerificationStatus` | 保留            | `unverified \| verified` 不变                                                                 |
| `RegionCandidateSource`             | 保留            | evidence model 不变                                                                           |
| `RegionCandidate`                   | 保留            | city/county/nullability 不变；不引入 D01 新模型                                               |
| `RegionEnrichment`                  | 保留/收紧       | 字段与当前事实不变；只保证非空 selected index 指向存在候选，不增加 verification/evidence 政策 |
| `NormalizedRegion`                  | 保留/暂定       | province/city/county 只做语义等价迁移；长期结构等待 D01.1 Contract Change Request             |
| `Coordinates`                       | 保留            | 字段、范围和 optional 语义不变                                                                |
| `CatalogSource`                     | 保留            | `sourceId` 改为 branded `SourceId`；wire value 仍是字符串                                     |
| `DataStatus`                        | 保留            | enum 值不变                                                                                   |
| `DataQualityFlag`                   | 保留            | enum 和字段不变                                                                               |
| `HistoricalPeriod`                  | 保留            | 字段和 optional 语义不变                                                                      |
| `HeritageRecord`                    | 保留            | 内部 normalized/domain model；`id` 继续是历史 string，不改成 `SiteId`                         |
| `Region`                            | 保留            | 当前行政区字段语义等价迁移；完整 redesign 归 D01                                              |
| `SiteSummary`                       | 保留/收紧       | `id` 改为 branded `SiteId`；地区收窄为 province-only `PublicRegion`；成为严格 public DTO      |
| `SiteDetail`                        | 保留/收紧       | 使用 `SiteId`；移除 public `createdAt`/`updatedAt`；严格拒绝内部审核字段                      |
| `ImageAsset`                        | 保留/收紧       | 改为 `siteId?: SiteId`；optional/non-null 不变；T05 关系未冻结                                |
| `Reference`                         | 保留            | 字段和 optional 语义不变                                                                      |
| `SiteSearchQuery`                   | 保留/替换       | 变为 normalized search query；keyword 必填；移除 city/county、createdAt sort                  |
| `PaginationQuery`                   | 保留/收紧       | normalized pagination；page/pageSize 必填，移除通用 sortBy/sortOrder                          |
| `PaginatedResponse<T>`              | 保留/破坏性调整 | 已批准一次性将 `data` 改为 `items`，不提供 legacy alias                                       |
| `ApiSuccess<T>`                     | 保留            | 改为从 runtime schema factory 推导；现有 success/data/meta 结构保留                           |
| `ApiError`                          | 保留/收紧       | code 固定为四个公共代码；加入 requestId；details 只允许显式安全结构                           |

## Runtime schema exports

下列现有 symbol 均保留名称，但从根入口移到
`@moya/contracts/schemas`，且运行时值从手写 JSON Schema object 替换为 Zod
schema。需要 JSON Schema 的调用方必须改用 `@moya/contracts/json-schema` 中对应的
`*JsonSchema` export。

| T01 root runtime export       | T04.0 runtime export      | 已批准的语义变化                                     |
| ----------------------------- | ------------------------- | ---------------------------------------------------- |
| `sourceCatalogRowSchema`      | `@moya/contracts/schemas` | Zod；第一批 SourceId pattern 保留                    |
| `regionCandidateSourceSchema` | `@moya/contracts/schemas` | Zod；evidence model 不变                             |
| `regionCandidateSchema`       | `@moya/contracts/schemas` | Zod；不增加 D01 政策                                 |
| `regionEnrichmentSchema`      | `@moya/contracts/schemas` | Zod；不解决或选择候选                                |
| `normalizedRegionSchema`      | `@moya/contracts/schemas` | Zod；现有 city/county 语义不变                       |
| `coordinatesSchema`           | `@moya/contracts/schemas` | Zod；范围不变                                        |
| `catalogSourceSchema`         | `@moya/contracts/schemas` | Zod；保留第一批来源约束并推导 branded `SourceId`     |
| `historicalPeriodSchema`      | `@moya/contracts/schemas` | Zod；语义不变                                        |
| `heritageRecordSchema`        | `@moya/contracts/schemas` | Zod；保持 internal model                             |
| `regionSchema`                | `@moya/contracts/schemas` | Zod；语义等价迁移                                    |
| `dataQualityFlagSchema`       | `@moya/contracts/schemas` | Zod；语义不变                                        |
| `imageAssetSchema`            | `@moya/contracts/schemas` | Zod；optional siteId branded；T05 关系未冻结         |
| `referenceSchema`             | `@moya/contracts/schemas` | Zod；语义不变                                        |
| `siteSummarySchema`           | `@moya/contracts/schemas` | Zod strict public DTO；id branded                    |
| `siteDetailSchema`            | `@moya/contracts/schemas` | Zod strict public DTO；移除持久化时间                |
| `siteSearchQuerySchema`       | `@moya/contracts/schemas` | normalized search；province-only region filter       |
| `paginationQuerySchema`       | `@moya/contracts/schemas` | normalized pagination；默认值由 transport parse 产生 |
| `paginatedResponseSchema`     | `@moya/contracts/schemas` | Zod base schema；`data` 改为 `items`                 |
| `apiErrorSchema`              | `@moya/contracts/schemas` | 稳定 code、requestId、安全 details                   |

## New exports

- Identity：`SiteId`、`SourceId`、`FirstBatchSourceId` 及对应 schemas。
- Public DTO：provisional province-only `PublicRegion`、`CategoryFacet`
  及对应 schemas。
- Query：`SiteListTransportQuery`、`SiteSearchTransportQuery`、`SiteListQuery`、transport/normalized
  schemas 与 parse functions。
- Response：`ApiErrorCode`、`InvalidQueryDetails`、`createApiSuccessSchema`、`createPaginatedResponseSchema`。
- JSON Schema：全部使用 `*JsonSchema` 名称，从 Zod 派生。

## Removed exports

没有静默删除 symbol。旧 root runtime
schema 入口被有记录地关闭；相同 symbol 在显式 `/schemas`
子路径保留。`PaginatedResponse.data`、public
`SiteDetail.createdAt/updatedAt`、public query 的 city/county 与 createdAt
sort 是所有者已批准的显式破坏性调整。

`ImageAsset.siteId` 仍为 optional 且不接受
`null`。T04.0 只升级字段存在时的 identity
type；是否允许未关联 asset、asset/site 的 ownership 和一对一、一对多或多对多关系均由 T05 决定。

## D01.1 deferred region decisions

本 Commit 不导出 `RegionFacet`，也不冻结 city/county、facet hierarchy 或长期
`NormalizedRegion`。`PublicRegion` 只是当前 v1 防止未核验 lower-level
region 进入 public DTO 的 province-only safety
projection，不替代 D01.1 的长期地区模型。相关契约等待 D01.1 Contract Change
Request 审核后再接入。
