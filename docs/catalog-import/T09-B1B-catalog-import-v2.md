# T09-B1B — Catalog Import V2

## Purpose

`catalog-import/v2` extends the controlled Catalog import path to the approved
Content V1 fields: `summary`, `periodLabel`, contributors, script style,
transcription, historical context, scholarly research, curated public citations,
and citation scopes. It retains the existing XLSX/CSV → canonical input →
dry-run → Owner approval → single-transaction PostgreSQL apply flow.

## V1 compatibility

`catalog-import/v1` remains immutable. Its version value, four workbook sheets,
four CSV files, machine headers, canonical row shapes and serialization, golden
hash, dry-run and approval semantics, apply/replay behavior, and committed XLSX
artifact remain unchanged. A manifest and workbook layout must both identify the
same explicit version; a missing, unknown, or mismatched version is rejected
before canonicalization. Version is never inferred from a filename or shape.

`catalog-import/v2` had not been used for any operational import before this
change. Therefore, its two already-persisted display fields are added in place
to the V2 row shape and exact header order while the explicit
`catalog-import/v2` and `catalog-import-xlsx/v2` markers remain unchanged. Any
earlier draft V2 workbook or CSV bundle must be regenerated; it fails strict
version, layout, or header validation rather than being shape-guessed or
silently upgraded. This pre-first-use choice does not alter any V1 byte, shape,
hash, or behavior.

## Bounded pre-first-use scope

The goal is limited to making the already-approved `summary` and `periodLabel`
fields authorable through the controlled V2 import path and observable through
the existing Public read projection. There is no database migration, Public
Contract expansion, new endpoint, frontend layout change, or new content field.

| Scenario                       | Development                                             | Production                                              | Must preserve                                                      |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| supplied `summary` on create   | store and return the exact value                        | store and return the exact value                        | existing `summary` meaning and 2,000-character limit               |
| omitted `summary` on create    | store `NULL` and omit publicly                          | store `NULL` and omit publicly                          | no placeholder or inferred summary                                 |
| omitted direct field on update | preserve stored value                                   | preserve stored value                                   | blank never clears data                                            |
| supplied stored `periodLabel`  | return the exact stored label                           | return the exact stored label                           | title-area chronology remains separate from `dynasty` / `dateText` |
| no stored `periodLabel`        | derive from renderable `dynasty` / `dateText` as before | derive from renderable `dynasty` / `dateText` as before | existing fallback and omission behavior                            |
| earlier V2 raw layout          | reject during strict version/layout/header validation   | reject during strict version/layout/header validation   | never infer, auto-upgrade, or reinterpret a versioned input        |

No visual or interaction behavior changes. The only user-visible read change is
that an explicitly stored `period_label` is authoritative; chronology is derived
only when that column is `NULL`.

## Exact V2 inputs

The XLSX workbook contains exactly these sheets, all required:

```text
01_Catalog
02_Aliases
03_Provenance
04_Contributors
05_Public_Citations
99_Instructions
```

The CSV bundle contains exactly these files, all required:

```text
00_manifest.csv
catalog.csv
aliases.csv
provenance.csv
contributors.csv
public_citations.csv
```

The exact `01_Catalog` / `catalog.csv` header order is:

```text
catalogImportId
sourceId
catalogId
title
catalogKind
summary
periodLabel
dynasty
dynastyState
dateText
dateTextState
province
provinceState
prefecture
prefectureState
county
countyState
currentLocation
currentLocationState
currentCustodian
currentCustodianState
description
descriptionState
scriptStyle
scriptStyleState
transcription
transcriptionState
historicalContext
historicalContextState
scholarlyResearch
scholarlyResearchState
contributorsAction
publicCitationsAction
ownerNote
```

The exact remaining data-sheet / CSV headers are:

```text
02_Aliases / aliases.csv
catalogImportId
alias
aliasType

03_Provenance / provenance.csv
catalogImportId
sourceId
sourceTitle
sourceTypeRaw
sourceUrl
sourceNote

04_Contributors / contributors.csv
catalogImportId
position
name
role

05_Public_Citations / public_citations.csv
catalogImportId
position
label
citation
url
appliesTo
```

`00_manifest.csv` has the single `importContractVersion` header and the value
`catalog-import/v2`. The workbook metadata pairs that contract version with
`catalog-import-xlsx/v2`.

## Direct optional display fields

`summary` and `periodLabel` are direct optional scalar fields. They have no
companion state columns and do not support `CLEAR`:

- a blank cell canonicalizes to an omitted property;
- omission on create stores no value;
- omission on update preserves the existing value;
- a nonblank cell canonicalizes to the exact supplied string and requests a
  `SET` when it differs from stored state.

Both values must be non-empty when supplied, exactly trimmed, valid text without
NUL, and retain internal line breaks. `summary` permits at most 2,000 characters
and is the title-area short lead; `periodLabel` permits at most 200 characters
and is the title-area display period. Neither field is a substitute for
`description`, `dynasty`, or `dateText`. `summary` is Level C and `periodLabel`
is Level B for dry-run protection. A V2 canonical envelope and its semantic hash
include either property exactly when it is supplied.

## Stateful scalar semantics

`dynasty`, `dateText`, `province`, `prefecture`, `county`, `currentLocation`,
`currentCustodian`, and `scriptStyle` permit `VALUE`, `UNSUPPLIED`, `UNKNOWN`,
`NOT_APPLICABLE`, and `CLEAR`. `description`, `transcription`,
`historicalContext`, and `scholarlyResearch` permit only `VALUE`, `UNSUPPLIED`,
and `CLEAR`.

For every value/state pair:

| Value cell | State cell                      | Canonical result            |
| ---------- | ------------------------------- | --------------------------- |
| nonblank   | blank or `VALUE`                | `{ state: "VALUE", value }` |
| blank      | blank or `UNSUPPLIED`           | `{ state: "UNSUPPLIED" }`   |
| blank      | another permitted absence state | that explicit state         |
| nonblank   | a non-`VALUE` state             | validation error            |
| blank      | `VALUE`                         | validation error            |

A blank value never means `CLEAR`. Values are non-empty, exactly trimmed plain
text and preserve internal line breaks. Limits are 2,000 characters for
`scriptStyle`, 100,000 for canonical/CSV `transcription`, and 20,000 each for
`historicalContext` and `scholarlyResearch`. XLSX retains its safe physical cell
limit and rejects an over-limit cell deterministically.

On create, `VALUE` is stored, `UNSUPPLIED` stores no value with that state,
permitted `UNKNOWN`/`NOT_APPLICABLE` states are stored without a value, and
`CLEAR` is invalid. On update, `UNSUPPLIED` preserves the database value/state,
different `VALUE` content is updated, and `CLEAR` stores null plus `CLEAR` after
field approval. `scriptStyle` and `transcription` are Level B;
`historicalContext` and `scholarlyResearch` are Level C. Every `CLEAR` requires
field-level approval.

## Collection actions

`contributorsAction` and `publicCitationsAction` use exactly `PRESERVE`,
`REPLACE`, or `CLEAR`; blank canonicalizes to explicit `PRESERVE`.

- `PRESERVE` requires zero child rows and does not modify the collection.
- `REPLACE` requires at least one child row and represents the complete incoming
  collection.
- `CLEAR` requires zero child rows and represents explicit complete deletion.

`CLEAR` is invalid on create. On update, a semantically changed `REPLACE` or a
non-no-op `CLEAR` produces one Level B critical finding for the whole collection
and requires field-level approval. An empty child sheet alone never deletes a
collection.

## Contributor rows

Every contributor references a known V2 `catalogImportId`. `position` is an
integer from 0 through 2,147,483,647 inclusive; both
`(catalogImportId, position)` and `(catalogImportId, name, role)` are unique. A
Catalog has at most 50 contributor rows. `name` is exactly trimmed, non-empty,
and at most 500 characters. `role` is exactly `textAuthor` or `calligrapher`.
Physical row order has no meaning; ascending `position` determines display and
canonical order.

## Public citation rows and scopes

Every public citation references a known V2 `catalogImportId`; its `position` is
an integer from 0 through 2,147,483,647 inclusive and is unique within that
Catalog. `label`, `citation`, and `url` retain the PublicSourceCitation
validation. These are curated public citations, not raw provenance records.

Blank `appliesTo` omits the property and has semantic record scope. A nonblank
cell uses `|` as the only delimiter and permits each exact value at most once:

```text
record
description
transcription
historicalContext
scholarlyResearch
```

Whitespace around tokens, empty or duplicate tokens, unknown values, and other
delimiters are invalid. Canonical scope order is the order shown above. For
collection comparison only, omitted `appliesTo` and explicit `["record"]` are
equivalent.

## Canonical ordering and hash

The canonical V2 envelope contains exactly `importContractVersion`,
`catalogRows`, `aliasRows`, `provenanceRows`, `contributorRows`, and
`publicCitationRows`. Rows use the existing locale-independent UTF-16 code-unit
comparison and these stable keys:

```text
catalogRows:         [catalogImportId]
aliasRows:           [catalogImportId, alias]
provenanceRows:      [catalogImportId, sourceId]
contributorRows:     [catalogImportId, position]
publicCitationRows:  [catalogImportId, position]
```

The canonical hash includes the version, supplied direct `summary` and
`periodLabel` values, every scalar value/state, both normalized collection
actions, aliases, provenance, contributors, public citations, and canonicalized
scopes. It excludes XLSX styling, ZIP timestamps, input row order, CSV
quoting/BOM/newline details, and other source-container details. Semantically
equivalent V2 XLSX and CSV inputs produce identical canonical envelopes, JSON,
and `canonicalInputSha256`.

## Dry-run and approval

V2 dry-run and batch row counts include `catalog`, `aliases`, `provenance`,
`contributors`, and `publicCitations`. Parsed input, dry-run, approval, apply,
and operation audit must all carry `catalog-import/v2`; any mismatch fails
before writes.

Dry-run extends the existing identity, duplicate-candidate, protection-level,
provenance, owner-note, and alias-update behavior. It emits scalar findings for
supplied changes to `summary` and `periodLabel` and for the four stateful
content fields. Omitted direct display fields produce no finding and never clear
stored data. A changed collection emits one Level B critical finding for the
entire collection, using `SET` for `REPLACE` and `CLEAR` for `CLEAR`. Identity
conflicts remain non-approvable. Approval remains bound to the exact contract
version, canonical-input hash, and dry-run-result hash.

## Transactional apply

Apply parses the exact versioned canonical input, validates the supplied dry-run
hash, recomputes dry-run inside the transaction, requires exact input, dry-run,
approval hashes and matching versions, and performs all writes plus the
operation audit in the existing single PostgreSQL transaction. V2 apply uses
`SERIALIZABLE` isolation so a concurrent change to compared state or an
exact-title predicate fails closed instead of being overwritten after
recomputation; V1 transaction behavior is unchanged. Apply writes only the
existing B1A scalar columns, including `summary` and `period_label`, and
contributor/citation/scope tables.

Approved `REPLACE` deletes the old complete contributor or curated-citation
collection and inserts the incoming rows by position; citation scope rows are
inserted only when `appliesTo` was explicit. Approved `CLEAR` deletes the
complete target collection. `PRESERVE` performs no collection mutation. Any
failure rolls back scalar, contributor, citation/scope, alias, provenance, and
audit writes. Replay remains idempotent.

## Non-goals

- No `summary` or `periodLabel` state columns or clear operation.
- No media or Production-data import.
- No frontend layout, Search, CMS, Admin, ordinary-user identity, or
  publication-lifecycle behavior.
- No Person, Site, Institution, taxonomy, OCR, rich text, sidecar-file system,
  multiple transcription editions, inline anchors, or bibliography entities.
- No Public Contract or HTTP-route expansion and no redesign of v1 alias-update
  semantics, approval levels, Catalog identity, or CatalogId allocation.
