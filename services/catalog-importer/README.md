# `@moya/catalog-importer`

Server-only implementation of the frozen `catalog-import/v1` CSV/XLSX boundary.
Strict CSV bundles and untrusted `catalog-import-xlsx/v1` workbooks enter the
same canonical assembly, validation, SHA-256, PostgreSQL dry-run and hash-bound
transactional apply engine. It is validation/import infrastructure, not a public
API, publication workflow or generic filesystem ingestion platform.

XLSX handling reads an explicitly supplied regular file once, performs bounded
ZIP/OOXML and active-content preflight on those bytes, then validates exact
sheet names, fixed technical metadata, Row 2 machine headers and plain-text
cells. Formulas, macros, external relationships, hidden/extra sheets,
unsupported cell types, unsafe ZIP paths and excessive resources fail closed.
The raw artifact hash is audit-only and never replaces the canonical input hash
or approval.

The default validation CLI is dry-run only. Apply requires a separately
supplied, hash-bound authorization and a caller-provided `CatalogIdAllocator`;
the importer core has no fallback allocator and knows no platform ID format.
Update behavior is limited to semantics already defined by the frozen v1
contract. Ambiguous `UNSUPPLIED` replacement or alias merge/replace behavior
fails closed instead of inventing patch semantics.

After building the workspace, the Owner-facing internal validation entry is
dry-run only:

```sh
DATABASE_URL='postgresql://...' \
  pnpm --filter @moya/catalog-importer catalog-import:validate-xlsx -- \
  /explicit/path/to/batch.xlsx /explicit/output/directory
```

It writes structured diagnostics/result JSON and never applies. Apply remains a
separate call requiring out-of-band, hash-bound authorization and transactional
recomputation through `applyCatalogImport`.
