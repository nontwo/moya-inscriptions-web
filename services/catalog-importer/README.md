# `@moya/catalog-importer`

Server-only implementation of the frozen `catalog-import/v1` CSV boundary. It
parses strict CSV bundles, performs deterministic PostgreSQL dry-runs, and
applies a hash-bound approval atomically. It is validation/import
infrastructure, not a public API or a generic workflow platform.
