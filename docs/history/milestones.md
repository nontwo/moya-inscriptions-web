# Historical project milestones

本文件保存不适合留在动态 `docs/project-status.md`
的详细历史。它是记录，不是当前 roadmap 或新的架构权威；当前事实以
[项目状态](../project-status.md) 与 [架构](../architecture.md) 为准。

| Milestone       | Historical outcome                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T00–T02         | 建立 pnpm/Turborepo monorepo、Web/Admin/API skeleton、CI、来源无关 Public contracts、design tokens、UI assets 与 T02 responsive prototype authority。   |
| T03             | 记录 CloudBase 中国大陆 candidate architecture 与非执行示例；CLEAN-02 后仅作为 archived candidate evidence。                                            |
| T04.0-R–T04.3   | 从旧 Archive compatibility 迁移到 canonical Catalog contracts、application-owned Query Port、strict transport mapping 与两值 `CatalogKind`。            |
| T05.0–T05.3     | 建立真实 Node.js HTTP runtime、Catalog list/detail boundary、PostgreSQL adapter、migration/readiness lifecycle 与 governed read service。               |
| T05.4-A/B       | 冻结 Catalog Import contract/Owner workbook，并实现 CSV/XLSX parser convergence、PostgreSQL dry-run 与 hash-bound apply。                               |
| PILOT-IMPORT-01 | 在 disposable PostgreSQL 18.4 中验证 28 条 Owner workbook 的 apply、idempotent replay 与 Public API readback；未进入 production 或 repository runtime。 |
| MEDIA-01        | 建立 Catalog Media identity、persistence、representative/gallery projection 与 backend-owned runtime URL resolution boundary。                          |
| T06             | PR #44、#45、#49 建立 Public Web HTTP boundary、request-time orchestration，并采用 T02 authority 作为 Formal Root。                                     |
| T07             | PR #50 将碑刻/书帖 Browse titles 接入 Public Catalog API。                                                                                              |
| T09             | PR #51 扩展 CatalogDetail read model；PR #55 将 runtime detail 接入现有 T02 Detail。                                                                    |
| T02P-01–11      | PR #56–#66 建立 regression harness、React data/presentation/platform/shell/navigation seams 与 Development acceptance；Production T02 bridge 仍保留。   |
| CLEAN-01        | PR #68 consolidates repository governance authority and active amendment discovery.                                                                     |
| CLEAN-03        | PR #67 removes the retired empty `@moya/data-access` workspace while preserving historical ADR/audit evidence.                                          |
