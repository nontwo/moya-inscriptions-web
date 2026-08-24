# 当前项目状态

> 最后更新：2026-08-24（Asia/Shanghai）。本文件是项目进度、活动任务与 production
> gaps 的唯一动态来源。

## 当前基线与任务

- CLEAN-02 开始时最新 `origin/integration/mvp`：
  `bcf079ed9a33225ad7c9bd583202a2bb99bce4ff`。
- 该基线已包含 T02P-11 / PR #66、CLEAN-01 / PR #68 与 CLEAN-03 / PR #67。
- 本次 CLEAN-02 以该 baseline 校正当前事实、配置、品牌与部署候选材料；合并后不再作为后续 roadmap 项重复保留。
- 当前另一个已批准活动任务是 T02P-12 / PR #69；它仍是独立 Draft
  PR，不属于上述 integration baseline，也不在 CLEAN-02 范围内。
- `main` 仍是稳定 milestone branch；尚未批准从 `integration/mvp` promotion。

## 已实现能力

| 范围             | 当前事实                                                                                                                                                                                                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T06              | Public Web server-side HTTP boundary、request-time Home orchestration 与当前 T02 Formal Root composition 已合并。Formal Home 不再是旧的最小 semantic screen。                                                                                                                      |
| T07              | Browse 已通过同一 Public Catalog API 分别加载 `inscription` 与 `calligraphy`，并组合进当前 T02 Browse。                                                                                                                                                                            |
| T09              | T09.1 CatalogDetail read projection 与 T09.2 runtime Detail wiring 已合并；CatalogId 通过 same-origin bridge 进入当前 T02 Detail。                                                                                                                                                 |
| T02P             | T02P-01 至 T02P-11 已合并：browser harness、typed data seam、device platform、PrimaryShell、navigation/pager、Development acceptance、mounted destination isolation、runtime platform observation 与 React Home/Browse acceptance。Production Formal Root 尚未执行 React cutover。 |
| PR #66           | T02P-11 已把 React Home/Browse visual acceptance 合入 `integration/mvp`，但没有替换 Production T02 Formal Root bridge。                                                                                                                                                            |
| Public API       | `GET /health`、`GET /v1/catalog` 与 `GET /v1/catalog/{catalogId}`；strict query、分页、`kind=inscription\|calligraphy`、Catalog summary/detail 与 resolved `PublicMedia.src`。                                                                                                     |
| PostgreSQL       | PostgreSQL 18.4 tested read schema、append-only migrations、Catalog/Media adapter、required-ledger validation、DB-aware readiness 与 production composition。                                                                                                                      |
| Catalog Importer | strict CSV 与 bounded XLSX parser、CSV/XLSX canonical convergence、diagnostics、PostgreSQL dry-run、hash-bound authorization 与 transactional/idempotent apply。                                                                                                                   |
| Media            | `MediaId`、strict `PublicMedia`、representative/gallery projection、backend-owned `StorageUrlResolver`；Development 有 explicit mappings，Production provider 仍 unconfigured/fail closed。                                                                                        |
| Admin            | 独立最小 Next.js skeleton；没有 Admin product workflow、authentication 或 database wiring。                                                                                                                                                                                        |

更早的 milestone 记录移至 [历史里程碑](history/milestones.md)。

## 当前 Formal Web 架构

`apps/web/app/route.ts` 是 Formal Root composition root。`GET /` 在 request
time 并行读取全部 Catalog、`inscription` 与 `calligraphy` 三份 validated
state，再调用 `readT02Document(..., "formal-root")`，将 runtime
cards 组合进当前 T02 authority document。

Development Formal Root 保留语义明确的 QA/Prototype coverage；Production
composition 会移除 Prototype records 与 fixture scripts，只追加 Public API
runtime records。`/docs/prototypes/mobile-preview/` 是直接 Prototype
route，不调用该 Formal Root data composition。`/dev/t02p`
只在 Development 提供 React acceptance surface，Production 返回 404。

因此当前状态是：T02 仍是正式 UI/interaction authority；React T02P
migration 已建立 Production-capable components 与 acceptance
evidence，但尚未获得另一个任务授权来删除 static bridge、删除 direct Prototype
routes 或执行 Production cutover。

## Development 与 Production

| 场景                  | Development                                             | Production                                             |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Formal Web            | runtime Public Catalog + 明确 QA/Prototype coverage     | 只显示真实 runtime records；排除 Prototype/QA fixtures |
| T02P acceptance       | `/dev/t02p` 默认提供完整 machine/visual scenarios       | 404，不暴露 QA surface                                 |
| Catalog data          | 可使用 deterministic backend fixtures 与独立 QA records | canonical PostgreSQL → Public API → Web presentation   |
| Media                 | explicit mapped runtime URLs 与 QA assets               | provider 未配置时 fail closed；不伪造 URL              |
| Placeholder semantics | QA records 可保留明确测试内容                           | 不输出 `内容待接入`、`资料待接入` 或 QA virtual media  |

冻结原则仍是：正式态忠于真实数据；开发态忠于完整设计。真实 runtime
record 不得获得不相关的 Prototype/QA identity、事实或媒体。

## 当前数据状态

Repository 包含一个 checked-in、非权威、Prototype-only 的 P5
snapshot，共 28 条已批准记录。它仅供 direct Prototype 的内容密度与压力测试：

- 不是 canonical production Catalog dataset；
- 不会自动进入 PostgreSQL；
- 不是 Production runtime source；
- 不得被 Web runtime、backend runtime、Public API 或 importer 自动消费；
- snapshot 的无媒体事实保持
  `media: []`，Prototype 展示使用的 QA 图片不会回写数据。

Canonical production data 仍只能经 approved importer → PostgreSQL → Public API →
Web presentation。PILOT-IMPORT-01 曾在 disposable PostgreSQL
18.4 环境验证 28 条 Owner
workbook 的 dry-run/apply/replay/readback；该数据库已销毁，不构成 production
dataset。Repository 不包含正式 production Catalog 数据集、真实 Media
assets 或 production credentials。

## Production gaps

当前不能视为可上线产品，仍缺少：

- 明确批准的 production cloud/provider、域名、凭据、预算与部署资源；
- 正式 production Catalog import 与 publication workflow；
- production object storage/CDN configuration、真实 Media
  ingestion、derivatives 与 management；
- Admin product capability、authentication、authorization 与 audit UI；
- 业务搜索、社区、地图、互动、用户上传等尚未批准的独立 domains；
- 完整 production observability、backup/restore exercise 与 release operations。

Provider-neutral PostgreSQL readiness、migration/startup separation、deployment
safety checklist 与 rollback principles 保留为 active
documentation；历史 CloudBase T03 candidate 已归档，不是 provider
decision，也不能据此创建资源。

## 本地命令与端口

端口所有权：Public Web `3000`、Backend Runtime/API `3001`、Admin `3002`。

```sh
pnpm dev         # Web only
pnpm dev:web     # Web only
pnpm dev:admin   # Admin only
pnpm dev:all     # Web + Admin
```

Backend 必须单独显式启动；任何 root `dev` script 都不会隐藏启动 API。

## 分支模型

- 长期 shared branches：`main` 与 `integration/mvp`。
- 短期任务从最新 fetched `origin/integration/mvp` 建 branch/worktree，经 Draft
  PR、CI、independent actual-diff review、Ready、expected-head squash
  merge 与 merged-head verification 后删除。
- 禁止 shared-branch direct push、force-push 与 history rewrite。
- `integration/mvp` → `main` 仍需要明确 milestone decision。
- GitHub plan 不能完全技术强制所有治理要求；repository Constitution、active
  Owner amendments 与 review evidence 是操作权威。

## 下一批准方向

完成 CLEAN-02 后，继续在独立范围内推进已批准的 T02P work；任何 React Production
cutover、production provider
selection、正式数据导入或新 domain 仍需各自冻结的 Scope 与 Behavior Matrix。
