# 当前项目状态

> 最后更新：2026-08-17（Asia/Shanghai）。本文件是项目进度的唯一动态来源。

## 阶段结论

工程、设计与部署方案基线已经建立，Catalog read runtime与安全CSV/XLSX
import/apply
infrastructure已经完成。PILOT-IMPORT-01已在独立disposable验证环境中完成28条真实审核Catalog记录的端到端验证（apply、replay与Public
API readback）。MEDIA-01也已完成并合并，建立Catalog Media identity、PostgreSQL
persistence、representative/gallery read projection、backend-owned
StorageUrlResolver与strict PublicMedia boundary，并通过merged-head
CI与PostgreSQL 18.4验证。当前尚未执行正式/production
Catalog数据导入，也尚未接入production storage provider/CDN或真实Media
ingestion；应用仓库本身仍不包含任何真实数据集，正式Web/Admin产品能力也尚未完成。旧T01把特定来源数据与公共契约混合，现已撤回并移出应用仓库；新的 T01 已从来源无关的平台档案模型重新建立。

`integration/mvp`
当前任务分支在T00、重建后的T01、T02、T03、T04.0-R后端边界和独立响应式产品原型之上完成T04.1
Catalog Contract Phase 1及T04.2 canonical
migration；`main`继续保留稳定的T00/治理基线。

| 任务            | 状态                          | 当前成果                                                                                                                                                                  |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T00             | 已完成                        | pnpm/Turborepo Monorepo、Web/Admin/API 骨架、CI、协作治理                                                                                                                 |
| T01             | 已重建                        | 来源无关的公开档案 DTO 与 runtime schema                                                                                                                                  |
| T02             | 已完成                        | Design tokens、公共 UI、正式视觉资产、组件目录与单元测试                                                                                                                  |
| T03             | 已完成                        | CloudBase 中国大陆候选架构、无密钥示例和人工检查/回滚文档                                                                                                                 |
| T04.0-R         | 已完成                        | 兼容 ArchiveCatalogReader、三路由 OpenAPI、架构守卫                                                                                                                       |
| T04.1-D         | Phase 1 已实现                | Catalog contracts、Query Port、read projections、mapper与guards                                                                                                           |
| T04.2           | 已实现                        | Catalog-only contracts、Query Port和canonical OpenAPI routes                                                                                                              |
| T04.3           | 已完成并合并                  | 两值一级CatalogKind与append-only PostgreSQL contract migration                                                                                                            |
| T05.0           | 已实现                        | 最小HTTP runtime、`GET /health`、配置验证与graceful shutdown                                                                                                              |
| T05.1           | 已实现                        | Catalog list/detail HTTP boundary与development/test fixture                                                                                                               |
| T05.2           | 已实现                        | PostgreSQL read schema、adapter、显式迁移与production composition                                                                                                         |
| T05.3           | 已完成并合并                  | 长期数据治理、strict query、Kind filter与CatalogReadService                                                                                                               |
| T05.4-A         | 已完成并合并                  | versioned Import Contract、Owner Workbook/CSV spec与安全空白template（Owner已批准）                                                                                       |
| T05.4-A.2       | 已完成并合并                  | current persistence policy、Owner guidance与workbook reconciliation                                                                                                       |
| T05.4-B         | 已完成并合并（CLOSED / PASS） | 安全 CSV/XLSX import infrastructure 已完成：bounded XLSX parser、CSV/XLSX convergence、diagnostics与raw-source guard                                                      |
| PILOT-IMPORT-01 | 已完成（CLOSED / PASS）       | 28条真实审核 Catalog 记录在独立 disposable PostgreSQL 18.4 验证环境完成 transactional apply、idempotent replay与Public API readback；验证库已销毁，应用仓库未导入正式数据 |
| 响应式产品原型  | 非生产参考（持续演进）        | 同一 URL 验证手机、平板和 PC 壳层；不连接 Reader、数据库、搜索或生产图片                                                                                                  |
| T06-A           | 已实现                        | Web server-only Public HTTP boundary、Catalog list runtime validation与纯Home Catalog状态映射；尚未接入正式页面                                                           |
| T06-B–T09       | 未开始                        | 正式 Web composition、浏览、搜索和详情                                                                                                                                    |

MEDIA-01已完成并合并（CLOSED / PASS）：Catalog Media
foundation现已包含`MediaId`/strict `PublicMedia`、`catalog_media`、explicit
representative semantics、ordered gallery、batched
`StorageUrlResolver`与安全503边界；merged-head CI与PostgreSQL
18.4均通过。Production storage/CDN、真实Media ingestion、derivatives和Media
management仍属于后续独立任务。

## 当前能做什么

- 安装、lint、类型检查、测试和构建完整 Monorepo。
- 使用 `@moya/design-tokens` 与 `@moya/ui` 开发后续正式界面。
- 在本地静态服务器查看组件目录和响应式产品原型。
- 依据 T03 文档评估 CloudBase 方案，但不能据此直接创建或发布生产资源。
- 使用canonical `CatalogId`、两值 `CatalogKind`和suffix-free Catalog Public
  Contracts，并在backend使用 `CatalogQueryPort`、internal projections、transport
  parser、`CatalogReadService`与显式mapper。
- 使用独立`MediaId`和strict `PublicMedia { id, kind, src, alt, width, height }`
  表达Catalog公开图片；PostgreSQL `catalog_media`保存backend-only
  `object_key`、排序和代表图语义，Catalog list只读取representative
  Media，detail读取ordered gallery。
- 由backend-owned `StorageUrlResolver`批量把private object key解析为HTTP(S)
  runtime URL；frontend不接触object
  key、bucket、provider、credentials或resolver配置。当前production
  resolver为显式unconfigured/fail-closed状态，Media-less Catalog仍正常读取。
- 通过`apps/web/lib/public-api/`的server-side HTTP
  boundary读取`GET /v1/catalog`，验证Public query和Catalog page runtime
  contract，并把transport success按 `page.total`纯映射为Home
  populated/empty语义；该boundary尚未接入正式首页。
- 确定性生成/验证由`/health`与Catalog list/detail组成的三路由OpenAPI 3.1.1
  artifact；全部route拒绝未声明、重复或非法query。
- 启动`@moya/backend-runtime`的真实Node.js listener，并通过health与Catalog
  list/detail验证Server、Router、Handler、CatalogReadService、Query Port和JSON
  response链路；list支持optional `kind=inscription|calligraphy`。
- 显式执行Catalog read model
  migration，并通过`@moya/catalog-postgres`查询空库或后续受控写入的数据；production
  composition在listener前只读验证PostgreSQL 18 major与required migration
  ledger。
- 使用`@moya/catalog-importer`解析strict `catalog-import/v1` CSV
  bundle或`catalog-import-xlsx/v1` workbook，执行PostgreSQL-backed
  dry-run，并在独立hash-bound authorization下transactionally
  apply；facts/states、description、alias/aliasType、SourceId/provenance和operation
  audit均可持久化。
- PILOT-IMPORT-01已验证 Owner XLSX（28条真实审核记录）→ canonical import →
  PostgreSQL-backed dry-run → hash-bound Owner approval → transactional apply →
  Public API readback的完整链路；apply与replay均在独立disposable PostgreSQL
  18.4验证环境完成并已在证据收集后销毁，未写入production或本仓库数据。

当前不能把项目视为可上线产品：正式 Web/Admin 仍是骨架，Catalog
HTTP在development/test缺省使用三个条目的fixture；PILOT-IMPORT-01已完成28条真实记录的验证性导入，但正式/production
Catalog数据导入、Importer Admin UI、production storage provider/CDN、真实Media
ingestion与upload/management
workflow、搜索实现、登录、地图、互动、上传、生产环境和正式部署都尚未完成；应用仓库本身仍不包含任何真实Catalog数据集或真实Media资产。

T05.4-A/A.1历史checkpoint冻结了`catalog-import/v1` internal canonical
rows、null/identity/approval安全规则、workbook/CSV contract与Import Batch
model。后续批准的persistence pipeline已实现CSV
parser、dry-run/apply与migration。当前supplied
`ownerNote`仍以`DEFERRED_FIELD_NOT_PRESERVED` fail closed；alias collection
UPDATE在replace/merge/delete semantics未定义时同样fail
closed。二者都不得发生silent loss。

## 数据状态

应用仓库当前不保存真实档案数据集、地区候选或审核证据。旧 T01/D01 资产已经过 SHA-256 验证并迁移到 owner 持有的本地 AES-256 加密归档，不得作为前端资产或运行时数据重新引入。PILOT-IMPORT-01使用的28条真实审核记录（workbook与验证证据）同样只保存在 owner 持有的本地目录，未进入应用仓库；验证所用PostgreSQL环境为一次性disposable实例，验证后已销毁，不构成production数据集。MEDIA-01只使用synthetic/test
Media验证数据模型和读取链路，没有导入真实图片或配置production object storage。

## 测试与可运行入口

当前测试覆盖工程fixture、Backend HTTP runtime、Catalog contracts/application
service、Query Port、strict query、Kind filtering、OpenAPI、Catalog Media
contracts/persistence/resolver与private-storage边界、T02
token/资产/组件、响应式原型交互、Web Public Catalog
transport/Home状态映射以及Catalog import的PostgreSQL dry-run/apply/persistence
invariants。真实PostgreSQL integration以CI中的PostgreSQL 18.4 clean
service为权威验证环境；本机不要求安装PostgreSQL或Docker。

标准命令：

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:postgres
pnpm build
```

启动骨架应用：

```sh
pnpm dev
```

启动最小Backend HTTP runtime：

```sh
pnpm --filter @moya/backend-runtime build
HOST=127.0.0.1 PORT=3001 NODE_ENV=development pnpm --filter @moya/backend-runtime start
curl -i http://127.0.0.1:3001/health
curl -i 'http://127.0.0.1:3001/v1/catalog?page=1&pageSize=2'
curl -i 'http://127.0.0.1:3001/v1/catalog?kind=inscription'
curl -i 'http://127.0.0.1:3001/v1/catalog?kind=calligraphy'
curl -i http://127.0.0.1:3001/v1/catalog/fixture-catalog-001
```

PostgreSQL foundation的migration与production startup必须分步执行：

```sh
docker compose -f compose.postgres.yml up -d
pnpm --filter @moya/catalog-postgres build
DATABASE_URL='postgresql://moya_test:moya_test@127.0.0.1:54329/moya_test' \
  pnpm --filter @moya/catalog-postgres migrate
DATABASE_URL='postgresql://moya_test:moya_test@127.0.0.1:54329/moya_test' \
  pnpm test:postgres
pnpm --filter @moya/backend-production build
NODE_ENV=production HOST=127.0.0.1 PORT=3001 \
  DATABASE_URL='postgresql://moya_test:moya_test@127.0.0.1:54329/moya_test' \
  pnpm --filter @moya/backend-production start
```

Compose与CI均固定测试官方`postgres:18.4-alpine`。`/health`在production代表DB-aware
readiness，不是未经决策即可复用的process liveness probe。

启动静态预览：

```sh
python3 -m http.server 4175 --bind 0.0.0.0
```

- 组件目录：`http://localhost:4175/docs/design-system/catalog/`
- 响应式产品原型：`http://localhost:4175/docs/prototypes/mobile-preview/`

响应式产品原型只用于直观检查导航与交互，不是 `apps/web` 的正式实现。

## 分支与 GitHub 限制

- 长期活动分支只保留 `main` 和 `integration/mvp`。
- `mvp-foundation-v1` 保留 T00 基准。
- `archive/integration-mvp-v2-20260807`
  保留已废弃 v2 的完整历史；该历史不整体回灌。
- 功能开发从最新 `integration/mvp` 创建短期分支，通过 PR、四项 CI 和 `@nontwo`
  审核后 squash 合并。
- 仓库为 GitHub Private；当前套餐不支持技术强制 Branch
  Protection/Ruleset。因此禁止直推、批准失效、Code Owner
  Review 和对话解决只能由协作约定执行，不能宣称为平台强制。

## 下一步

1. Importer/XLSX-CSV
   infrastructure已通过T05.4-B与PILOT-IMPORT-01验证；除非未来真实数据暴露genuine
   blocker，否则不再扩展Importer实现。
2. MEDIA-01 Catalog Media foundation已完成并通过merged-head验证；production
   storage provider/CDN、真实Media ingestion、derivatives和Media
   management均作为后续独立任务，不在MEDIA-01继续扩展。
3. 后续单独决定Importer Admin、正式/production
   Catalog数据导入（含1658条正式数据）与publication workflow。
4. T06-A已建立Web-to-Public-HTTP data boundary；后续从fresh
   `integration/mvp`独立实现正式Web
   composition，再依次推进浏览、搜索和档案详情。

只有 T04–T09 完成并通过集成回归后，才评估把 `integration/mvp` 合并到 `main`。
