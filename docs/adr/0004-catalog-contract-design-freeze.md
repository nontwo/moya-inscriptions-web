# ADR 0004：Catalog Contract Design Freeze

- 状态：Partially superseded by ADR 0005
- Implementation status：Canonical migration implemented（T04.1-D + T04.2）
- 日期：2026-08-10
- 范围：T04.1 Catalog 领域语言、身份、Public Contract、Query Port 与迁移边界
- Evidence
  baseline：[`T04.1 Catalog Contract Audit`](../audits/T04.1-catalog-contract-audit.md)
- 与既有 ADR 的关系：细化 ADR 0003 的 T04.1 前瞻方向；不改变 ADR 0003 对T04.0-R
  compatibility implementation的描述

> T04.2 implementation notice：本ADR的canonical
> Catalog决定现已完成contract、identity、Query Port与public route
> migration。下文描述T04.1阶段状态、Archive
> compatibility和分阶段迁移的段落保留为当时的历史计划与事实。

> T04.3 supersession notice：本ADR第1、3、4节中将`cliff_inscription`
> 作为一级`CatalogKind`的历史决定已由[ADR 0005](0005-catalog-kind-top-level-evolution.md)
> 取代。历史三值文本保留作为决策演进证据，不代表当前active contract。

## 背景

T04.0-R 在没有数据库、HTTP runtime 或正式客户端时建立了最小的 `ArchiveItem*`
Public Read Contract、`ArchiveCatalogReader` 和 `/v1/items` list/detail
OpenAPI。ADR
0003 明确把这些名称和路径定义为过渡边界，等待 T04.1 冻结正式 Catalog 语言。

T04.1-A 对 merged baseline
`integration/mvp@9e99bb6d01afe3e4f7d7778a5cd2975787fd53bc`
进行了只读审计。Audit确认：

- merged baseline 没有当前 `SiteId`、Site DTO、Site Repository 或 `/sites`；
- `ArchiveItemId` 当前是平台数字档案条目身份，不是来源记录身份或物理 Site 身份；
- 历史未合并 Site 模型混合了平台条目与物理地点语义；
- 当前 Query Port 直接返回 Public DTO，尚无内部 Catalog record、read
  projection 或显式 mapper；
- `/v1/items` 没有 repository-internal runtime consumer，但 repository-external
  consumer 状态无法由源码验证。

本 ADR 把已冻结 Owner
Decisions 和 Audit事实转化为实现可直接遵循的架构设计。T04.1-D现已实现Phase 1
contract、port、mapper和guard；route、database、HTTP runtime及Phase 2–4
migration仍未实现。

## 决策

### 1. Canonical domain language

平台长期通用内容实体统一使用 `Catalog`。`Site`、`ArchiveItem`、frontend
card、搜索结果或 Feed item 都不得成为平台通用领域实体。

Catalog 第一版覆盖且只覆盖：

- `inscription`
- `cliff_inscription`
- `calligraphy`

Catalog 是权威平台内容事实边界，不与 Community、Commerce、Search、Feed 或 Media 合并为 Universal
Content 模型。

### 2. Identity boundaries

`CatalogId` 是长期 canonical platform content identity。其 wire
value 保持 opaque；UUID、ULID、数据库列类型和生成策略不是本 ADR 的决定。

以下身份关系固定成立：

```text
CatalogId != SourceId
CatalogId != future SiteId
SourceId = provenance / source-record identity only
future SiteId = physical site / monument / location identity only
```

当前 `ArchiveItemId` 继续作为现有 contract compatibility
identity。T04.1-D将TypeScript `ArchiveItemId`实现为 `CatalogId`
alias；两个runtime schema保持相同wire-validation semantics，但不要求Zod或JSON
Schema对象引用及文档metadata相同。 `ArchiveItemId`不得与
`SourceId`互换，也没有执行全局rename。

T04.1 不建立 `SiteId`。如果未来建立 Site
domain，必须由独立任务定义其 identity、record、API 和与 Catalog 的关系。

### 3. CatalogKind

`CatalogKind` 的 contract source of truth 使用 Zod enum，并从其推导 TypeScript
literal union：

```ts
const catalogKindSchema = z.enum([
  "inscription",
  "cliff_inscription",
  "calligraphy",
]);

type CatalogKind = z.infer<typeof catalogKindSchema>;
```

不得使用 TypeScript `enum` 作为第二个 runtime
source，也不得加入 seal、painting、sculpture、video、UGC 或其他占位 subtype。未来增加 kind 必须通过新的 contract
change，并评估 exhaustive client 的兼容性。

### 4. CatalogRecord common shell

Backend internal `CatalogRecord` 只冻结三类内容稳定共享的最小概念：

| Concept                | Required | Meaning                                                                   |
| ---------------------- | -------- | ------------------------------------------------------------------------- |
| `id: CatalogId`        | YES      | canonical platform content identity                                       |
| `kind: CatalogKind`    | YES      | approved content kind                                                     |
| `title: string`        | YES      | canonical display title                                                   |
| `aliases: string[]`    | YES      | alternate public names; empty is valid                                    |
| `summary?: string`     | NO       | short narrative summary                                                   |
| `description?: string` | NO       | longer narrative description                                              |
| `periodLabel?: string` | NO       | display chronology only; does not establish a normalized chronology model |

`CatalogRecord` 是 backend internal domain record，不是 Public DTO、persistence
row、ORM entity 或 source
record。内部 lifecycle、provenance 和 administration 可以在各自边界与 Catalog 关联，但不得为了“完整”而塞入 common
shell。

以下概念不得进入 Catalog common shell：

- geographic coordinates、address 或 physical Site structure；
- protection/custody-specific structure；
- cliff surface、orientation 或其他空间属性；
- calligraphy format、material、folio 或 calligrapher-specific structure；
- inscription text、carrier、dimensions 或 epigraphic structure；
- 未冻结 subtype 的预留字段或通用 `metadata` bag。

缺乏跨三类稳定证据的字段一律 deferred，由后续 subtype/domain task 设计。

### 5. Internal read projections

Query Port 不直接返回 `CatalogRecord`，也不直接返回 Public Contract。application
read side 使用语义上独立的 projection：

- `CatalogListItemProjection`
- `CatalogDetailProjection`
- `CatalogListPageProjection`

Projection 只携带 list/detail mapper 所需的已解析事实。它们可以与 Public
Contract 有相似字段，但必须位于 backend application boundary，不能从
`@moya/contracts` public root 导出，也不能被 frontend 导入。

Projection 不因其“internal”身份而自动获得 raw source、storage
handle、数据库 client 或 ORM metadata。任何内部字段仍必须具有明确的 application
read 用途。

### 6. Public Contract

Public
Contract 沿用当前 suffix-free 命名习惯。Public/internal 分离依靠 ownership、module/package
boundary、显式 mapping、exports 和 architecture guards，而不是 `Dto` 后缀。

#### `CatalogSummary`

List/summary representation 固定包含：

- `id: CatalogId`
- `kind: CatalogKind`
- `title: string`
- `aliases: string[]`
- `summary?: string`
- `periodLabel?: string`

#### `CatalogDetail`

Detail representation 固定包含全部 `CatalogSummary` 字段，并增加：

- `description?: string`
- `sourceCitations: PublicSourceCitation[]`

`sourceCitations` 是 curated public
representation；空数组合法。它只允许公开 label、citation text 和 public
URL，不包含 `SourceId`、raw SourceRecord 或内部 provenance metadata。

#### `CatalogPage`

List page 固定包含：

- `items: CatalogSummary[]`
- `total: number`
- `page: number`
- `pageSize: number`
- `totalPages: number`

分页继续沿用当前边界：默认 `page=1`、`pageSize=20`，最大
`pageSize=100`；越界页返回空 `items`，page metadata 必须自洽。

#### List query

HTTP transport 与 normalized application input 保持分离：

- `CatalogListTransportQuery`：位于 `@moya/contracts`，使用可选的正整数字符串
  `page`、`pageSize`；
- `CatalogListQuery`：只位于 `@moya/api` application layer，使用规范化后的整数
  `page`、`pageSize`；
- transport validation/normalization位于独立backend transport
  boundary，application layer不解析transport输入。

T04.1 list
contract 不加入 sort、taxonomy、region、category、keyword 或其他 filter。

### 7. Explicit mapper boundary

Public DTO 必须由 application/API boundary 的显式 mapper 产生：

```text
CatalogRecord / internal facts
→ internal read projection
→ CatalogQueryPort
→ explicit application/API mapper
→ CatalogSummary / CatalogDetail / CatalogPage
→ HTTP
```

Mapper 负责：

- 只选择允许公开的字段；
- 把内部 provenance 转换为 curated `PublicSourceCitation`；
- 保持 subtype/internal facts 不因对象展开或直接序列化而泄露；
- 生成符合 strict Zod Public Contract 的值。

禁止把 `CatalogRecord` 直接 cast、spread 或 serialize 为 Public
response。Mapper 函数名、文件路径和实现形式属于 implementation
detail，但显式 mapper boundary 本身是固定架构决定。

### 8. Application-owned CatalogQueryPort

基础 Catalog read abstraction 冻结命名为 `CatalogQueryPort`：

```ts
interface CatalogQueryPort {
  list(query: CatalogListQuery): Promise<CatalogListPageProjection>;
  getById(id: CatalogId): Promise<CatalogDetailProjection | null>;
}
```

选择该名称的理由：

- Accepted ADR 0001/0003 和当前 package README 持续使用 “Query Port”
  vocabulary；
- 当前架构明确说明该边界不是加载/保存 aggregate 的传统 Repository；
- `CatalogReadRepository` 容易暗示 persistence ownership；
- `CatalogReadPort` 虽可行，但没有 `CatalogQueryPort` 精确表达 normalized
  query 与 read projection 的职责。

`CatalogQueryPort` 由 backend Catalog application
module 拥有。Frontend、UI、transport、infrastructure adapter 和 persistence
package 均不得拥有或定义该 port。

Port 只允许 `list` 和 `getById`。不得加入：

- create、update、delete、publish、approve 或其他 mutation；
- home feed、nearby、following、recommendation 或 ranking；
- card-specific 或 frontend-specific method；
- keyword、relevance、search result 或 T08 search semantics；
- taxonomy/facet、media、Site 或 admin workflow method。

Port 的最终文件路径属于 implementation detail；它必须位于 backend Catalog
application boundary，而不是 `packages/data-access` 或 frontend workspace。

### 9. Internal-only data

以下数据永久不得直接进入 `CatalogSummary`、`CatalogDetail`、`CatalogPage`
或其他 Public Contract：

- raw source、raw SourceRecord、`SourceId` 和 source-specific metadata；
- raw region、candidate region、evidence、verification/review state；
- human placement/administrative decisions、review notes、internal notes；
- internal lifecycle、workflow、moderation、deletion、publication 或 audit
  state；
- D01 governance data 和 admin-only metadata；
- object key、bucket、storage provider、credentials、resolver
  configuration 或其他 storage internals；
- database/ORM metadata 和非公共 persistence identity。

公开 citation 必须通过独立 curated representation。未来 Public
Media 必须由 backend resolver 提供 runtime URL；objectKey 永不成为 frontend
contract。

### 10. Deferred domain boundaries

#### Search

Search 属于 T08。T04.1 不定义 search endpoint、ranking、keyword
semantics、relevance score、search repository 或 search-specific result
contract。

`CatalogSummary` 和 list
projection 只保证是稳定基础表示；T08 可以消费或映射这些事实，但不得要求 T04.1
Query Port 预先承担搜索职责。

#### Site/location

T04.1 不建立 `SiteId`、`SiteRecord`、`SiteRepository`、Site DTO 或 Site
API。未来 Catalog 可以关联独立 physical Site/location
domain，但本 ADR 不冻结 cardinality、persistence relation 或 public projection。

Catalog provenance 直接关联 Catalog 事实边界，不依赖 Site 存在。

#### Home Feed and presentation

Home
Feed、recommendation、card、personalization、following、nearby 和 ranking 全部 deferred。Frontend
card 不是 domain record 或 Query Port output。

#### Media, taxonomy, region, and workflow

Media、taxonomy/facet、完整 region/location、关系图和 admin
workflow 继续由各自后续任务拥有。本 ADR 不预先冻结其 schema。

### 11. Public route strategy

长期 canonical public routes 固定为：

```text
GET /v1/catalog
GET /v1/catalog/{catalogId}
```

当前 `/v1/items` 和 `/v1/items/{id}` 在 T04.1-B 保持不变。真正 route
migration 必须是后续独立 contract migration
task，并在执行前重新检查 deployment、OpenAPI client 和 repository-external
consumer。

Audit 已确认没有 repository-internal runtime consumer。外部 consumer 状态为
`externally unverified`，不是“已确认不存在”。默认不长期维护 `/v1/items` 与
`/v1/catalog`
两套等价 route。只有发现明确外部 consumer 时，才允许设计具有 owner、期限、迁移通知和删除条件的有限 compatibility
window。

### 12. Schema source of truth

Public Contract 的单向 source-of-truth chain 保持：

```text
Zod
→ inferred TypeScript
→ JSON Schema Draft 2020-12
→ OpenAPI 3.1.1
```

OpenAPI JSON 是确定性生成物。不得手写第二套 TypeScript interface、JSON
Schema 或 OpenAPI component 作为并行事实源。Path/method/status 属于 OpenAPI
composition boundary，但其 data schema 必须来自 contracts JSON Schema。

### 13. Frontend and architecture guards

后续 T04.1 implementation 必须保持 `apps/web/**` zero
modification，并增加或调整 guard 以确保：

- Frontend 只能 `import type` Public Contract；
- Catalog public type allowlist 包含 `CatalogId`、`CatalogSummary`、
  `CatalogDetail`、`CatalogPage` 和 curated citation type；
- Frontend 不得导入 Catalog
  application/runtime、`CatalogQueryPort`、Reader、adapter 或 internal
  projection；
- strict Public Contract/OpenAPI tests 拒绝 raw
  source、SourceId、evidence、review、objectKey、storage 和 admin fields；
- `packages/ui` 继续 domain-agnostic；
- raw dataset/importer allowlist 继续永久拒绝 frontend workspace；
- objectKey/storage details 通过 contract shape 和 import
  guard 双重隔离，不能只依赖 URL composition token scan。

这些guard已在T04.1-D通过ESLint和architecture/contract tests实现。

## Compatibility and migration plan

### Phase 1 — Canonical Catalog contracts

- **Implementation status：Completed in T04.1-D.**
- 新增 `CatalogId`、`CatalogKind`、`CatalogRecord`、internal projections、
  `CatalogQueryPort`、Public Contract 和 mapper；
- 保留当前 Archive public symbols、Reader 和 `/v1/items`；
- 不修改 frontend、route 或 OpenAPI path；
- 以 architecture/contract tests 验证 internal/public separation。

### Phase 2 — Archive terminology and identity usage

- 把 backend internal usage、read flow 和 mapper 迁移到 Catalog language；
- 明确 Archive compatibility name 与 Catalog canonical identity 的代码关系；
- 迁移已知 TypeScript/schema consumers，但仍不假定外部 route consumer 不存在；
- 不借迁移恢复历史 Site model。

### Phase 3 — Controlled public route migration

- 重新检查 repository-external/deployed consumers；
- 将 `/v1/items`、path parameter、operation
  IDs、components、responses、tests、generated OpenAPI 和文档作为一个 contract
  change 迁移到 `/v1/catalog`；
- 若没有 consumer，执行单路径受控迁移；
- 若发现 consumer，只建立有明确 sunset 的有限 compatibility window。

### Phase 4 — Compatibility cleanup

- 在所有已知 consumer 完成迁移后删除 Archive compatibility exports；
- 删除 transitional `ArchiveCatalogReader`；
- 如果 `packages/data-access` 不再有合法职责，按独立 cleanup task 删除；
- 删除过渡测试/文档，不保留无期限 alias 或双路由。

每个 phase 必须是独立、可审查、可验证的任务。不得把四个 phase 合并为一次全局 rename 或巨型重构。

## T04.2 implementation record

Owner批准T04.2作为独立、可审查的canonical migration任务，完成剩余Archive
terminology、identity、public contract、route和compatibility cleanup：

- active contract只保留`CatalogId`、`CatalogKind`、Catalog Public DTO和
  `CatalogListTransportQuery`；
- canonical public routes为`GET /v1/catalog`和
  `GET /v1/catalog/{catalogId}`，不保留`/v1/items`双路由；
- backend read abstraction只保留application-owned `CatalogQueryPort`；
- `packages/data-access`按批准范围保留为空backend workspace，不在本任务删除；
- repository-external consumer仍标记为`externally unverified`。

本实现不加入HTTP runtime、persistence
adapter、database、`SourceId`或`SiteId`，也不改变本ADR的deferred domain
decisions。

## Deferred decisions

以下内容不由本 ADR 冻结：

- `CatalogId` wire generation/storage format；
- SourceRecord、Site/location、subtype extension 的 persistence
  schema 与 cardinality；
- chronology normalization、uncertainty、evidence 和 historical dating model；
- database、SQL、ORM、migration、HTTP runtime、adapter 和 deployment；
- Search、Feed、Media、taxonomy、region 和 admin workflow contracts。

这些是 deferred decision 或 implementation
detail，不得被解释为 Owner 尚未决定 Catalog 核心边界。

## Consequences

### Positive

- 平台内容身份与来源、地点身份明确分离；
- 三种首发内容共享小而稳定的 common shell；
- Public Contract 不再由内部 record 或 persistence shape 驱动；
- Query Port 与 mapper 为未来 adapter/API implementation 提供明确依赖方向；
- Search、Feed、Site 和 subtype 设计可以独立演进；
- route migration 有明确 consumer gate 和 cleanup 终点。

### Costs and constraints

- Catalog implementation 需要新的 internal
  projection 和 mapper 层，而不能直接返回 record；
- Archive compatibility artifacts 会在多个 phase 中短期存在；
- public route migration 必须同步更新 generated contracts 和 consumer；
- enum 扩展、required field 和 alias removal 仍需显式 compatibility review。

## OWNER REVIEW

Catalog entity、CatalogId、CatalogKind、Search ownership、Site deferral、Home
Feed deferral、canonical route 和 suffix-free Public Contract
naming 均已冻结。本 ADR 未发现新的领域级架构冲突。

**No additional Owner decision was required for T04.1 Phase 1 implementation.**
