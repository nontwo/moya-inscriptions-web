# `@moya/image`

Backend-only storage URL resolution implementations for the application-owned
`StorageUrlResolver` port.

- `MappedStorageUrlResolver` provides deterministic explicit mappings for tests
  and development fixtures.
- `UnconfiguredStorageUrlResolver` represents production before a real storage
  provider is configured; it never fabricates URLs.
- HTTP status classification remains in backend transport.

This package does not upload, transform, ingest, or inspect images. It does not
contain provider credentials, production domains, bucket configuration, or
frontend URL composition.
