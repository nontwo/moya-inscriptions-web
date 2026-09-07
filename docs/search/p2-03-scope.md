# P2-03 search evaluation scope

Status: evaluation-only. Owner approved the bounded experiment on 2026-09-07.
This is not implemented Search V1, a production release, or Pilot acceptance.

Baseline: `6f3f4cf81c63811b93296249175830793427d3c8`. Task branch:
`research/p2-03-search-evaluation`; new Draft PR targets `main`. Allowed
changes: `docs/search/p2-03-*` and `experiments/p2-03-search/**` only. Do not
modify prior PRs, original material, Catalog identities, or media identities.

## Frozen experiment

- Isolated PostgreSQL 18.4, OpenCC 1.4.1 with `t2s.json`, Meilisearch CE 1.53.2.
- Each search engine runs sequentially with 2 CPU and 2 GiB limits. Record
  actual architecture, settings, extension version, artifact digests, and
  limitations.
- Reuse the repository's PostgreSQL client version, `pg` 8.22.0, in an isolated
  experiment package. No root dependency or lockfile change.
- PostgreSQL comparisons: original exact, normalized exact, prefix, contains,
  pg_trgm, built-in full-text search, and an explicitly described combined
  policy.
- Meilisearch is the only independent engine comparison. Strict and relaxed
  profiles are measured separately, with sequential single-index settings.
- Only a demonstrated short-Chinese-query failure can trigger a targeted pg_bigm
  evaluation. PGroonga and zhparser are not preinstalled.
- Approximately 50 manually designed Golden Queries; seeded 1k/10k/100k
  synthetic corpora measure scale, not the quality of real Catalog content.
- Existing tests provide structural examples, not blanket provenance approval.
  Explicit synthetic provenance is required for invented records. Real-content
  claims require an approved source and must remain distinct from synthetic
  tests.

## Fields and semantics

High priority: title and existing approved aliases. Structured fields:
contributor names, periodLabel, dynasty, dateText, scriptStyle, province,
prefecture, county, currentLocation, currentCustodian. Body: summary,
description, transcription only when its state is VALUE. Historical context and
scholarly research are separate long-text stress inputs; this evaluation does
not approve them for formal Search V1. Kind remains a filter. No invented
publication state or ACL is introduced. Visibility fixtures test an explicit
allowed set, not an implemented authorization system. Excluded records must not
enter results, counts, or summaries.

Ranking evaluation principles, in priority order: original whole title; original
whole approved alias; normalized exact title/alias; partial title/alias;
structured fields; body; clearly identified similar results. These tiers are
experiment semantics, not a preapproved final ranking algorithm. Multi-part
person/work queries require all parts in the same Catalog record.

OpenCC changes only rebuildable copies and queries. Original text and identity
remain byte-preserved. Record the exact configuration and dictionary versions.
Normalization collisions are not original-text exact matches or new aliases. No
media URLs, object keys, private notes, credentials, or private locations are
included in fixtures, indexes, outputs, or logs.

## Behavior and delivery boundary

| Scenario                  | Development                     | Production               | Must preserve                           |
| ------------------------- | ------------------------------- | ------------------------ | --------------------------------------- |
| Run benchmark             | Explicit isolated fixtures only | No effect                | Existing services and data              |
| Search UI                 | No change                       | No change                | Shell, IME, focus, history and gestures |
| Search fields and ranking | Evaluation copies only          | No new contract or query | Canonical values and identity           |
| Long body experiment      | Separate labeled stress input   | Not newly searchable     | Approved public field meanings          |

Measure Top-1/Top-5 correctness, missed and incorrect hits, short Chinese,
traditional/simplified and multifield subsets, latency, CPU, memory, index size,
initialization and update-to-visible time, and operational/platform
implications. Keep actual engine timing distinct from client timing and future
Public API timing. Document skipped/failed runs, small-sample limits, cache
state, and capacity bounds.

Applicable local validation, CI and independent actual-diff review precede
delivery. Commit/push/payload checks use the existing confidentiality guard.
After presenting results and one recommendation to Owner, STOP. Do not start a
formal Search Contract, production migration, API, UI integration or deployment.
The directional Owner gate remains open; no automatic final implementation
follows.
