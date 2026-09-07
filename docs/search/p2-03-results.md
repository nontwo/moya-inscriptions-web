# P2-03 Search evaluation — decision packet

Evaluation-only; completed measurements, not implemented Search V1. The sole
recommendation is to retain **PostgreSQL + OpenCC** for the bounded next step.
Do not introduce a separate Meilisearch service at the current scope. This is a
recommendation for Owner review, not a declaration that all search requirements
or all scale targets have passed.

## 1. Reuse and additions

Baseline `6f3f4cf81c63811b93296249175830793427d3c8` was freshly fetched before
the new `research/p2-03-search-evaluation` worktree. Changes are limited to the
experiment and these search documents. No prior Pilot branch/PR was continued or
changed. There are no modifications to main, original inputs, MediaId,
Production, Contracts, migrations, backend routes or frontend code.

Future reuse is precise: current Catalog public fields and backend PostgreSQL
adapter; existing public HTTP transport; accepted Search appearance, IME/focus
behavior and ProductShell seams. `@moya/search` is still empty. Current QA
Search has static QA scenario/isolation dependencies and cannot be imported
wholesale into Production. Current main has no `packages/data-access`; do not
recreate a retired package to satisfy an old architecture description. Preserve
the current HTTP-to-backend adapter boundary.

New artifacts are the pinned isolated harness, hand-labeled queries, attributed
open data, field projection and normalization experiment, PostgreSQL/Meili
adapters, timing/EXPLAIN evidence, targeted pg_bigm build and experiment, and
tests. They are not reusable production Search Contracts or database migrations.

Data sets:

- 10 NPM official open-data records, with 24 queries. Only supplied base fields
  and short transcription excerpts are retained, with page/date/field/license/
  attribution per record. No photos, inferred aliases, roles or original
  locations.
- 40 explicitly fictional boundary records. 26 queries join the 24 public
  queries to form the **50 primary Golden Queries**; 32 more are supplemental.
- The existing three Owner-approved external Pilot input records were read under
  a whitelist. 12 title/alias/person-work/body-fragment probes ran privately.
  Their source text, query text, operational IDs, private paths, internal notes
  and media are absent from submitted artifacts. These mechanically derived
  probes are not expert judgments about every passage or historical variant.
- Fixed-seed 1k/10k/100k fictional corpora test capacity only. Both engines
  index exactly the same visible subset; source identities are never inferred or
  merged.

See [scope](p2-03-scope.md),
[reproduction and metric definitions](../../experiments/p2-03-search/README.md),
[attributed public corpus](../../experiments/p2-03-search/public-corpus.mjs),
[complete main measurements](../../experiments/p2-03-search/results.json), and
[bigram measurements](../../experiments/p2-03-search/bigm-results.json).

## 2. One recommendation and measured evidence

**Retain PostgreSQL + OpenCC.** Use original/normalized title and approved alias
matching plus parameterized, explicitly layered contains/AND retrieval as the
next bounded implementation candidate. Built-in FTS and whole-body trigram
similarity are diagnostic baselines, not a complete Chinese solution. The
current experiment gives no relevance advantage to Meili strict over PostgreSQL
policy on the primary queries or private Pilot probes. Meili is faster at 100k,
but its native ordering does not itself implement the required global
exact-priority contract, and it adds a persistent service and synchronization
responsibility.

This recommendation has an explicit capacity limit: the untuned PostgreSQL
policy shows a long tail at 100k. No Owner-approved production scale,
concurrency or latency SLA was supplied, so **no all-scale performance
acceptance is claimed**. Do not silently promise 100k low-latency arbitrary
substring queries. The targeted pg_bigm result below is evidence for an optional
index decision, not authority to make it an unconditional future TencentDB
dependency.

Top-1 is a correct first result (or correct empty response). Top-5 is **Hit@5**,
at least one expected result among the first five, not five correct results.
Missing and unexpected hits are retained per query in JSON. Public, fictional
and private results are separate; broad synthetic success is not real
ancient-text acceptance.

| Candidate                       | Public Top-1 | Public Hit@5 | Synthetic primary Top-1 | Private probes Top-1/Hit@5 | Unexpected public hits |
| ------------------------------- | ------------ | ------------ | ----------------------- | -------------------------- | ---------------------- |
| PostgreSQL policy               | 22/24        | 22/24        | 25/26                   | 12/12                      | 0                      |
| Meili strict native             | 22/24        | 22/24        | 25/26                   | 12/12                      | 0                      |
| Meili strict small-corpus tiers | 22/24        | 22/24        | 25/26                   | 12/12                      | 0                      |
| Meili relaxed native            | 23/24        | 23/24        | 22/26                   | 12/12                      | 35                     |

PostgreSQL policy and Meili strict each achieve **47/50 primary Top-1 and
Hit@5**. On all 58 fictional cases PostgreSQL policy scores 57/58; native Meili
strict scores 54/58 Top-1 and 56/58 Hit@5. Applying the Owner tiers to the
exhaustive small Meili candidate set restores 56/58 Top-1. This is a
small-corpus semantic probe, not an approved top-N production reranking
algorithm; its timing excludes that JavaScript pass. Meili relaxed increases
recall but adds false positives. In the private probes, Meili strict has one
unexpected secondary hit despite 12/12 Top-1 and Hit@5; private text is not
published. A forbidden relevance distractor is not necessarily a visibility
leak; neither strict candidate returned a hidden document in these designed
allowed-set tests. No real ACL exists in the current query contract and none was
manufactured.

Concrete cases:

- The public standalone `书谱` query returns its expected record in both strict
  candidates. Standalone `書譜` is covered by the fictional group and also
  passes both; no unexecuted public standalone traditional query is claimed.
  Whole original titles and approved aliases have distinct priorities, and
  original `雲嶺記` versus normalized `云岭记` remains an explicit collision
  test. Native Meili ordering fails two original-title-priority supplemental
  cases; the small-corpus tier pass fixes those two cases.
- `颜真卿 祭侄文稿` misses the source title `唐顏真卿祭姪文稿　卷` in both
  strict candidates. Actual OpenCC 1.4.1 t2s produces `唐颜真卿祭姪文稿　卷`; it
  does not equate 姪 and 侄 here. No unapproved variant relation was added to
  force a pass.
- `書普` misses in both strict candidates; the fictional `泉声十二航` near query
  also remains a gap. A near result must be marked and must not become exact.
- Supplemental one-character `篆` finds the fictional structured-field substring
  in PostgreSQL but not Meili strict with prefix disabled. This exposes a
  genuine semantic difference between substring and token matching.
- Existing title, alias, person+work and body-fragment probes score 12/12
  private Top-1 and Hit@5 in both strict candidates, with the Meili extra hit
  noted above. Public multi-field queries remain subject to the concrete variant
  miss above; no absent author role, dynasty or location is filled.

Public examples come from the attributed
[NPM records](../../experiments/p2-03-search/public-corpus.mjs), including
[祭姪文稿](https://digitalarchive.npm.gov.tw/Collection/Detail/3?dep=P).

PostgreSQL component results show why equality, substring and FTS must be
considered together. These all-query scores describe coverage: an equality
operator is not expected to answer arbitrary body queries.

| PG experiment    | Primary Top-1 | Primary Hit@5 | 100k warm p95 ms |
| ---------------- | ------------- | ------------- | ---------------- |
| raw-exact        | 12/50         | 12/50         | 0.37             |
| normalized-exact | 12/50         | 12/50         | 37.24            |
| prefix           | 12/50         | 12/50         | 59.18            |
| contains         | 34/50         | 34/50         | 303.58           |
| trgm             | 12/50         | 13/50         | 5543.33          |
| fts              | 26/50         | 26/50         | 0.45             |
| policy           | 47/50         | 47/50         | 316.32           |

Actual `ts_debug('simple', ...)` keeps a continuous synthetic Chinese title as
one word; it is not mature Chinese lexical segmentation. LIKE plans for rare
strings with at least three Han characters use the trigram GIN index, while rare
two-Han contains scans show the limitation described in
[PostgreSQL's pg_trgm documentation](https://www.postgresql.org/docs/18/pgtrgm.html).

The main timing runs used Linux/arm64 Docker images, sequential 2 CPU / 2 GiB
containers, PostgreSQL 18.4 + pg_trgm 1.6, Meili CE 1.53.2, and a macOS arm64
Node 24.19.0 runner. **OpenCC native execution was tested on macOS, not target
Linux.** Its actual config, dictionaries and native binary hashes, image digests
and engine settings are in JSON. No accepted CVM or managed database was queried
or changed.

Each mode has 12 queries, one initial pass and five repeats (60 warm samples).
First-pass is not proven cold-cache. Concurrency is one; no production HTTP API,
high-concurrency or endurance benchmark was run. Node generation/normalization
cost and runner lifetime peak RSS are separate from engine cgroup limits. Host
background activity is not laboratory controlled.

| Synthetic size | Indexed visible | PG policy p50 / p95 ms | Meili strict native p50 / p95 ms | Initialize PG / Meili seconds |
| -------------- | --------------- | ---------------------- | -------------------------------- | ----------------------------- |
| 1,000          | 977             | 0.57 / 3.31            | 2.73 / 3.37                      | 0.29 / 0.98                   |
| 10,000         | 9,685           | 0.79 / 27.39           | 2.78 / 3.11                      | 2.42 / 6.10                   |
| 100,000        | 96,915          | 0.93 / 316.32          | 2.92 / 3.28                      | 21.50 / 65.64                 |

These are local adapter wall times, with different database/HTTP wire paths and
ordering work. They are not equal-contract end-to-end API times. Meili's integer
`processingTimeMs=0` means below its reporting resolution, not zero work.
Per-mode CPU excludes EXPLAIN; a PG total across seven variants is not compared
with one Meili variant. Actual plans and per-query timings remain available.

At 100k, the measured PG policy workload uses 8.06 container CPU-seconds for 72
requests; native Meili strict uses 0.047. Initialization uses 24.10 versus
104.41 CPU-seconds. Anonymous engine memory after queries is about 58.5 versus
313.5 MiB. The cumulative cgroup peaks, including file cache and earlier
experimental modes, are about 1697 versus 1496 MiB; they are not process RSS or
isolated policy peaks. PG's table plus all experimental indexes is about 510 MiB
(indexes 140 MiB). Meili allocated database size is about 959 MiB, with about
757 MiB used; its stats include documents, index and task storage, so this is
not an equal internal-index accounting basis. Meili would additionally retain
the authoritative PostgreSQL service in a real system. PG's redundant
experimental indexes are not a proposed minimal final schema.

At 100k, insert/replace/delete-to-visible are approximately 4.75/1.67/0.98 ms in
PG and 113.25/117.81/114.03 ms in Meili. All probes pass after waiting for
completion. The Meili task poll interval is 100 ms, so its figures are observed
upper bounds with polling quantization, not precise engine update minima. Ten
sequential updates take about 6.71 ms and 1.13 s respectively; no
bulk-throughput or outage recovery claim is made.

### Targeted pg_bigm result

The measured rare two-character query `行草` triggered only this conditional
extension experiment. Fixed pg_bigm v1.2-20250903 was built with **server and
SDK both 18.4**. Default rechecking stays on. Complete public 24 and fictional
58 policy result sets are unchanged (82/82 equality checks); 10k/100k sampled
top-20 sets are also unchanged. No new tokenizer or ranking semantics were
introduced.

In its same-instance 100k comparison, `行草` p95 changes from **321.12 ms to
0.62 ms** when replacing only the combined-text trigram GIN with bigram GIN. The
six-query p95 changes from 320.96 to 257.38 ms. Common `书谱` still takes about
253 ms: nearly half the synthetic corpus matches, so candidate ranking and row
reads remain expensive. Bigram indexing is not a universal remedy for broad
queries. The replacement index is about 38.1 MiB versus 48.7 MiB, and its 100k
replacement/build step takes 6.29 seconds. These are this corpus's costs only.
See [fixed build evidence](../../experiments/p2-03-search/bigm-build.md).

Three earlier attempts are explicitly failed/invalid: initial connection,
private-input shape mapping, and zero capacity samples caused by wrong query
IDs. The final main run has checked nonzero sample counts and passing update
probes. The first pg_bigm build also failed on a missing development header and
was fixed in the builder only. Prior failures are not relabeled as first-pass
successes.

## 3. Owner decisions and dependency differences

Field scope and ranking principles already approved for evaluation remain
frozen. The remaining decisions concern **formal adoption**, not permission to
repeat the same experiment:

- Accept or explicitly decline an approved 姪/侄 search relation; t2s alone does
  not supply it. Determine the required near-match behavior for short Chinese
  typos. Do not guess old-place, variant, abbreviation or alternate-object
  identities.
- Fix target corpus scale, concurrency, acceptable latency tail and ranking/page
  semantics before claiming performance acceptance. Current query-dependent
  tiers are experiment principles, not a final frozen numeric scoring formula.
- Confirm whether pg_bigm may become a formal native dependency. It is validated
  locally on PG18.4, but the official TencentDB extension matrix does not
  establish pg_bigm support for the target PG18 managed instance/region. Keep
  the current portable pg_trgm/B-tree option and do not commit to an unsupported
  hosted feature.
- Historical context and scholarly research remain excluded from the main index.
  Their presence in a stress-only fixture does not approve formal searchability
  or constitute an executed long-text capacity study.

OpenCC adds an Apache-2.0 native dependency and versioned conversion
dictionaries; no frontend dependency is needed. pg_trgm is a PostgreSQL supplied
extension. pg_bigm uses the PostgreSQL License and adds
binary/upgrade/managed-service compatibility obligations. Meili CE is MIT (not
the enterprise build) and would add a persistent service, service credentials,
asynchronous synchronization, retry/rebuild/backup and deletion-visibility
responsibilities. Its speed alone is insufficient evidence to add that service
now.

Actual current CVM architecture, PostgreSQL installation, extension privileges
and capacity were not inspected. Future TencentDB version/region support must be
verified against the selected target; a self-managed CVM can install reviewed
extensions while managed PostgreSQL accepts only provider-supported extensions.
See the sourced
[platform compatibility assessment](p2-03-platform-compatibility.md). No CVM or
TencentDB compatibility acceptance is claimed.

## 4. Minimal next implementation and acceptance plan

After Owner confirms the recommendation, freeze the production Behavior Matrix
and exact field/query/match-kind/pagination contract. Then implement only:

1. Contracts in the existing contracts package, and a backend search document
   whitelist/normalization version. Preserve original text and identities.
2. A rebuildable backend search projection and selected mature indexes through a
   separately approved migration; database access stays in the adapter.
3. Parameterized query/filter/ranking/pagination behind the existing backend
   HTTP boundary. Empty/error/truncated/cancelled results must be truthful.
   Exact tiers precede body and marked near results across the complete page
   sequence.
4. Extract the accepted Search presentation and IME/focus behavior through
   current ProductShell seams, then add real
   request/loading/error/empty/results/return states. Production must not
   acquire the QA scenario dependency tree.

Acceptance must preserve canonical input bytes and identities, prove
normalization and allowed-set boundaries, test the 50 primary labels plus all
regression cases, resolve or explicitly accept remaining quality gaps, verify
global tier ordering and stable pagination, and meet the newly frozen
performance budget. Re-run on the actual intended Linux runtime and supported
database extension set. Validate Production's QA exclusion and obtain Owner
visual/real-device acceptance at the exact implementation head. No such frontend
or target-runtime acceptance occurred in this evaluation.

This evaluation is delivered through a new Draft PR with relevant checks and
independent actual-diff review. The directional Owner decision remains open.
**STOP after delivering these results; do not start formal Search V1 or
deploy.**
