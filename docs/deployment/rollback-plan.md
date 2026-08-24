# Provider-neutral rollback principles

本文件不包含 provider
console、CLI 或 production 操作授权。它定义 provider-neutral safety
boundary；真实 rollback runbook 必须在 provider 与 production
topology 获批后由有权限的负责人验证。

## Principles

- Rollback 目标是 previous known-good immutable
  release，不是在 incident 中重新构建。
- Web artifact、backend artifact、configuration revision 与完整 Git
  SHA 必须可独立定位。
- Application rollback 不删除 database rows 或 media objects。
- Database restore/downgrade 是高风险独立操作，需要明确 data
  authority 与已验证 backup。
- 优先停止扩大影响、回退 traffic/version pointer，并保留 failed
  artifact 与 evidence。

## Required release record

每次 production release 前记录：

- current/target/previous known-good Git SHA 与 artifact digests；
- configuration/secret revision identifiers（不记录明文值）；
- Web/API route and traffic revision；
- migration ledger state 与 backup identifier；
- readiness、error rate、latency 与 database connection baseline；
- rollback authority、communication owner 与 observation window。

缺少这些记录时不得继续 production release。

## Decision flow

1. 发现 mandatory validation failure 后停止扩大 traffic，并记录时间线。
2. 分类影响面：Web、Backend/API、configuration/routing、Media URL
   resolution、database 或 security/data-integrity incident。
3. 安全或数据完整性风险优先隔离写流量并升级到相应 authority。
4. 选择最小影响 rollback path，不同时执行多个未经验证的修复。
5. 恢复后运行 core checks 并观察；未恢复则进入 incident
   response，不反复盲目发布。

## Application and configuration rollback

- 将 Web/backend traffic 或 version pointer 回到 previous known-good immutable
  digest。
- 恢复与该 release 匹配的 configuration revision；禁止复制其他 environment
  credential。
- 确认 Web、Backend/API 与 PostgreSQL 仍指向同一获批 environment。
- 验证 Formal Root、health/readiness、Catalog list/detail、error paths 与 Media
  URL resolution。
- 不从 historical provider candidate 恢复 environment names、static hosting
  assumption、API path、CDN base URL 或 object storage configuration。

## Media and cache safety

- UI 始终使用 Public response 已解析的
  `PublicMedia.src`，rollback 不引入 frontend object-key composition。
- Application rollback 不删除 media objects；immutable/versioned
  objects 保留供已知良好 release 使用。
- Cache invalidation 仅针对经确认的 affected
  paths；不以全量 purge 替代 root-cause classification。
- 发现 unauthorized public access 时先收紧 access，再执行 precise
  invalidation 与 incident investigation。

## Database safety

- 优先使用 backward-compatible expand/contract migration，使 previous
  application release 仍可工作。
- 不执行未演练的 down migration，不把普通 application rollback 等同于 database
  restore。
- Destructive migration 必须有 verified backup、restore
  steps、RPO/RTO 与 data-owner approval。
- Point-in-time restore 前先隔离写入并保全 audit evidence；恢复后验证 migration
  ledger 与 application compatibility。

## Closure

- [ ] Web、Backend/API、database 与 resolved Media URLs 恢复到 known-good
      state。
- [ ] Readiness、Catalog reads、error rate、latency 与 database
      connections 恢复基线。
- [ ] Logs 证明无 credential leak、cross-environment access 或持续 data
      corruption。
- [ ] 实际恢复时间、artifact/config revision、traffic state 与 residual
      impact 已记录。
- [ ] Failed release 与 evidence 已保留，follow-up fix 重新通过完整 release
      checklist。
