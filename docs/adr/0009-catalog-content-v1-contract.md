# ADR 0009: Catalog Content V1 Contract

Status: Accepted

Decision date: 2026-09-03

Implementation status:

T09-B1A persistence/read path and T09-B1B catalog-import/v2 are implemented.
T09-F1 frontend presentation remains pending.

## Context and relationship to existing decisions

T09-C0 freezes the Owner-approved public Catalog Detail content language before
the separately authorized T09-B1 backend and T09-F1 frontend tasks can begin.
This ADR extends the Catalog Detail content boundary in
[ADR 0004](0004-catalog-contract-design-freeze.md); it does not alter Catalog
identity, the application-owned `CatalogQueryPort`, explicit public mapping or
the canonical route strategy. The runtime `CatalogKind` values remain exactly
`inscription` and `calligraphy`, preserving
[ADR 0005](0005-catalog-kind-top-level-evolution.md) and
[ADR 0008](0008-catalog-kind-governed-extensible-vocabulary.md).
[ADR 0006](0006-long-term-data-governance-and-runtime-source.md) continues to
govern PostgreSQL runtime authority, provenance and publication boundaries.

## Existing field semantics

These meanings are frozen for the later T09-F1 presentation task; T09-C0 changes
no current visual code.

| Field                              | Meaning and later presentation constraint                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                            | Canonical Catalog title.                                                                                                                          |
| `summary`                          | Short lead beneath the title, shown once on Detail, not repeated as another body section or moved into `description`.                             |
| `periodLabel`                      | User-facing chronology beneath the title together with Catalog kind.                                                                              |
| `dynasty`, `dateText`              | Retained structured public facts for mapping, export and future Search; not repeated in T09-F1 “基本资料” when `periodLabel` presents chronology. |
| `province`, `prefecture`, `county` | Independent Contract fields; T09-F1 combines available values into one “地区” line.                                                               |
| `currentLocation`                  | 现址, separate from current custodian.                                                                                                            |
| `currentCustodian`                 | 现藏单位, separate from current location.                                                                                                         |
| `description`                      | 简介.                                                                                                                                             |

No existing field is renamed, removed, merged, made required or assigned a new
maximum. There is no replacement `lead` field or duplicate chronology field.

## New optional Catalog Detail content

Exactly five optional fields are added to `CatalogDetail`, not to
`CatalogSummary`. All text uses the existing trimmed exact-text policy:
non-empty text with no leading or trailing whitespace; validation does not trim
or substitute values. `null` is not an alternative to omission.

| Field               | Wire type              | Maximum and meaning                                                                                                                                                             |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contributors`      | `CatalogContributor[]` | 1–50 entries when present, preserving curated display order; identifies the people responsible for composing the text or writing the calligraphy.                               |
| `scriptStyle`       | `string`               | 2,000 characters; plain public script-style text, including concise mixed-script or multi-part descriptions such as “碑额篆书，正文楷书”. No enum, taxonomy or `scriptStyleId`. |
| `transcription`     | `string`               | 100,000 characters; Owner-approved textual transcription or reading of an inscription, colophon, epitaph, cliff carving or calligraphy text.                                    |
| `historicalContext` | `string`               | 20,000 characters; historical circumstances, events and context associated with the work.                                                                                       |
| `scholarlyResearch` | `string`               | 20,000 characters; curated research history, scholarly interpretations, debates and research value associated with the work.                                                    |

`CatalogContributor` is a strict object requiring only `name` and `role`. `name`
is trimmed, non-empty public text of at most 500 characters.
`CatalogContributorRole` has exactly two wire values:

| Role           | Meaning                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `textAuthor`   | Person responsible for composing or authoring the text: 撰文者 / 撰者. |
| `calligrapher` | Person responsible for writing the calligraphy: 书者 / 书丹者.         |

The same name may appear once under each different role, but a duplicate
`(name, role)` pair is invalid. Unknown attribution is represented by omitting
the field or entry, never by automatically inserting `unknown`, `佚名` or
`待考`. No ambiguous top-level `author` or `calligrapher` field is introduced.

All new content is plain public text, not HTML, Markdown storage or a structured
rich-text document. Internal line breaks in `transcription` are meaningful and
must be preserved; line breaks are also allowed in `historicalContext` and
`scholarlyResearch`. Unicode editorial symbols remain ordinary transcription
text. Omission means the public record does not provide that content; consumers
omit absent optional sections. No placeholder is part of the Public Contract.
Development-only presentation placeholders remain outside canonical data and
must never become Production content.

## Citation scopes and compatibility

The existing strict `PublicSourceCitation` keeps required `label` and optional
`citation` and `url`, adding only optional `appliesTo?: CatalogCitationScope[]`.
The scope vocabulary is exactly:

| Scope               | Supported public content                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `record`            | General Catalog facts: title, aliases, chronology, contributors, script style, region, current location, current custodian and overall record authority. |
| `description`       | 简介.                                                                                                                                                    |
| `transcription`     | 释文.                                                                                                                                                    |
| `historicalContext` | 历史背景.                                                                                                                                                |
| `scholarlyResearch` | 学术研究.                                                                                                                                                |

Omitted `appliesTo` means exactly `["record"]` semantically. Parsing an old
citation must leave it unchanged: no `.default()` or other operation injects
`appliesTo`. When present the array contains 1–5 unique scope values; an empty
array, unknown value, duplicate or `null` is invalid. One citation may support
multiple scopes; scope order has no semantic significance.

The Contract permits partial records and does not enforce publication
completeness across content fields and citations. A later T09-B1/import
publication rule may require a matching citation scope for populated sections;
that rule is not implemented here. Internal source identities and metadata
remain excluded from the public citation.

All existing Detail payloads and citations remain valid without the new fields.
Existing mappers may continue omitting them, and current API responses and Web
parsing remain compatible. `CatalogSummary`, `CatalogKind`, identity, media,
list query, pagination, API versions, routes, methods, parameters, status codes
and error codes remain unchanged.

## Contract authority and subsequent ownership

Zod remains the sole runtime schema authority, using strict objects and inferred
TypeScript types. The source-of-truth chain remains:

```text
Zod → inferred TypeScript → Draft 2020-12 JSON Schema → OpenAPI 3.1.1
```

`CatalogContributorRole`, `CatalogContributor` and `CatalogCitationScope` have
public inferred types, corresponding Zod schemas, standalone derived JSON
Schemas and contract-derived OpenAPI components. Generated OpenAPI is not a
second hand-written model.

These governed public facts and plain-text content are eligible for future
Search consumption. That eligibility does not define or implement indexing,
tokenization, ranking, queries, Search contracts or endpoints.

Owner/backend controls canonical field meaning, evidence, publication and data.
Only after this Contract is accepted and merged may the separately authorized
T09-B1 task add database/importer support, projections, explicit mapper fields
and Public API population. T09-F1 owns presentation within these frozen
semantics: typography, spacing, responsive layout, section navigation, long-text
reading treatment, citation visual treatment and accessible interaction.

The frontend partner may not rename fields, infer missing facts, invent
contributors or script styles, change citation scopes, insert placeholder
Production text or import QA content into Production. Governed facts comprise
contributors, script style, region, current location and current custodian;
governed content sections comprise description, transcription, historical
context and scholarly research. Neither T09-B1 nor T09-F1 is implemented here.

## Non-goals

- Database columns or migrations; importer, XLSX/CSV template or canonical-row
  changes; `CatalogRecord`, read projection, mapper or HTTP-handler changes;
  Production data population or deployment.
- Frontend, React Detail or QA record implementation, T02 redesign or a second
  presentation system.
- Search, calligraphy taxonomy, `PersonId`, biographies, life dates,
  organizations, extra contributor roles or a generic contributor-role registry;
  Person, Site, CMS, knowledge graph or community domains.
- Paragraph IDs, line/character coordinates, multiple transcription editions,
  variant readings, OCR, segmentation, inline footnote syntax, HTML, Markdown or
  rich-text storage.
- `CitationId`, `SourceId`, paragraph/sentence anchors, JSON Pointer or
  field-path expressions, page-level footnote numbering, citation registry or
  bibliography domain.
