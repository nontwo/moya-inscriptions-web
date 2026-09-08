# Search V1 verification and experience handoff

This implements current Catalog search only. Evaluation PR #99 remains intact;
its recommendation was accepted and its squash base is recorded in the scope.
Search implementation requires its own PR and exact-version Owner acceptance.

## Delivered behavior

`Search UI → /api/catalog-search → /v1/catalog-search → CatalogReadService → PostgresCatalogQueryAdapter → PostgreSQL`
is the real query path. Web only validates/transports HTTP. SQL evaluates all
matching rows in six ordered tiers, then applies stable CatalogId order and
existing page pagination. Search result cards reuse Detail/Viewer and preserve
the mounted search state on return.

Only the scope's supplied public fields enter the derived projection. OpenCC
1.4.1 t2s normalizes the copy and query; originals, aliases, identities and
media are unchanged. The single added GIN index serves literal substring
predicates. There is no similarity scan, independent engine, queue or production
QA fixture.

The new migration creates derived storage, index and source-change invalidation.
Import refresh shares the existing transaction. Invalidation keeps a cleared
placeholder; refresh locks that same row before reading source fields. Missing
or invalid copies return 503 rather than stale or fabricated empty results. The
explicit rebuild uses one transaction and does not re-import Catalog. Runtime
search has no write permission requirement. See the PostgreSQL package README
for existing role separation and the new table's minimum privileges.

## Evidence and limits

- Frozen Golden labels: 50 primary and 32 supplemental; none removed or
  relabeled. Both the normalization oracle and real HTTP/PostgreSQL regression
  retain all 82. Of these, 79 are supported and 3 intentionally remain
  unsupported.
- Official open excerpts: 10 records, 22 supported labels; 21 positive queries
  have correct Top-1 and a correct result within Top-5, and one negative stays
  empty. Two original variant/typo labels remain known misses.
- Designed fiction: 38 visible records, 57 supported labels; 47 positive queries
  have correct Top-1/Top-5 and ten negative cases stay empty. One original short
  typo label remains a known miss. Official and fictional corpora run
  separately.
- The real HTTP/SQL Golden fixture directly provides frozen search projections.
  It does not invent contributor roles absent from official museum data. Source
  extraction, VALUE filtering, write/rebuild consistency, current-role
  visibility and concurrent updates are covered by separate actual PG tests.
- Three authorized external input copies were readable. In a separate isolated
  schema, real extraction/rebuild and HTTP queries passed 12 private probes:
  title, approved alias, person plus work and supplied body fragment for each.
  Top-1/Top-5 were correct for all 12; three Detail requests returned 200.
  Isolated source rows serialized identically before and after rebuild. No media
  retrieval, phone acceptance or live accepted-database test is implied. Private
  text, query strings, identifiers and paths are not evidence artifacts.
- Browser evidence uses explicitly synthetic HTTP responses with the existing
  Detail/Viewer fixture. It covers submission, IME, loading, error/retry, empty,
  clear/races, paging and return state. It is separate from actual PG evidence.

## Linux dependency check

Actual isolated environment: Linux arm64, Node 24.19.0, PostgreSQL 18.4, Debian
12 Node image (glibc 2.36), two CPUs and 2 GiB for the API container. This is
local container evidence; no claim is made that the accepted CVM or its current
operating system was inspected or changed. CI's Linux environment and any later
approved test host must be reported separately.

A clean OpenCC 1.4.1 package installation succeeded but its prebuilt arm64 addon
failed to load: the image's libstdc++ lacks `GLIBCXX_3.4.32`. Compiling the same
locked package from source with the isolated image's C++/make/Python toolchain
succeeded. Neither package version nor dictionary/config was replaced. The four
evaluated dictionaries and t2s config matched the prior evaluation SHA-256
values.

The explicit commands are:

```sh
pnpm --filter @moya/search native:check
# Only when preparing an authorized matching Linux build environment that
# already has its C++ compiler, make and Python toolchain:
pnpm --filter @moya/search native:rebuild
pnpm --filter @moya/search native:check
```

The helper builds only the locked OpenCC 1.4.1 dependency and checks fixed
public conversion probes. It does not install OS packages or print compiler
output or paths. An installation success alone is not runtime verification. Do
not upgrade an accepted host's OS or runtime merely to accommodate a prebuilt
addon.

Warm sequential HTTP responses over the ten-record official fixture (30 samples
per query, no concurrency/load target):

| Query class           | Median ms | Observed min–max ms |
| --------------------- | --------: | ------------------: |
| Two-Han short term    |     2.787 |         2.335–3.272 |
| Broad single Han      |     2.856 |         2.416–3.774 |
| Supplied body excerpt |     2.648 |         0.892–3.041 |

These include local HTTP, schema decoding and PostgreSQL queries, not remote
network/media latency. Node's maximum RSS for the whole probe was 122176 KiB;
the three-record derived rebuild took 5.087 ms. They are observations of this
small isolated fixture, not capacity or future service-level guarantees.

Local final checks: lint and typecheck, all ordinary tests (Web 779; test
package 730), all builds and actual PostgreSQL integration (138 passed, 8
explicitly skipped). The PG skips are seven pre-existing Pilot administration
opt-in cases and one external Research-input test, not Search failures.
Search-focused browser checks passed in Chromium and mobile WebKit; CI and final
exact-head review are recorded in the implementation PR.

## Retained first failures

The first broad run exposed stale interface/architecture expectations, a type
callback mismatch, control-character linting and a stale generated OpenAPI file;
these were corrected without lowering checks. PG's initial collection attempt
lacked a built backend-production prerequisite; a subsequent legacy assertion
still expected six migrations. Neither attempt is counted as a pass.

Independent review found a real alias-delete concurrency failure: a waiting
DELETE could miss a newly published projection. Its fixed two-transaction
regression now passes; a second regression covers refresh without a source
write. The initially tried alias-update schedule did not reproduce the bug and
is not presented as a failure. Review also caught C1 controls; HTTP validation
now rejects them as well as disallowed C0 and DEL.

Mobile WebKit's first search E2E run was blocked by Next's development badge.
Only the disposable E2E copy disables that badge; normal clicks, error overlays,
assertions and timeout limits remain. Chromium and mobile WebKit then passed.

## Publication preflight status

The first Search publication attempt was blocked by confirmed code/metadata
false positives in the then-installed pre-commit guard: repository relative
imports containing a home directory segment, TypeScript type/value expressions
for authorization, and public `tough-cookie` dependency semver edges in the pnpm
lockfile. Normal application types and imports remain intact.

Unused contact information in optional dependency deprecation metadata was
removed; versions, resolutions and integrity values are unchanged and frozen
installation passes. Synthetic URL parser bases use a reserved invalid domain;
negative fixtures use explicit placeholders and omit unnecessary credentials. No
scanner, hook, allowlist or confidentiality policy was weakened or bypassed.

Scanner governance is delivered separately from Search. Search commits, outgoing
history and exact external payloads must pass the currently effective installed
preflight after that independent governance update. The implementation PR
records the effective version and final publication checks; the initial blocked
attempt is retained here rather than counted as a pass.

## Protected entry preparation

The existing Nginx URI map now includes only the exact same-origin Search path.
Existing authentication, methods, private caching and excluded route behavior
are preserved. The controlled ingress verifier derives one query from an already
returned Catalog title in memory, checks exact first-result identity, GET/HEAD
and missing-query behavior, and emits status/counts only. Five purely synthetic
callback tests pass without network access. No live Nginx, accepted host or
deployment action was performed for this preparation.

## Owner experience gate

After machine checks and independent review, prepare only an explicitly approved
exact-version protected test entry. Do not reuse prior Pilot deployment
authority to mutate a host, grant access or extend a test-entry deadline. Keep
entry details in the existing restricted handoff location, never this document.

Acceptance sequence: submit a known title and simplified/traditional form; try
person plus work and a body fragment; open a result, then Viewer; return and
confirm query/results/scroll; clear; try a genuine no-result query. Check error
and retry only in an authorized isolated failure scenario.
Unsupported 姪/侄relations and short typos remain unsupported unless already
covered by fixed t2s or an existing approved alias. No new aliases or source
edits are a workaround.

Implementation Ready/merge waits for Owner acceptance of that exact head. Merge
must use expected-head squash and verify the merged tree and merged-head CI. No
public release or whole-Phase-2 completion is implied.
