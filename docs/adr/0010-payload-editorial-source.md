# ADR 0010 — Payload editorial content source

Status: accepted direction, implementation in progress; no runtime cutover.

The Owner selected self-hosted Payload Admin with official MCP/REST APIs,
PostgreSQL and Tencent COS. This supersedes ADR 0006 only where normal content
writes and the physical persistence layout change after authorized cutover.

Catalog facts and ordered relationship snapshots are versioned together. Payload
internal primary keys remain distinct from persistent
CatalogId/SourceId/MediaId. Current Public DTOs and HTTP/Product behavior remain
unchanged. A published-only PostgreSQL read surface on the same CMS database
feeds the existing query port. The public runtime never fetches a privileged
latest draft for frontend filtering.

Admin and automation share server access, validation and transactional revision
checks. Owner approvals bind exact revisions; regular automation cannot create
its own approval. Existing COS bytes and keys are metadata-only migration input.

Before cutover, preserve existing services. After cutover, freeze old importer
write privileges and keep old content/records read-only for the approved
rollback period. Any rollback first preserves incremental CMS edits.

See the
[active amendment](../governance/amendments/2026-09-07-p2-04-payload-editorial.md)
and [implementation evidence](../cms/p2-04-implementation.md).
