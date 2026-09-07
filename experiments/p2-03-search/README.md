# P2-03 evaluation only

This directory is an isolated experiment, not a workspace dependency or Search
V1. No runtime Catalog tables, Public Contract, migration, API, UI, or service
are changed. Read the frozen [scope](../../docs/search/p2-03-scope.md) first.

## Reproduce

Use Node 24, Docker, and the exact dependency lockfile:

```sh
cd experiments/p2-03-search
pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts
node --test evaluation.test.mjs
docker pull postgres:18.4
docker pull getmeili/meilisearch:v1.53.2
node benchmark.mjs
```

The runner creates sequential, disposable, loopback-only containers with 2 CPU,
2 GiB memory, no swap allowance beyond that limit, and separate storage. It
removes only its own labeled containers and volumes, including on handled
interruption. It captures errors by category and never prints endpoints,
credentials or payloads. Existing containers and services are not used. Review
returned image digests against the recorded result before calling a repeat the
same environment.

`P203_ENGINE` may be `both`, `postgres`, or `meili`. `P203_SCALES` may select
any subset of `1000,10000,100000`. Other values fail. Default runs all three
scales and both engines. Private Pilot input is optional and is supplied by an
authorized controlled launcher through `P203_PRIVATE_INPUT`. Do not paste the
real filename or its contents into commands, reports, Git, or chat. Without it
the result reports the missing private probes, rather than borrowing earlier
results.

Outputs initially go to ignored `.local/`. Only reviewed, sanitized JSON is
copied to the tracked results artifact. Never copy the private source input
there. The private adapter reads the existing import input directly, maps its
actual `catalogKind`, and selects approved text only. It replaces operational
IDs with experiment-local ordinals and omits paths, notes, provenance rows and
media.

The 50 primary queries consist of 24 official-open-data queries and 26
explicitly fictional boundary queries. Another 32 fictional queries are
supplemental. Each quality corpus is tested separately so independently
represented originals and copies are not silently merged. Private source probes
are a separate result group. Expected relevance labels are hand-authored for the
small public/synthetic corpora; the generated scale records are not assigned
invented relevance judgments.

Top-1 means an allowed first result, or a correct empty response for a no-result
case. Top-5 means Hit@5: at least one expected result occurs among the first
five, or a correct empty response. Missing expected documents and unexpected
documents are reported separately; Hit@5 does not mean all five results are
correct. Explicitly forbidden relevance distractors are distinct from visibility
leakage.

The scale benchmark runs 12 frozen queries once initially and five timed repeats
(60 warm samples per mode). An empty or incomplete query set fails. It records
per-query numbers, PostgreSQL EXPLAIN plans and per-mode CPU separately; EXPLAIN
does not enter the CPU comparison. The first pass follows indexing and is not
claimed to be an OS-cold-cache experiment. All queries use one client, and host
background activity is not a controlled laboratory variable.

PostgreSQL modes intentionally isolate capabilities. Their all-query accuracy
numbers are diagnostic coverage, not evidence that exact equality should answer
body queries. `policy` combines exact tiers and same-document AND over supplied
whitespace-separated query parts; it does not invent a Chinese tokenizer. The
`trgm` mode is a separate similarity experiment, not an approved fallback. Do
not deploy its unbounded whole-body similarity scan or treat its hits as exact.

Meilisearch profiles use one index sequentially. Strict uses all query words,
disabled prefix and disabled typo tolerance; relaxed uses last-word relaxation,
prefix and default typo thresholds. Native ranking is reported independently of
the small-corpus tier experiment. The latter sees the entire small candidate set
and is not a production top-N reranking algorithm. Its reported query latency
excludes the JavaScript tier pass. Meili native speed is not a measurement of a
future Public API satisfying the whole Search Contract.

Updates use disjoint synthetic literal markers so tokenization cannot masquerade
as stale data. Meili measurements wait for tasks to succeed and confirm query
visibility. The 100 ms task polling interval adds quantization to its measured
update latency: these are observed upper bounds, not precise engine minima. Ten
sequential writes are explicitly not an optimized bulk-import throughput test.

## Conditional bigram experiment

The measured rare two-character scan gap triggered the separately authorized
pg_bigm check. See the fixed build instructions and source provenance alongside
`bigm/Dockerfile`. After building the documented image:

```sh
node bigm-benchmark.mjs
```

It preserves server 18.4, SQL semantics and default rechecking. In a disposable
instance it replaces only the combined-text trigram index with `gin_bigm_ops`,
checks complete small-corpus result equality, then compares six selected queries
at 10k and 100k. The baseline and replacement run sequentially; these numbers
describe an index experiment, not a final deployment schema or cloud
compatibility acceptance. PGroonga and zhparser are not installed.

## Publication and limits

Official records include short attributed transcription excerpts. Their exact
source URLs, date of access, selected fields and CC BY 4.0 attribution are in
`public-corpus.mjs`. They are not complete transcriptions or source-independent
identity decisions. No images are downloaded or embedded.

The original private Pilot documents and query fragments are not distributable
evidence. The generated report excludes them. It cannot establish real ACLs,
unseen historical variants, target-CVM compatibility, Linux OpenCC
compatibility, production latency, high concurrency, outage recovery, or final
UI acceptance. No result here authorizes formal Search V1 implementation or
deployment.
