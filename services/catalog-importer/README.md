# `@moya/catalog-importer`

Server-only implementation of the frozen `catalog-import/v1` CSV boundary. It
parses strict CSV bundles, performs deterministic PostgreSQL dry-runs, and
applies a hash-bound approval atomically. It is validation/import
infrastructure, not a public API or a generic workflow platform.

The default validation CLI is dry-run only. Apply requires a separately
supplied, hash-bound authorization and a caller-provided `CatalogIdAllocator`;
the importer core has no fallback allocator and knows no platform ID format.
Update behavior is limited to semantics already defined by the frozen v1
contract. Ambiguous `UNSUPPLIED` replacement or alias merge/replace behavior
fails closed instead of inventing patch semantics.
