# P2-03 Catalog Search V1

Owner accepted evaluation PR #99 and authorized this implementation. Base:
`bbfe93be2b19121f4c51ccd59d90e89fddff4862`. Branch: `feat/p2-03-search-v1`.
Delivery: a new Draft PR targeting main, independent actual-diff review and
machine checks, then one exact-version Owner search experience acceptance.
Ready, expected-head squash merge and merged-head verification follow that
acceptance. No public release or unapproved cloud mutation is authorized.

## Scope and plan

1. Add the public search request/response schemas and OpenAPI. Implement backend
   validation, normalization, strict retrieval and existing page pagination.
2. Add a rebuildable search projection, one necessary trigram index and explicit
   rebuild command. Refresh within existing content import transactions;
   invalidate on source changes. Runtime querying remains read-only.
3. Reuse accepted Search presentation, IME/focus and ProductShell navigation.
   Wire real HTTP, loading, results, empty/error/retry, paging and return state.
4. Validate the fixed OpenCC dependency on Linux, query regressions, isolated
   PostgreSQL/API, write consistency and Production QA exclusion. Preserve the
   evaluation's difficult cases and distinguish unsupported behavior from bugs.
5. Prepare a safely retrievable exact-version test entry under existing
   authority; obtain Owner experience acceptance before implementation merge.

Allowed changes: `packages/contracts/**`, `packages/search/**`,
`services/api/**`, `services/catalog-postgres/**`,
`services/catalog-importer/**`, `services/backend-runtime/**`,
`services/backend-production/**`, `services/public-api/**`,
`database/migrations/**`, relevant `apps/web/**` Search presentation/HTTP/QA
isolation seams, related `tests/**`, dependency manifests and lockfile; the
exact Search entry files `infra/pilot/nginx/pilot.conf.template`,
`infra/pilot/nginx/verify-ingress.py` and
`infra/pilot/nginx/verify-ingress.test.py`; and minimal `docs/search/p2-03-v1-*`
documentation. Existing evaluation results, canonical inputs, media and
identities are unchanged.

## Frozen behavior

| Situation               | Development / QA                                                      | Production                                                                                          |
| ----------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Search                  | Explicit QA scenarios remain isolated; real surface uses backend HTTP | Current permitted Catalog records and real response only                                            |
| Empty composer / clear  | Clear in-memory query/results; no fabricated history                  | Same; no request until nonblank submission                                                          |
| Submission / pagination | Latest request wins; composition Enter does not submit                | Same; no local whole-Catalog filtering                                                              |
| Service error           | Visible error and retry                                               | Error, never fabricated empty results                                                               |
| Detail / Viewer / back  | Existing Shell stack, search stays mounted                            | Query, page/results, focus and scroll retained                                                      |
| Source write / rebuild  | Isolated fixtures and DB only                                         | Same transactional projection semantics; activation only in an explicitly approved test environment |

Only supplied public title/aliases; contributor names; periodLabel/dynasty/
dateText/scriptStyle/province/prefecture/county/currentLocation/currentCustodian;
and summary/description/transcription are searchable. Stateful fields require
VALUE. Kind is only the existing inscription/calligraphy optional filter. No
inferred facts or aliases, historicalContext, scholarlyResearch, internal
evidence/notes, private fields or media addresses enter the projection.

OpenCC 1.4.1 `t2s.json` and the evaluated dictionaries normalize only queries
and rebuildable copies. Original title exact > approved alias exact > normalized
exact > title/alias partial > structured > body. Whitespace-separated parts use
same-record AND. Percent, underscore and backslash are literal query text. All
result tiers are ordered in SQL before pagination, with deterministic CatalogId
tie order. No arbitrary candidate truncation or frontend reranking.

Transport: GET `/v1/catalog-search` through Web `/api/catalog-search`. A
distinct path preserves existing opaque CatalogId values, including `search`.
Required `q` is at most 200 UTF-16 code units and nonblank after trim; ordinary
whitespace separates parts, other controls are rejected. Existing page 1 /
pageSize 20 defaults and pageSize 100 maximum remain. Response uses Catalog
summary fields, existing pagination metadata and truthful matchKind, without
echoing query text.

No typo correction, pinyin, AI search, synonym/variant/place inference, history,
autocomplete, recommendation, extra domains, Meili, pg_bigm, PGroonga, zhparser,
Redis or queues. 姪/侄 and known short typos remain unsupported when the fixed
conversion and existing aliases do not cover them. No new capacity/RPS/SLA gate.

Confidentiality preflight covers actual index, every outgoing commit and exact
external payloads with the installed guard. Private inputs/queries, operational
paths/addresses and media URLs stay out of Git, evidence and diagnostics.
