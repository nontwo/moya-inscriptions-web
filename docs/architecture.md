# Architecture

## System shape

由艺（Yoyi）使用 pnpm
workspace 与 Turborepo 管理模块化单体 repository。当前公开 Catalog 范围严格为
`inscription | calligraphy`。

```text
Browser
  → Next.js Public Web / React Formal Root
  → same-origin Web API boundary
  → Public HTTP API
  → backend Catalog application
  → CatalogQueryPort
  → PostgreSQL adapter

PostgreSQL media object keys
  → backend StorageUrlResolver
  → resolved PublicMedia.src
  → Public HTTP API
  → React presentation
```

Frontend 不直接读取 PostgreSQL、Query Port、backend implementation、raw
datasets、object key、bucket、provider configuration 或 credentials。

## Workspace responsibilities

- `apps/web`：Public Web composition、React Product
  Shell、interaction、server-side Public HTTP client 与 same-origin API routes。
- `apps/admin`：已实现 Payload Catalog
  Admin、原生草稿/版本、Owner 发布与受限 automation。
- `services/backend-runtime`：Node.js listener、runtime
  config、router、handlers、JSON response、readiness injection 与 graceful
  shutdown。
- `services/backend-production`：PostgreSQL adapter、HTTP runtime 与 production
  composition root；启动时只读验证所选内容源的 readiness。
- `services/api`：backend-only Catalog application boundary，拥有 normalized
  query、internal projections、`CatalogQueryPort`、`StorageUrlResolver`、read
  service 与 explicit Public mapper。
- `services/catalog-postgres`：private PostgreSQL adapter、queries、migration
  runner 与 required-ledger/readiness validation。
- `services/catalog-importer`：private controlled importer；执行 strict
  CSV 与 bounded XLSX parsing、canonical
  convergence、diagnostics、dry-run、hash-bound approval 和 transactional
  apply。
- `services/public-api`：Public OpenAPI contract 与 deterministic
  generator；不启动 HTTP listener。
- `packages/contracts`：Public DTO/query/error/ID/runtime
  schema 的唯一来源，并隔离 server-only Catalog Import contracts。
- `packages/image`：backend-only `StorageUrlResolver`
  implementations；不拥有 provider credential、upload 或 transport policy。
- `packages/ui`、`packages/design-tokens`：共享 semantic
  components、assets 与 tokens。
- `packages/search`：已实现 Search
  V1 中文归一化；标准 PostgreSQL 负责检索与排序。
- `database/migrations`：仅 legacy
  migrations；`apps/admin/src/migrations`：仅 Payload migrations。

The retired empty `@moya/data-access` workspace is not part of the current
architecture.

## Formal Web composition

`apps/web/app/page.tsx` is the current Formal `/` composition root:

```text
readFormalRequestContext()
+
loadProductionProductStates()
  ├── Home Discover
  ├── Nearby unavailable
  ├── Topics unavailable
  ├── inscription page 1
  └── calligraphy page 1
        ↓
T02pProductPreview
        ↓
ProductShell
```

The page is request-rendered and uses Production-only sources. Initial Catalog
pages are loaded server-side. Later Inscriptions and Calligraphy `全部` pages
use the same-origin `GET /api/catalog` boundary and explicit progressive
loading.

The current React Product Shell owns:

- Home, Inscriptions, and Calligraphy primary destinations;
- Settings and preferences;
- platform/orientation presentation state;
- canonical Product history;
- per-destination and Detail scroll restoration;
- opener focus restoration;
- mutually exclusive Topic, Detail, Viewer, and Settings layers.

Catalog cards open one shared Detail implementation. Detail uses the same-origin
Catalog Detail boundary. The bounded Carousel and full-screen Viewer own media
paging, fit, zoom, pan, pinch, URL state, and restoration behavior.

`GET /catalog/{catalogId}` remains a 307 compatibility redirect into the
canonical Formal root query/history journey.

## Development, QA, Prototype, and legacy static code

Development may combine truthful runtime records with explicit synthetic QA
records. Their identities and media origins remain distinct. QA values never
enter PostgreSQL, Public API, Contracts, importer, workbook, or Production
runtime data.

- `/dev/t02p` and `/dev/t02p/qa` are Development-only React acceptance surfaces;
  Production returns 404.
- `/docs/prototypes/mobile-preview/` is a direct non-production static
  Prototype.
- `apps/web/lib/t02-static-files.ts` remains a Prototype-serving utility with a
  retained legacy `formal-root` regression seam.

The legacy static seam is not called by `apps/web/app/page.tsx` and is not the
current Formal Web architecture. Its presence preserves historical/Prototype
evidence only. Broad Prototype or bridge cleanup remains separately scoped and
must not be mixed into ordinary Product work.

## Public HTTP and application boundary

Current backend Public endpoints are:

- `GET /health`;
- `GET /v1/catalog`;
- `GET /v1/catalog/{catalogId}`；
- `GET /v1/catalog-search`。

Web exposes bounded same-origin list and Detail routes under `/api/catalog`, and
Search V1 under `/api/catalog-search`. Transport input is parsed strictly.
Catalog list supports page-based pagination and optional
`kind=inscription|calligraphy`.

```text
Public transport input
  → transport parser
  → normalized application query
  → CatalogReadService
  → CatalogQueryPort
  → internal projection
  → StorageUrlResolver when media exists
  → explicit Public mapper
  → strict Public DTO
```

Public responses do not expose SQL rows, driver errors, private source evidence,
object keys, storage configuration, or credentials.

## Catalog Content V1

Catalog Detail currently supports the original canonical fields plus optional:

- ordered contributors with `textAuthor | calligrapher` roles;
- `scriptStyle`;
- `transcription`;
- `historicalContext`;
- `scholarlyResearch`;
- citation `appliesTo` scopes.

The source-of-truth chain remains:

```text
Zod
  → inferred TypeScript
  → Draft 2020-12 JSON Schema
  → OpenAPI 3.1.1
```

PostgreSQL persistence, read projection, explicit Public mapping, API
population, and `catalog-import/v2` are implemented. The current React Detail
has not yet completed the bounded T09-F1 presentation of every Content V1 field.

## Media boundary

PostgreSQL stores logical object keys. Backend `StorageUrlResolver`
implementations convert them to public or signed runtime URLs. Public API
outputs only `PublicMedia.src`; Web and `@moya/ui` consume that resolved value.

Local development uses gitignored Payload media and requires no COS credentials.
The implemented standalone `ProductionCosStorageUrlResolver` uses the official
COS SDK, with private objects, short read URL lifetimes, verified TLS and
bounded errors. It has no Pilot manifest, object-count cap or upload operation.
Pilot upload and manifest enforcement remain in the Pilot module. Production
requires explicit provider configuration. Composition wiring remains pending the
Owner media-delivery decision recorded in the Draft PR; it is not yet
production-ready.

## PostgreSQL, migrations, and importer

Payload with PostgreSQL published views is implemented; Search V1 consumes the
published read model. Legacy remains an explicit compatibility source until the
separately authorized operational cutover. TencentDB is a standard PostgreSQL
target; business code has no Tencent database SDK dependency. Production startup
and schema migration are separate:

```text
explicit migration command
  → verify required migration ledger
  → production startup
  → listener
```

Startup does not execute DDL. Current Compose and CI compatibility baseline is
PostgreSQL 18.4.

The controlled write path is:

```text
Owner XLSX or strict CSV
  → versioned parse
  → canonical envelope and hash
  → validation and duplicate/diff dry-run
  → hash-bound approval
  → one PostgreSQL transaction
  → operation audit
```

`catalog-import/v1` remains compatible. `catalog-import/v2` adds Content V1
fields, ordered contributors, curated citations, citation scopes, and explicit
`PRESERVE | REPLACE | CLEAR` collection semantics. Import is not publication.

## Production status and deployment authority

The repository contains no persistent Production Catalog dataset, Production
credential, or configured Production media provider. The 28-record P5 flow was
validated against disposable infrastructure and remains non-production evidence.

The Owner currently tests in an Owner-owned Tencent account. Future CVM,
TencentDB PostgreSQL and private COS resources will belong to the domestic
partner's verified main account; those resources have not been created.
[Production topology](../infra/production/README.md) defines three separate
loopback processes behind Nginx and distinct service users. Historical CloudBase
material under `docs/archive/deployment/` remains non-authoritative.

Production provider choice, purchases, domains, credentials, secrets, release
operations, data import approval, backup/restore, and deployment require
separate Owner authority.

## Database roles and future Phase 3 boundary

`CMS_DATABASE_URL` is Payload runtime; `DATABASE_URL` is the Public Backend
published-read runtime; `TEST_DATABASE_URL` is dedicated disposable testing.
Future `APP_DATABASE_URL` is reserved for Backend public identity/community and
is not consumed or implemented in this change. CMS, Public and future App roles
may use the same TencentDB instance and database, but must be different database
users with separate permissions. Tests and local development remain isolated
from staging and production. Public Backend grants read access only to published
views; deployment migration privileges are separate from runtime privileges.

Public pool defaults to 5, with explicit idle timeout. Payload retains max 5.
Optional CA files configure verified TLS; `rejectUnauthorized=false` is
forbidden. Migrations route by `MOYA_CONTENT_SOURCE`: `legacy` selects only
legacy SQL; `payload` selects only Payload migrations. Startup never performs
DDL.

Payload users serve Owner/automation only. Public users, sessions, profiles,
posts, comments, likes, favorites and UGC are not part of this work. Future
public identity/community belongs to Backend, with its own App database runtime
role and a separate UGC storage boundary. QA filter fixtures remain QA-only;
hard-coded dynasties, script styles, kinds or regions do not become production
taxonomies or contracts. No production filtering is added.

## Stable guardrails

- Public and cross-workspace contracts are defined only in `packages/contracts`.
- Frontend does not import backend runtime/application or query PostgreSQL.
- Frontend never receives object keys or provider credentials.
- Database schema changes use append-only migrations.
- Dependency upgrades require explicit scope.
- Prototype/QA presence does not authorize Production consumption.
- Current React Product behavior is not duplicated or replaced by ordinary data
  or backend work.
- Formal Production states omit absent optional content and never invent facts.
- Every new task starts from a freshly resolved latest `origin/main`.

Accepted and superseded decisions are indexed in [`adr/`](adr/README.md).
Dynamic milestone and next-task truth exists only in
[`project-status.md`](project-status.md).
