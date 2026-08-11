# ADR 0006：长期数据治理与 Runtime Source of Truth

- 状态：Accepted
- Implementation status：Governance frozen；T05.3 HTTP enforcement in progress
- 日期：2026-08-11
- 范围：Catalog 长期数据治理、未来写入边界与 Public Read HTTP runtime
- 关联：延续 ADR 0001 的依赖方向、ADR 0004 的 Catalog identity/Public DTO
  boundary，以及 ADR 0005 的两值一级 `CatalogKind`

## 背景

T05.0–T05.2 已建立 Node.js HTTP runtime、Catalog list/detail
boundary、PostgreSQL 18 read model、`CatalogQueryPort` adapter 与 production
composition。下一阶段可能出现 XLSX/CSV bulk workflow、Admin
CMS、用户投稿和多人编辑；如果不先冻结数据权威、身份、provenance 与发布边界，这些写入路径会形成互相冲突的事实系统。

本 ADR 记录 Owner 已批准的长期治理决定。除 T05.3 明确要求的 Public Read HTTP
enforcement 外，下述长期模型不代表本任务已经实现对应 schema 或 subsystem。

## 决策

### 1. Runtime source 与文件角色

PostgreSQL 是正式运行系统的 **canonical runtime source of
truth**。Frontend、HTTP
runtime 和 application 不得读取 XLSX、CSV、fixture 或 raw source 作为 production
database。正式读链固定为：

```text
Frontend
→ Public HTTP API
→ Application Service
→ CatalogQueryPort
→ PostgreSQL adapter
→ PostgreSQL
```

XLSX 是 Owner/Editor working format，用于人工审核、批量编辑、D01/evidence
review 和未来 bulk administration；即使未来存在 Admin CMS，也可继续保留 XLSX
workflow。XLSX 不是 runtime database、Public API source 或 canonical machine
contract。

CSV/canonical rows 是 canonical bulk interchange/import format。未来 XLSX
parser 必须先转换为 canonical rows，再与 CSV 共享同一 validation
contract；不得维护两套互相分叉的 validation rules。

完整 production XLSX/CSV dataset 默认不进入代码 Git。仓库只保存 import
schema、代码、文档、小型 fixture 与 template/example；production
workbook 不得成为 repository source of truth。

### 2. Future import safety

未来 bulk import 必须遵循：

```text
XLSX / CSV
→ canonical rows
→ shared validation
→ duplicate candidate detection
→ diff
→ dry-run
→ Owner review / approval
→ apply
→ PostgreSQL
```

不得把 workbook 直接转换为 uncontrolled `UPDATE`，不得按标题自动 destructive
merge。长期可演进为 staging → validation → diff → review → approval →
production；T05.3 不实现 importer 或 staging system。

未来 Admin CMS 写入通过 Admin API，并与 importer 共享核心 domain
validation；两条写入路径不得形成两个互相矛盾的数据系统。

### 3. Identity、duplicate 与 provenance

`CatalogId` 是稳定、永久、opaque 的平台实体身份。创建后不得因 title、location 或
`CatalogKind` 调整而改变或重建。

```text
CatalogId != SourceId
CatalogId != future SiteId
SourceId = source-record identity only
future SiteId = physical site / monument / location identity only
```

`FirstBatchSourceId` 或其他来源批次编号不得冒充 public entity
identity。多个 source records 可以对应同一 Catalog
Entity，但 importer 只能报告 duplicate
candidates 并要求显式处置，不得按标题或其他单字段自动合并。

Raw
SourceRecord、原始值、evidence 与决策链应尽可能永久保留。Normalization 不得 destructive
overwrite raw information；正式数据必须可追溯：Catalog Entity → SourceRecord →
evidence → publication decision。

### 4. Facts、unknown 与 evidence

长期模型必须区分 known、unknown 与 not applicable，不得把所有缺失压缩为 `""`
或含义模糊的 `null`。T05.3 不因此重构现有冻结 read schema。

Original location、current location 与 current
custodian 是不同事实，并允许未来增加 temporal/history。Administrative
placement 与 coordinates 也相互独立；geocoding 和 reverse
geocoding 只能产生 candidate/evidence，不得覆盖 Owner-confirmed placement。

Owner 拥有 platform publication authority，但 `Owner accepted` 不等于 absolute
factual truth。Publication decision（accepted/decidedBy/decidedAt）与 evidence
quality（government、museum、academic、fieldwork、other、none/limited）必须独立；未来 evidence 应可关联 location、date、dimensions 等具体字段。

### 5. Title、temporal、lifecycle 与 audit

长期 title model 允许 primary、alternate、historical 与 normalized/search
title；primary 由 publication decision 决定，其他名称不得因 primary 变化被覆盖。

长期 temporal model 允许保留 dynasty、原始 date text、normalized
start/end 与 certainty/precision。原始历史文本不得因 machine-sortable
normalization 被删除。

Catalog Entity 默认采用 soft delete/lifecycle
state，至少能演进到 draft、published、hidden、archived 或现有等价术语。正式修改应能追溯 who、when、old/new
value、source/import batch 与 optional reason；T05.3 不实现完整 audit
subsystem。

### 6. Official Catalog、UGC 与 media

`Official Catalog != User Generated Content`。User
Submission/Post 必须先经过 moderation 与 platform publication
decision，之后才能关联既有 Catalog
Entity 或显式创建新实体；用户上传不得直接进入 Official Catalog。

长期 media metadata 允许 visibility、rights status、source、credit 与 storage
reference。Public API 不得泄漏 objectKey、storage implementation、private source
path 或 internal rights notes；未来 media 继续复用单一 backend resolver/public
media abstraction。

### 7. Public API stability 与 strict query

Public DTO/API 是稳定边界；internal record、database
schema 和 adapter 可以演进，但不得因此随意产生 breaking Public
change。重大 breaking change 必须经过明确 API version
evolution，当前不提前建立 v2 infrastructure。

所有当前 HTTP endpoint 采用 strict query
policy：未声明、重复或非法 query 参数返回 400 `INVALID_QUERY`。`GET /health`
是 unversioned operational endpoint，拥有独立的空-query
validation 和 readiness 语义，不进入 Catalog application/service/DTO/Port。

Catalog list 的唯一新增 filter 是 optional `kind`，且只允许
`inscription | calligraphy`。Search、taxonomy、region、sort 与其他 filters 继续由后续独立任务负责。

## T05.3 implementation boundary

T05.3 只补强 Public Read HTTP runtime：

```text
Client
→ HTTP validation
→ CatalogReadService
→ CatalogQueryPort
→ PostgreSQL adapter
→ PostgreSQL
→ internal projection
→ explicit Public mapper
→ strict Public DTO
→ HTTP JSON
```

本任务不实现 importer、production data import、Admin
CMS/API、authentication、authorization、UGC、upload、moderation
UI、search、cache/message infrastructure、frontend redesign 或 deployment
infrastructure。

## 后果

- 运行时权威、人工工作格式和机器 import contract 不再混为一体。
- 后续 importer、Admin 和 UGC 可以独立演进，同时共享明确的 Catalog publication
  boundary。
- 稳定 identity、non-destructive provenance 和 explicit
  approval 为未来 audit/history 保留路径。
- T05.3 需要同步更新 contract、OpenAPI、application
  service、adapter、tests 与文档，但不需要新 migration 或 dependency。
