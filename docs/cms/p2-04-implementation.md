# P2-04 Payload editorial automation

Status: local implementation validated and under final Draft review; real
migration and cutover not performed. Owner authority: explicit P2-04 execution
instruction, received 2026-09-07. Baseline: initial origin/main
`bbfe93be2b19121f4c51ccd59d90e89fddff4862`; integrated the subsequent main
policy update `1fefd896e989ff07dc1d9b3581be290c177a4c36` before delivery.
Branch: `feat/p2-04-payload-editorial-automation`; one Draft PR targeting main.

## Scope and implementation

1. Integrate stable official Payload Admin, PostgreSQL adapter and MCP in the
   server portion of apps/admin. Preserve current Next, React and TypeScript.
2. Use versioned Catalog documents with stable business IDs and embedded ordered
   fact/source/contributor/media snapshots. Keep original text as plain text.
3. Apply shared server validation and access rules across Admin, REST and MCP.
   Owner and scoped automation identities only; automation writes drafts. Owner
   approval binds precise revisions and media; stale items fail individually.
4. Keep a single published read adapter behind the existing Public HTTP API.
   Published revisions alone feed public lists, details, search and counts.
   Preserve existing public DTOs and all current public Web behavior.
5. Add bounded deterministic batch and offline migration tools with replay,
   atomic revision checks, per-item receipts, dry-run and identity verification.
6. Validate real CMS writes in an isolated local database with synthetic data,
   then review exact diff and create/update one Draft PR after preflight.
7. Prepare one operational guide and a concrete consolidated authorization
   packet before any real migration, target write, cutover or client config
   change that lacks existing approval. Retain old runtime until approved
   cutover.

Non-goals: public users, community, OCR, research platform, alternative CMS, new
cloud provider, queue cluster, public release, unrelated refactors, rewriting
history, or modifying other tasks and services.

## Approved Behavior Matrix

The Owner execution instruction already approves these behaviors.

| Scenario               | Development                               | Production                          | Must Preserve                                 |
| ---------------------- | ----------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Incomplete record      | Save a legal draft, show missing fields   | Invisible                           | Invalid identity/input rejected               |
| Edit published record  | Save new draft and embedded relations     | Previous published revision remains | Exact text and stable IDs                     |
| Automated batch        | Scoped draft writes and real receipts     | No unapproved publication           | No forged approval or role change             |
| Replay                 | Reuse completed item identities/objects   | No duplicates                       | Idempotency is distinct from content identity |
| Concurrent editing     | Atomic stale revision rejection           | No mixed revision                   | Human and automation share rule               |
| Approved batch publish | Only unchanged approved revisions succeed | Lists/details/search/counts agree   | Changed item alone blocked                    |
| Withdraw               | Preserve identity/history                 | Future reads omit record            | Existing downloaded bytes cannot be recalled  |
| Restore revision       | New auditable draft                       | No implicit republication           | Approval boundary                             |
| Unauthorized request   | Admin/REST/MCP/versions/media deny        | No private content leak             | Same server rules                             |
| Restart/restore        | Persistent accounts/revisions/relations   | Recover consistent service          | Preserve post-cutover increments              |
| No images              | Draft and valid publication allowed       | Existing missing-media behavior     | No unrelated QA images                        |
| Historical media       | Metadata-only migration                   | Same approved media                 | Original IDs, keys, bytes, order, rights      |

## Evidence and gates

Run current pnpm verify without extending its daily 120-second execution budget.
Add scoped real PostgreSQL/Payload integration tests and required Admin E2E.
Measure small batches before bounded 1,000/10,000 synthetic records. Record
memory, connections and version growth; simulation is not concurrent-user
capacity. Real COS compatibility, existing three-record/twenty-media migration,
actual Codex MCP invocation, Owner Admin/workflow acceptance and remote cutover
remain separate evidence gates. Never label installation or tools/list as
completion.

Current remote Pilot and Production are untouched. Existing content write paths
remain active until a specifically authorized cutover freezes their privileges.

## Bounded CI dependency correction

Draft PR #102 first ran at `16612503f805c0985ca78bcf3c93fde244b0f0c3`.
[CI run 34232280412](https://github.com/nontwo/moya-inscriptions-web/actions/runs/34232280412)
failed its ordinary-test job at 119,001 ms, exit 124. PostgreSQL preparation and
integration took about 18.34 seconds, scanner tests 10.52 seconds, and the Turbo
phase 81.397 seconds. Only 12/13 executable tasks completed. The unfinished
`@moya/tests#test` waited for a cold Admin build (45 seconds compilation plus
6.2 seconds TypeScript). This failed run remains evidence; absence of an
assertion failure does not make an incomplete run pass.

The ordinary tests import `admin/fields` and `admin/migration` as TypeScript
source; the migration CLI test also runs source through the installed Payload
CLI. They do not consume Admin `.next` output. The other ten direct workspace
dependencies expose runtime JavaScript from `dist`, which the tests do consume.
Only `@moya/tests#test` now explicitly selects those ten library builds. The
Admin workspace dependency, global test/build `^build` rules, production build,
CMS database/browser checks, public smoke and security checks remain intact.

PostgreSQL preparation invokes the same Turbo library build tasks as the later
ordinary-test phase. All eight preparation task hashes match the later graph, so
only identical source/configuration/dependency versions can reuse output. Cold
preparation, migrations, PostgreSQL tests, scanner tests and ordinary tests
remain under one unchanged 119-second execution deadline within the 120-second
command allowance; no build is moved outside the timer. Regression checks
inspect actual Turbo dry graphs and the retained CI entry points.

This correction changes only `turbo.json`, `scripts/verify.mjs`, the existing
`tests/unit/architecture/ci-e2e-policy.test.ts`, and this implementation record.
No product behavior, dependency version, test exclusion or task scope changes.

The corrected source passed local lint (7.3 seconds), typecheck (5.2 seconds),
production build (13/13 cached tasks) and ordinary verification (42.7 seconds,
12/12 tasks, 11 cached). Ordinary reports contain 679 common and 732 Web tests;
these local cached results do not establish cold Linux completion. Independent
review closed a dry-graph subprocess cleanup finding by invoking the installed
native Turbo executable directly. The two added regressions passed with the
existing file's 23 tests. Isolated Linux preparation first rejected accidental
AppleDouble archive entries, then an old Git lacking `--no-lazy-fetch`; both
environment failures are retained, and no safety assertion was removed. Exact
new-Head Linux and GitHub results will be recorded in the same Draft PR,
separately from the initial candidate's evidence below.

## Observed local evidence (synthetic data only)

| Check                                      | Observed result                                                                                                                                                              | Practical limit                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Native PostgreSQL migrations and CMS tests | Fresh isolated database: 30/30 tests, 5 files, 7.1 seconds including prerequisite builds                                                                                     | Includes the implicit publication-state bypass regression                                              |
| Native Admin browser                       | Eight stages passed in the packaged Admin; zero client JavaScript or HTTP failures                                                                                           | Includes native media upload, association, protected preview and exact bytes; Owner acceptance pending |
| Official MCP protocol                      | Query, create draft, field read and exact replay passed through official SDK                                                                                                 | Actual Codex CLI invocation remains blocked by its noninteractive tool approval policy                 |
| Deterministic HTTP batch                   | Two scoped records with 100,000-character Chinese synthetic text each; exact readback and replay; one revision advance each                                                  | No real original text used                                                                             |
| Bounded volume                             | 100 / 1,000 / 10,000 native drafts; four parallel writers; total 33.4 seconds                                                                                                | Not concurrent public-user capacity                                                                    |
| 10,000-record resource sample              | Peak 691 MiB RSS; database grew 21.5 MiB; connection pool limited to five; final-page read 506 ms                                                                            | One local machine and synthetic shape                                                                  |
| Packaged Admin runtime                     | Login page, authenticated login, list and draft workflow endpoint passed; warm RSS about 405 MiB                                                                             | macOS process only; no target-host capacity claim                                                      |
| Full workspace build                       | 13 tasks passed in 16.3 seconds; aggregate child RSS peak about 3.39 GiB                                                                                                     | Final aggregate build passed again in pnpm verify; does not fit a 2 GiB host build assumption          |
| Backup and recovery                        | PostgreSQL custom dump restored into separate isolated database; logical count and hash matched all 28 tables; restarted login and persisted accounts/revisions/media passed | Point-in-time synthetic recovery, not a real Pilot backup                                              |
| Dependency audit                           | Zero high/critical; three moderate advisories remain                                                                                                                         | Details and mitigations in operations guide; not a clean audit claim                                   |

Early runs exposed restore-as-draft, native creation and field-clearing defects;
these were fixed without weakening assertions. Two aggregate verification runs
stopped at formatting while generated files and active edits changed. An invalid
batch fixture was rejected before a corrected batch passed. These failed runs
are not clean first-pass evidence. Final pre-commit candidate results are
recorded below.

## Final pre-commit validation

- `pnpm verify`: PASS, 45,422 ms of the unchanged 120,000 ms execution budget.
  All 43 workspace tasks passed: format, lint, typecheck, tests and build; 732
  Web tests plus 677 common tests, and five Chromium smoke tests passed. Two old
  Admin-placeholder path assertions initially failed and were moved to the real
  native route/metadata chain while preserving their branding and
  public/frontend boundary checks. No assertion or check was skipped.
- `pnpm test:cms`: 30/30 across five real PostgreSQL test files; includes the
  independently found implicit publication-state bypass regression.
- `pnpm test:cms:browser`: eight packaged native Admin stages passed, including
  original-media upload/association, protected preview and exact byte readback.
- Model, migration and actual CLI entry tests: 41/41. The actual silent pnpm
  dry-run returned READY for one synthetic record/source, with no database
  connection attempt and zero writes. Failure remains a nonzero exit.
- Independent reviews covered core authorization/revisions, fields/conversion,
  published views/readiness, storage/preview and runner supervision. The
  publication-state finding was fixed and its real database test passed. Final
  index/tree confirmation and remote CI are recorded in the Draft PR.

## Necessary supporting preflight correction

The actual staged scan initially blocked twelve positions. Controlled review
identified existing synthetic CI/test credentials, JavaScript `typeof`
comparisons, a locked package version and a fictional session fixture; no real
credential was found. The existing scanner is corrected only for those semantic
cases, with all 33 scanner tests passing and positive credential-detection
regressions retained. No file-wide allowlist, check bypass or second mechanism
is introduced. Synthetic test values are explicitly labeled. The controlled
updater refreshes this repository's existing shared hook copy once; anonymous
identity and unrelated configuration remain unchanged. Other computers and
unrelated clones do not inherit it. The same delivery batch and shared
120-second allowance remain in effect.

## Outstanding gates

- Actual Codex tool execution: the server protocol works, but `codex exec`
  requires tool approval while its effective policy is `never`. Neither a second
  SDK client nor tools/list is accepted as Codex completion. No approval bypass
  or persistent client edit was made.
- Real three-record/twenty-photo input: current source, stored mappings and full
  approved metadata have not been verified. No reconstruction, re-upload or
  remote migration was attempted; migration readiness is not claimed.
- COS and operational target: exact target, protected ingress, backup/freeze,
  write window and capacity/cost choices need one consolidated Owner decision.
- Owner visual/workflow acceptance and independent current-candidate review
  precede Ready, merge and any deployment. Existing legacy writes remain active.

## Modified files

The exact candidate paths relative to the repository are listed below. The
earlier policy/hook update already present on main is excluded; this candidate
adds the narrow existing-scanner correction described above.

- `.agents/skills/yoyi-editorial/SKILL.md`
- `.github/workflows/ci.yml`
- `AGENTS.md`
- `apps/admin/AGENTS.md`
- `apps/admin/CLAUDE.md`
- `apps/admin/app/(payload)/admin/[[...segments]]/page.tsx`
- `apps/admin/app/(payload)/admin/importMap.ts`
- `apps/admin/app/(payload)/api/[...slug]/route.ts`
- `apps/admin/app/(payload)/layout.tsx`
- `apps/admin/app/(payload)/page.tsx`
- `apps/admin/app/layout.tsx`
- `apps/admin/app/page.tsx`
- `apps/admin/next.config.ts`
- `apps/admin/package.json`
- `apps/admin/payload.config.ts`
- `apps/admin/scripts/benchmark-synthetic.ts`
- `apps/admin/scripts/bootstrap-synthetic.ts`
- `apps/admin/scripts/build.mjs`
- `apps/admin/scripts/migrate-legacy.ts`
- `apps/admin/scripts/recovery-synthetic.ts`
- `apps/admin/src/editorial/access.ts`
- `apps/admin/src/editorial/collections.ts`
- `apps/admin/src/editorial/content.ts`
- `apps/admin/src/editorial/endpoints.ts`
- `apps/admin/src/editorial/errors.ts`
- `apps/admin/src/editorial/hooks.ts`
- `apps/admin/src/editorial/identities.ts`
- `apps/admin/src/editorial/index.ts`
- `apps/admin/src/editorial/operations.ts`
- `apps/admin/src/editorial/owner.ts`
- `apps/admin/src/editorial/state.ts`
- `apps/admin/src/editorial/transaction.ts`
- `apps/admin/src/fields/editorial-fields.ts`
- `apps/admin/src/mcp.ts`
- `apps/admin/src/media/CatalogOwnershipField.tsx`
- `apps/admin/src/media/MediaSnapshotPicker.tsx`
- `apps/admin/src/media/OriginalMediaMetadataField.tsx`
- `apps/admin/src/media/collection.ts`
- `apps/admin/src/media/snapshot.ts`
- `apps/admin/src/media/storage.ts`
- `apps/admin/src/media/validation.ts`
- `apps/admin/src/migration/legacy.ts`
- `apps/admin/src/migration/run.ts`
- `apps/admin/src/migrations/20260908_030835_p2_04_initial.json`
- `apps/admin/src/migrations/20260908_030835_p2_04_initial.ts`
- `apps/admin/src/migrations/20260908_031500_published_views.ts`
- `apps/admin/src/migrations/20260908_035348_p2_04_identity_claims.json`
- `apps/admin/src/migrations/20260908_035348_p2_04_identity_claims.ts`
- `apps/admin/src/migrations/index.ts`
- `apps/admin/src/owner-workflow/NavLink.tsx`
- `apps/admin/src/owner-workflow/View.tsx`
- `apps/admin/src/owner-workflow/client.tsx`
- `apps/admin/src/payload-types.ts`
- `apps/admin/src/preview/index.ts`
- `apps/admin/src/published/views.ts`
- `apps/admin/src/runtime-settings.ts`
- `apps/admin/src/users.ts`
- `apps/admin/tsconfig.json`
- `apps/web/app/editorial-preview/[id]/page.tsx`
- `apps/web/app/editorial-preview/[id]/preview-experience.tsx`
- `apps/web/lib/public-api/editorial-preview-server.test.ts`
- `apps/web/lib/public-api/editorial-preview-server.ts`
- `docs/adr/0010-payload-editorial-source.md`
- `docs/cms/operations.md`
- `docs/cms/p2-04-implementation.md`
- `docs/governance/amendments/2026-09-07-p2-04-payload-editorial.md`
- `docs/project-status.md`
- `eslint.config.mjs`
- `package.json`
- `packages/contracts/package.json`
- `packages/contracts/src/internal/editorial/automation.ts`
- `packages/contracts/src/internal/editorial/index.ts`
- `packages/contracts/src/internal/editorial/schemas.ts`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `scripts/confidentiality-scan.mjs`
- `scripts/confidentiality-scan.test.mjs`
- `scripts/editorial/batch.mjs`
- `scripts/editorial/verify-cms.mjs`
- `scripts/editorial/verify-owner-browser.mjs`
- `scripts/verify.mjs`
- `services/backend-production/src/composition.ts`
- `services/catalog-postgres/src/readiness.ts`
- `tests/cms/media.test.ts`
- `tests/cms/migration-run.test.ts`
- `tests/cms/owner-browser.mjs`
- `tests/cms/preview.test.ts`
- `tests/cms/read-views.test.ts`
- `tests/cms/workflow.test.ts`
- `tests/e2e/support/e2e-ports.ts`
- `tests/package.json`
- `tests/tsconfig.json`
- `tests/unit/architecture/contracts-surface.test.ts`
- `tests/unit/architecture/ci-e2e-policy.test.ts`
- `tests/unit/architecture/current-truth-config.test.ts`
- `tests/unit/architecture/dependency-boundaries.test.ts`
- `tests/unit/architecture/workspace-scanner.ts`
- `tests/unit/backend/catalog-importer-security-boundaries.test.ts`
- `tests/unit/editorial-batch.test.ts`
- `tests/unit/editorial-migration-cli.test.ts`
- `tests/unit/editorial-migration.test.ts`
- `tests/unit/editorial-model.test.ts`
- `turbo.json`
