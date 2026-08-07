# ADR 0003：平台身份、来源身份与公共模型

- 状态：Accepted
- 日期：2026-08-08
- 范围：T04.0 身份与数据安全边界

## 身份决策

- `SiteId` 是平台实体身份。
- `SourceId` 是 provenance/source record identity。
- `first-batch-NNNN` 永久作为第一批数据的 `SourceId`。
- 平台实体与来源记录未来必须通过显式关系映射，禁止依赖两个字符串相等。

T04.0 不生成 1658 个 `SiteId`，不创建 source-to-site
mapping，也不决定 UUID、ULID 或数据库列类型。T01 五条 normalized sample 中
`HeritageRecord.id` 当前等于 `sourceId`
仍作为历史数据事实保留，但不能被解释为已经分配的平台 `SiteId`。

## 模型职责

数据按职责隔离为：

```text
Source / raw
→ Candidate / evidence
→ Internal normalized / domain
→ explicit mapping
→ Public DTO (SiteSummary / SiteDetail)
```

- `HeritageRecord` 等内部模型不得直接序列化为 API response。
- raw
  source、candidate、evidence、needsReview、reviewNotes 和内部审核状态不得进入公共 DTO。
- 未核验的 lower-level region 数据不得进入公共 DTO 或 API。
- Public DTO 不暴露内部 `createdAt`、`updatedAt`。

## D01 ownership

Region normalization/verification 属于独立 D01 任务：

- D01 负责 province/prefecture/county-level 模型、行政区 code/type/version、candidate/evidence
  verification 和冲突解决。
- T04.0 对现有 `RegionCandidate`、`RegionEnrichment`、`NormalizedRegion`
  只进行语义等价的 Zod 迁移。
- T04.0 不重新设计 city/county 行政区模型。
- `RegionFacet` 在 T04.0 只表达当前允许公开的最小地区 facet。
- D01 通过数据、证据、研究和 Region Contract Handoff 交付结果，之后基于最新
  `integration/mvp` 接入共享架构文件。
- T04.0 不读取、依赖或修改 D01
  worktree；D01 在 T04.0 合并前不得并行修改 contracts、data-access 或 public-api。

## 原始与派生数据回归策略

- `source-catalog.json` 是 immutable raw-source
  baseline，长期保护事实、记录数和文件 SHA-256
  `73a2c711700cdace7f74fc38d4ccd6866bc14a63ce6ac41fac9aa989c8912f7b`。
- `region-enrichment.json` 与 `normalized-sample.json`
  是可能由 D01 合法演进的派生数据。
- T04.0 实施期间必须验证两份派生文件前后没有意外变化，但不把当前 0 verified、0
  selected、0 evidence URL 固化成永久 CI invariant。
- 永久测试验证 provenance、状态机和 public safety
  invariant，而不是把当前候选数量状态升级为永恒领域规则。
