# ADR 0008: CatalogKind Governed Extensible Vocabulary

- Status: Accepted
- Implementation status: Documentation-only; to be paired with T09.1
  implementation
- Date: 2026-08-21
- Scope: CatalogKind semantics and future contract-evolution governance
- Supersedes: none
- Preserves: ADR 0005 as historical evidence

## Background

ADR 0005 correctly narrowed the current runtime `CatalogKind` values to:

- `inscription`
- `calligraphy`

That decision remains in force. This ADR only clarifies the long-term semantic
rule: `CatalogKind` is a governed, extensible top-level cultural-object
vocabulary, not a closed universe.

## Decision

1. Current runtime values remain exactly:

   ```text
   inscription
   calligraphy
   ```

2. The current two-value runtime enum is not expanded in T09.1.
3. Future first-real new kinds must be introduced through a separate explicit
   contract-evolution checkpoint.
4. This semantic clarification does not by itself trigger PostgreSQL CHECK
   expansion, OpenAPI enum expansion, importer changes, workbook changes, or
   golden-file changes.

## Consequences

- ADR 0005 remains the historical record for the current two approved runtime
  values.
- The platform keeps a governed path for future kinds without implying they
  exist now.
- T09.1 implementation stays bounded to Catalog Detail read-model evolution.
