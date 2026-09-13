# Phase 4 synthetic acceptance fixture

The manifest freezes exactly 10 Catalog records, 10 existing author works, six
accounts and 25 geometric PNGs. IDs are independently generated and are reused
verbatim. No Research data, imported source identities, historical images or
external assets are included. Fourteen featured memberships cross the product's
12-card page boundary. Supporting comments, replies and edit drafts are separate
from the 20 primary identities.

`node scripts/materialize-phase4-fixtures.mjs <private-output>/synthetic` builds
the PNGs with the existing pinned Admin sharp package. It verifies every byte
hash, rejects collisions, never overwrites files and never creates identities or
connects to a database. The committed manifest is a portable projection of the
original frozen private manifest: only absolute `media[].filePath` values were
removed. The original remains unchanged; the seeder accepts their two exact
reviewed hashes.

Seeding is deliberately bound to this task's private acceptance target. Run
`scripts/seed-phase4-acceptance.mjs` through the installed Payload CLI, with the
approved synthetic Admin environment and the private task artifact directory as
its sole argument. That directory must already contain the task-owned resource
provenance checker, target identity, separate Owner/App/Payload credentials and
private native Owner bootstrap input. The script verifies the container, volume,
loopback mapping, cluster, migrations and view definitions before mutation. It
is not a generic DB initializer or a public work-creation API.

Catalog uploads and publication use the authorized native Payload API. User
media uses the App adapter and separate ownership. Primary publication events
commit serially in frozen ordinal order. Actual database timestamps are recorded
in the private journal; the manifest's intended dates are descriptive fixture
input, never permission to rewrite a first-publication ledger. Existing work
creation is a narrow parameterized synthetic Owner operation.

Supporting IDs and request receipts are saved before writes. Each initial
comment and audit commit together; subsequent likes, moderation, deletion and
draft operations use their existing adapters. Repeat runs verify immutable
identities and bytes, add zero completed records and preserve later acceptance
edits. Any extra primary record, collision or provenance drift fails without
cleanup, overwrite or target substitution. All of this data remains Development
only and must never be promoted to Production.
