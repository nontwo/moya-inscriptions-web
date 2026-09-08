# Owner Amendment — P2-04 Payload editorial automation

- Status: Active
- Effective date: 2026-09-07
- Authority: explicit Owner P2-04 execution instruction.

The Owner authorizes self-hosted Payload CMS in the server portion of
apps/admin, official PostgreSQL/MCP/storage dependencies, native administration,
controlled automation, migrations, testing and supporting governance. The normal
content workflow after approved cutover is Admin or controlled CMS API/MCP;
spreadsheets are no longer a required Owner/Editor format. This is a current
authorized task.

## Rule classification

- MODERNIZE Constitution section 6 and the React current-authority amendment:
  CMS is authorized for this P2-04 scope. Other deferred domains stay deferred.
- MODERNIZE section 19 Admin boundary: Payload server modules may access their
  database through the official adapter. Browser modules and all public Web
  modules remain forbidden from importing CMS Local API or database drivers.
- MODERNIZE ADR 0006 normal writes: following authorized cutover, Payload is the
  only editable content source. Old table layouts may migrate, while business
  IDs, source mappings, fact semantics, original text and public contracts
  persist.
- RETIRE mandatory XLSX/CSV daily editing after cutover. Offline migration and
  historical source/approval records remain read-only evidence. Before cutover,
  the existing runtime stays operational; installation does not retire it.
- PRESERVE confidentiality preflight, synthetic/real isolation, media byte and
  identity preservation, least privilege, exact-head independent review, Owner
  visual/workflow acceptance and distinct production/remote authorization.

## Binding implementation constraints

Use native Payload capabilities before thin business adaptations. Draft text and
embedded relationship snapshots are private; public reads select only published
revisions. Publication by automation requires a trusted Owner grant bound to
exact unchanged revisions and media. Native Admin, REST, MCP, restore and any
other enabled mutation path share validation and atomic stale-revision checks.

No direct browser SQL, public CMS management API, second editable content
master, new cloud provider, external AI subscription, or alteration of public
Product Detail/Viewer/gesture/navigation behavior is authorized.

Real database export access, migration, COS writes, deployment, permission
changes and additional fees require actual target and authorization
verification. Prior Pilot approval does not authorize CMS migration. Confirm the
complete cutover packet once before actual migration/cutover; preserve
post-cutover edits for rollback and do not drop old tables or delete objects
automatically.

See
[implementation and approved Behavior Matrix](../../cms/p2-04-implementation.md).
This amendment records authorization, not completion or production approval.
Historical decisions remain unchanged and are interpreted under this amendment.
