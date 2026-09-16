# Data and administration hardening — data-admin-hardening-v1

Task: `data-admin-hardening-v1`, Issue #141 (r2). Base `origin/main`
`30deb84399d39e69ddea0987e54ec16767c43395` (PR #138 merged). Delivery stop: one
reviewed Draft PR; no Ready transition, merge, release, deployment or
retained-data mutation. Private evidence (inspection outputs, measurements,
screenshots, checkpoints) lives in the task's private artifact directory and is
not part of this record.

## 1. Method

- Ten independent read-only audits over the community data model, adapters,
  Backend handlers, contracts, migrations, grants, Admin views and their tests,
  each reproducing its claims on a task-owned disposable PostgreSQL 18.4 (14
  community migrations, marked `yoyi-disposable-test-target`) with rolled-back
  experiments and `EXPLAIN (ANALYZE, BUFFERS)` on synthetic datasets. Every
  finding below names its evidence; measurements are actual numbers on those
  datasets, extrapolations are labeled estimates.
- Adversarial re-verification of findings by separate lenses (code,
  reproduction, product intent) where the session budget allowed; the verdicts
  changed the classification of several findings (recorded below).
- Read-only health inspection of the retained Development databases with bounded
  metadata statements only (§6).
- Fixes carry regressions that fail on the original implementation where a
  RED/GREEN run is possible; otherwise exact before/after evidence is recorded.

## 2. Status of the prior audit's concerns

| Prior concern                                                                                               | Status                                                                                                                        | Current-code evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Narrow column GRANTs do not remove an earlier broad table grant; the upgrade test recreates a fresh role | CONFIRMED → FIXED IN CODE                                                                                                     | A role that received `grant-community-app.sql` and then `grant-runtime.sql` kept table-level `UPDATE` on `sessions`, `catalog_comments`, `catalog_comment_replies`, `publication_setting` (aclexplode diff; non-listed columns updatable). `grant-runtime.sql` now revokes exactly the table-level privileges it grants at column level before re-granting; the App-role test gained a `legacy-grants-upgrade` kind that applies the old set to the SAME role and asserts the effective set equals a fresh role's (RED on the original script, GREEN now).                                                                                                                                                                                                                                   |
| A. `dev:migrate` applies only the Mission 2A/2B grants                                                      | CONFIRMED (new) → FIXED IN CODE (r2)                                                                                          | `package.json` `dev:migrate` never applied `grant-runtime.sql`; a developer following `docs/development.md` got an App role without any Phase 4/publishing grant. The command now applies the converging runtime grant after the bootstrap; `compose.dev.yml` mounts it; `current-truth-config.test.ts` pins the chain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A. Effective permissions: PUBLIC grants, memberships, ownership, SECURITY DEFINER                           | NOT REPRODUCED (no defect)                                                                                                    | All ten community functions are SECURITY INVOKER; PUBLIC EXECUTE is the PostgreSQL default and the five adapter-called functions are granted explicitly; no default ACLs, no role memberships, every relation owned by the migration role. Verified on the disposable server and, as a dated read-only observation (2026-09-16T02:34Z/02:36Z), on the two inspected retained targets; nothing is known for the uninspected targets (§6).                                                                                                                                                                                                                                                                                                                                                     |
| B. Withdrawn Catalog relations counted but not listed; suspended/blocked accounts counted but not listed    | ALREADY FIXED at the service layer since #126 (public totals were correct); adapter semantics consolidated → FIXED IN CODE    | Public profile totals were already correct: the shipped service override replaced the adapter's four raw totals with list totals whenever a discovery port was composed (always, in the shipped composition). The raw-adapter divergence was therefore an internal inconsistency plus redundant reads, not a proven incorrect public number. The adapter's `readProfile` now computes the totals with the list predicates in one snapshot (people: active + interactable; relations: published Catalog record or effectively public work) and the override and its page reads are removed. Regression: suspended and viewer-blocked followers, withdrawn Catalog favorite (projection-kind aware: real Payload view or a suite-owned table).                                                 |
| B. Works total vs visible works                                                                             | NOT REPRODUCED                                                                                                                | Count and list use equivalent predicates for owner and third parties (experiment: 5/5 and 1/1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C. One sequence materializes all eligible content; cleanup bounds parents, not cascaded children            | CONFIRMED → partly FIXED IN CODE, partly NEEDS OWNER DECISION                                                                 | Measured: 1,600 rows / 13.9 ms / 456 kB per guest sequence at 2k works; 17,500 rows / 203 ms / 4.4 MB / 6.6 MB WAL at 20k works. Cleanup of 100 parents cascaded 1,750,000 rows in 431–607 ms with 244 MB WAL inside the request. Fixed: the sweep is now bounded by cascaded item rows, oldest sequences first, at most 100 parents per browse; it stops once 20,000 item rows have been counted, but the sequence in progress is deleted whole, so one browse may cascade the budget PLUS one whole sequence (not a strict 20,000-row maximum) and `discovery_sequences(created_at,id)` is indexed. First-page materialization size itself is unchanged and remains a separate unresolved scaling choice (per-viewer reuse window, rate limit or keyset snapshot: Owner decision 2 in §5). |
| C. Page read cost                                                                                           | CONFIRMED (new) → FIXED IN CODE                                                                                               | Every page joined the whole eligible set (5.8 ms guest / 17 ms signed-in at 2k works; 61 / 177 ms at 20k). The page read is now driven by the items index with per-item live eligibility (0.19–0.8 ms measured), same membership, order, LIMIT and withdrawal filtering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D. Indexes                                                                                                  | CONFIRMED → FIXED IN CODE (migration `20260916010000`)                                                                        | `follows` had only its primary key, so followers lists and totals scanned the whole table (Seq Scan, 286 buffers vs 13 with the index); `publishing_jobs` had no `(kind, subject_id)` index outside the queued/running partial index, so every draft save scanned the job table once per media item (191 ms at 20k jobs); `discovery_sequences` had no `created_at` index. Three indexes added; write cost is one extra entry per follow, job transition and first-page browse.                                                                                                                                                                                                                                                                                                              |
| D. N+1 reads                                                                                                | CONFIRMED → FIXED IN CODE                                                                                                     | `listWorks` issued two statements per work (now two per page, `revisionsMedia`); `listPeople` one avatar statement per row (now one per page); `readDiscussion` three reply statements per root and `ownComments` one work check per row plus one full Catalog detail read per item (now grouped statements and one batched published-ids read); the Admin comment queue evaluated the sibling-count subquery for every union row before `LIMIT` (185 ms at 25k rows; now computed for the page only).                                                                                                                                                                                                                                                                                       |
| E. Revision pointers, reply pointers, blob purge, retries, races                                            | NOT REPRODUCED (schema-enforced) except one path → FIXED IN CODE                                                              | Composite FKs bind `public_revision_id`/`author_revision_id` to the same work and reply pointers to the same thread; purge predicates refuse referenced blobs; receipts, attempt fences and version checks prevent double publish, double count and resurrection. Found and fixed: a conflict copy of a new work's draft kept `work_id NULL`, so a later recycle-bin purge deleted it without releasing its media references (orphaned refs, never-purged media). Submission now binds the copies to the work and the purge treats them as holders. Also fixed: a lock-order inversion between `openEditDraft` and `purgeTrashedWork` (deadlock reproduced with two connections) and the user-suspension / publication-policy audit rows, which were committed in a second transaction.      |
| F. Receipt tables lack timestamps; legacy `user_media` outside capacity; cleanup vs replay                  | CONFIRMED (metadata) → FIXED IN CODE (migration `20260916011000`); accounting → NEEDS OWNER DECISION; replay → NOT REPRODUCED | `discussion_command_receipts` and `content_operator_receipts` had no timestamp (author receipts had one); both gain a nullable `created_at` with a default for new rows only (existing rows stay NULL, no invented history) and the inserts name their columns. No receipt or audit row is ever deleted in code, so the replay window is unbounded and no unsafe cleanup exists; deleting a receipt would indeed re-execute create-type commands, which is why none is proposed. Legacy PNG bytes in PostgreSQL are intentionally retained and are not counted by publishing capacity; whether to display or count them is the Owner's call.                                                                                                                                                 |
| G. Comment attachments                                                                                      | NOT IMPLEMENTED (truthful)                                                                                                    | No contract field, storage association, upload route or authorization path exists; the live compositions render no media control or presentation (`live-comments.test.ts` pins the whole mapper output). No misleading enabled control was found. The future seam is documented in §4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| H. Recommendation semantics                                                                                 | NOT REPRODUCED for the rules; two usability defects → FIXED IN CODE; two orderings → NEEDS OWNER DECISION                     | Explicit work choice, explicit disable, inheritance for existing and future eligible public works, no exposure of private/pending-only/hidden/removed/trashed content, deterministic order and complete pagination all verified by SQL. Fixed: a recommendation created from the Works tab or bulk carried the inherited sentinel position 9007199254740991 and sorted among automatic rows; bulk cancel wrote explicit-disabled rows for never-recommended works. Owner decision: order among automatic rows (opaque id today). Recommended users hold no authority (no read path treats `featured_users` as permission).                                                                                                                                                                   |
| 5. Admin bulk state lost on leaving the view                                                                | CONFIRMED as usability, NOT data loss → FIXED IN CODE                                                                         | Pending bulk items (with their request identities) lived only in the bulk component and were dropped by a tab switch, although the same view already blocks navigation for a single unresolved command; server-side receipts and version checks meant no double application (a re-run yields truthful 409s). The view now treats pending bulk items like an unresolved single command: it blocks leaving the view while items are unresolved and offers an explicit discard. This is in-page state handling only, not a cross-page durable job center; a durable operation record is a separate design (Phase B).                                                                                                                                                                            |
| 6. Identity/authority coupling                                                                              | NOT REPRODUCED                                                                                                                | `featured_users`, `account_publishing_capacity.capacity_class`, `development_accounts` and the operator label grant no authority; no Payload column references a `PublicUserId` and no community table references Payload. Only a naming overlap (quota tier `owner`, operator label `owner`, Payload role `owner`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 3. Findings table

Severity as verified; "verdict" summarizes the independent lenses that completed
(code / reproduction / intent).

| Id      | Area           | Finding                                                                                 | Verdict                                                                              | Status                                                         |
| ------- | -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| A1      | grants         | Upgraded App role keeps table-level UPDATE on four tables                               | holds / holds / intent: Development-hygiene decision → Owner-authorized by this task | FIXED IN CODE, VERIFIED ON DISPOSABLE UPGRADE (RED/GREEN)      |
| A2      | grants         | `dev:migrate` never applies `grant-runtime.sql`                                         | holds ×3                                                                             | FIXED IN CODE (r2)                                             |
| A3      | grants         | Test cannot observe inherited privileges                                                | holds / intent: scope note                                                           | FIXED IN CODE (new test kind)                                  |
| A4      | grants         | `grant-community-app.sql` hard-codes role/database                                      | refuted (intentional local bootstrap)                                                | INTENTIONAL                                                    |
| A5      | grants         | Production README describes the 2A/2B set                                               | refuted as defect; two Owner-gated environments                                      | NEEDS OWNER DECISION (single Production model)                 |
| B-1/J-2 | counts         | Adapter totals looser than lists, discarded by an override (public totals were correct) | holds ×2                                                                             | FIXED IN CODE (adapter consolidation, redundant reads removed) |
| C-1     | discovery      | Page read scans all eligible rows                                                       | measured                                                                             | FIXED IN CODE                                                  |
| C-2     | discovery      | Cleanup bounded by parents only, inline                                                 | measured                                                                             | FIXED IN CODE                                                  |
| C-3/D8  | discovery      | No `created_at` index                                                                   | measured                                                                             | FIXED IN CODE (migration)                                      |
| C-4     | discovery      | Full materialization per anonymous first page                                           | measured                                                                             | NEEDS OWNER DECISION                                           |
| C-5/H-4 | recommendation | Automatic tier ordered by opaque id                                                     | holds / intent: documented tie rule                                                  | NEEDS OWNER DECISION                                           |
| C-6     | discovery      | Per-row `accounts_can_interact` for signed-in viewers                                   | measured                                                                             | NOT FIXED (cost only; set-based rewrite proposed)              |
| D1      | indexes        | `follows.followed_id` unindexed                                                         | measured                                                                             | FIXED IN CODE (migration)                                      |
| D2      | queue          | Sibling count per union row before LIMIT                                                | measured                                                                             | FIXED IN CODE                                                  |
| D3      | works          | Two statements per work in `listWorks`                                                  | code                                                                                 | FIXED IN CODE                                                  |
| D4      | discussion     | Three statements per root in `readDiscussion`                                           | code                                                                                 | FIXED IN CODE                                                  |
| D5      | discussion     | Per-row work check and per-item Catalog detail read in My Comments                      | code                                                                                 | FIXED IN CODE                                                  |
| D6      | people         | Avatar statement per row                                                                | code                                                                                 | FIXED IN CODE                                                  |
| D7      | jobs           | No open-job `(kind, subject_id)` index                                                  | measured                                                                             | FIXED IN CODE (migration)                                      |
| D9      | cleanup        | Media sweeps scan the corpus every 60 s                                                 | measured (0.25 s/min at 20k rows)                                                    | NEEDS OWNER DECISION (partial indexes or cadence)              |
| D10     | profile        | Totals recomputed through page reads                                                    | code                                                                                 | FIXED IN CODE (with B-1)                                       |
| E-1     | integrity      | Conflict copies outlive submission; purge orphans their refs                            | reproduced by SQL                                                                    | FIXED IN CODE                                                  |
| E-2     | integrity      | Suspend/reinstate and policy switch audited in a second transaction                     | code                                                                                 | FIXED IN CODE                                                  |
| E-3     | integrity      | Lock-order inversion `openEditDraft` vs `purgeTrashedWork`                              | deadlock reproduced                                                                  | FIXED IN CODE                                                  |
| E-4     | integrity      | Self→public under direct publication approves a previously rejected revision            | code                                                                                 | NEEDS OWNER DECISION                                           |
| F-1     | retention      | Two receipt tables without timestamps                                                   | schema                                                                               | FIXED IN CODE (migration)                                      |
| F-2     | retention      | Legacy `user_media` bytes outside capacity                                              | code                                                                                 | NEEDS OWNER DECISION                                           |
| F-3     | retention      | Per-account `reconcile_capacity` unreachable                                            | code                                                                                 | NEEDS OWNER DECISION (new operator command)                    |
| F-4     | retention      | `account_publishing_capacity.updated_at` is the designation time, shown as counter time | code                                                                                 | NOT FIXED (documented; additive metadata proposal)             |
| F-5     | retention      | Audit tables index only their key; mixed clock sources                                  | schema                                                                               | NOT FIXED (indexes only matter once a reader exists; see I-5)  |
| G-1     | attachments    | No test for "no media" in live compositions                                             | refuted (whole-shape mapper test exists)                                             | NOT REPRODUCED                                                 |
| H-1     | recommendation | Works-tab recommendations land at the sentinel position                                 | holds ×2                                                                             | FIXED IN CODE                                                  |
| H-2     | recommendation | Bulk cancel writes disabled rows for never-recommended works                            | holds / intent: explicit rows are documented                                         | FIXED IN CODE (client skips never-recommended works only)      |
| H-3     | recommendation | Admin shows ineligible works of a recommended author as recommended                     | code: intentional membership vs eligibility                                          | INTENTIONAL                                                    |
| I-1     | admin          | Pending bulk state lost on view change                                                  | code: usability / intent: holds                                                      | FIXED IN CODE                                                  |
| I-2     | admin          | Bulk recommend of a non-public work reported as a state conflict                        | code                                                                                 | FIXED IN CODE                                                  |
| I-3     | admin          | Definite refusals classified as unknown, no discard                                     | holds ×2                                                                             | FIXED IN CODE                                                  |
| I-4     | admin          | Bulk hide/remove re-applies the current state, bumping version and audit                | holds                                                                                | FIXED IN CODE                                                  |
| I-5     | admin          | Work-level operator actions have no readable history                                    | intent: product enhancement                                                          | NEEDS OWNER DECISION                                           |
| I-6     | admin          | Label inconsistencies                                                                   | code                                                                                 | FIXED IN CODE (visual gate)                                    |
| I-7     | admin          | Detail aside below the list on small screens; clipped menu                              | code                                                                                 | FIXED IN CODE (visual gate)                                    |
| I-8     | admin          | Native confirm for bulk hide/remove; misleading selection count                         | holds                                                                                | FIXED IN CODE (visual gate)                                    |
| I-9     | admin          | Excerpt splits surrogate pairs                                                          | code                                                                                 | FIXED IN CODE                                                  |
| J-1     | structure      | Two comment read implementations; Production runs the older one                         | reproduced by SQL                                                                    | NEEDS OWNER DECISION (documented in §4)                        |
| J-3     | structure      | Operator label defaulted in three services                                              | code                                                                                 | NOT FIXED (documented seam)                                    |
| J-4     | structure      | Dead exports                                                                            | code                                                                                 | FIXED IN CODE                                                  |
| J-5     | structure      | Own-branch predicate written five times, stale migration comment                        | code                                                                                 | NOT FIXED (documented)                                         |
| J-6     | structure      | `work_edit_drafts` / `works.media_ids` runtime-dead but retained                        | intentional                                                                          | INTENTIONAL                                                    |
| seed    | tooling        | `scripts/seed-phase4-support.mjs` cannot complete on current main                       | reproduced while provisioning                                                        | FIXED IN CODE (r2)                                             |

## 4. Data model, extension seam and future seams

Preserved boundaries: `PublicUserId` (`user-<32hex>`, opaque, immutable, 25
foreign keys) is the only identity key of the community namespace; Payload
operator accounts and public users share no table, column, cookie or login; the
Backend is the sole writer of community data; Catalog and UserWork remain
distinct domains joined only through published projections.

Extension points, without implementation:

- External login identities: a new table
  `community.user_identities(provider, provider_subject, user_id, verified_at, created_at)`
  keyed by `(provider, provider_subject)` with `UNIQUE (user_id, provider)`;
  never new columns on `public_users` (amendment §1); credential material stays
  out of every DTO.
- Certification / display identities:
  `community.user_certifications(user_id, kind, granted_by, granted_at, revoked_at)`;
  exposing a badge needs an Owner amendment because `PublicUserProfile`,
  `CommentAuthor` and the author DTOs are strict objects.
- Permission roles:
  `community.user_roles(user_id, role, granted_by, granted_at, revoked_at)`
  enforced only inside Backend services; a public user never maps to a Payload
  role, REST, MCP or CMS access.
- Contribution points / levels: an append-only
  `community.user_points_ledger(id, user_id, delta, reason, subject_kind, subject_id, occurred_at)`
  with a derived level.
- Capacity entitlements: today one CHECK enum (`ordinary | owner`) plus one
  settings column per class; a
  `community.capacity_classes(class, bytes, version)` lookup scales better and
  would let the quota tier drop the word `owner`, which today also names the
  operator label and the Payload role.
- Prerequisites shared by all of the above: the operator label must be one wired
  configuration (J-3); `discussion_command_receipts.actor_label` mixes `user-…`
  and `operator:<label>` and needs a documented prefix per principal before a
  third principal type exists; every addition is an append-only community
  migration applied with `APP_MIGRATION_DATABASE_URL`.

Recommended-user status and the `owner` capacity class are ordering and quota
facts only; no read path treats either as authority (verified).

Comment attachments (NOT IMPLEMENTED): the minimal future seam is a
`community.comment_attachments(id, comment_kind root|reply, comment_id, owner_id, media_item_id, position)`
row owned by the comment's author, media stored through the existing publishing
media items (private store, derivatives, `media_item_refs` holder kind
`comment`), visibility following the root/reply audience rules, moderation
through the existing comment edges (hiding a comment hides its attachments),
deletion as reference release with the orphan grace, and retention of references
to unavailable content as for works. It requires an Owner amendment (decision 5
of the Community V1 amendment hides unsupported upload controls).

Comment reads: Production serves `/v1/catalog/{id}/comments` through the Mission
2B SQL (`moderation='visible'` only), Development through the Phase 4 discussion
store (thread removal, body tombstones, blocking, author status). Every writer
of those Phase 4 states is composed only under `NODE_ENV=development`, so
nothing is exposed today; before Phase 4 states are promoted the two paths must
be unified (Owner decision J-1).

## 5. Owner decisions requested

1. Single App-role model for a future Production promotion of Phase 4 and
   publishing surfaces (A5).
2. A bound on discovery materialization for anonymous first-page requests
   (per-viewer reuse window, rate limit or keyset snapshot) (C-4).
3. Order inside the automatic recommendation tier: publication recency or the
   present opaque-id order (C-5/H-4).
4. Whether a self→public toggle under direct publication may re-approve a
   previously rejected revision without a new submission (E-4).
5. Whether legacy PNG bytes are displayed beside or counted in publishing
   capacity (F-2), and whether per-account capacity reconciliation becomes an
   audited operator action (F-3).
6. Whether work-level operator actions become readable in Admin (I-5).
7. Unify the comment read paths now or freeze the split until promotion (J-1).
8. Media cleanup sweep cost: partial indexes or a lower cadence (D9).

## 6. Retained targets: dated observations and per-target plans (nothing applied)

Everything in this section is either a dated read-only observation or a plan. No
migration, GRANT/REVOKE, cleanup, release or rollback has been run on any
retained database under this task, and none is scheduled by this record; each
plan below runs only after a separate, concrete Owner confirmation for that one
target. Endpoints, credentials and access paths stay in the private artifacts.

### 6.1 Dated observations (read-only, 2026-09-16T02:34Z–02:44Z)

Inspected with bounded metadata statements only (aggregates, ledgers, ACLs,
invariant counts; no user text, media bytes or session hashes), as the bootstrap
owner role through the container-local socket with the session forced read-only.
Containers that the machine reboot had stopped were started for the inspection
and returned to their stopped state. These are observations at that time, not
current runtime proof: a retained database may have changed since, so every plan
re-captures its facts first. Two bounded local inspections say nothing about the
uninspected compose.dev and TencentDB targets, and they cover the listed
invariants only, not every possible one.

| Target                                                                     | Observed at       | Ledger observed                                                                                                   | Projection kind                                                                                                | App-role privileges observed                                                                                                          | Invariants observed                                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publishing acceptance database (work-publishing-v1, Owner acceptance data) | 2026-09-16T02:34Z | 14 community migrations (`20260912030000` … `20260915010000`), checksums equal the manifest; 6 Payload migrations | real Payload view (`20260913_064000_discovery_publication` present in the Payload ledger; 7 views in `public`) | column-level UPDATE only; DELETE on the 10 runtime tables; **no table-level UPDATE residue** (provisioned with the runtime plan only) | pointer/thread/ref/blob/block counts all 0 mismatches; 0 invalid indexes; 0 NOT VALID constraints | PostgreSQL 18.4, 27 MB; `discovery_sequence_items` largest (5,994 live + 481 dead rows, 95 sequences). Media evidence: 835 committed blobs matched the private store in aggregate file count and byte total; 12 sampled committed files checked for existence and byte size (equal); 6 sampled purged files checked absent. This is not a full-file content comparison; the `sha256` column exists on `media_blobs` but no file hash was recomputed or compared. |
| Phase 4 acceptance database (historical)                                   | 2026-09-16T02:36Z | 8 community migrations (through `20260913120000`); no publishing tables                                           | UNKNOWN (not captured)                                                                                         | DELETE on 5 relation tables; no table-level UPDATE                                                                                    | 0 mismatches on the applicable checks                                                             | 423 sequences / 7,658 items for 10 works; legacy PNG bytes in `user_media`                                                                                                                                                                                                                                                                                                                                                                                       |
| compose.dev `yoyi_dev` (`docs/development.md` path)                        | attempt 02:35Z    | UNKNOWN                                                                                                           | UNKNOWN                                                                                                        | UNKNOWN (a `dev:migrate` bootstrap would have left the Mission 2A/2B table-level UPDATEs; unverified)                                 | UNKNOWN                                                                                           | NOT TESTED: the container cannot start (bind-mount source gone); its volume was not touched and no repair was attempted for this report                                                                                                                                                                                                                                                                                                                          |
| Partner-account TencentDB (Stage B)                                        | —                 | UNKNOWN                                                                                                           | UNKNOWN                                                                                                        | UNKNOWN                                                                                                                               | UNKNOWN                                                                                           | NOT TESTED: reachable only through the CVM with the Owner's access; reading those records was refused by the session policy; no new cloud, SSH or credential access is authorized by this task                                                                                                                                                                                                                                                                   |

### 6.2 What this hardening checkpoint changes on an active database

Separate from any later agent-administration schema (Phase B, recorded in
`agent-admin-v1.md` when it exists; not part of these plans):

- Forward community migrations `20260916010000_community_access_indexes.sql`
  (three indexes on `follows`, `publishing_jobs`, `discovery_sequences`) and
  `20260916011000_receipt_timestamps.sql` (nullable `created_at` with a default
  for new rows on `discussion_command_receipts`, `content_operator_receipts`),
  identified by name and manifest checksum (`3e19ec9a…12b2d876`,
  `87555ee7…23791ebdb2f79d`). The runner applies each file in its own
  transaction; the indexes are plain `CREATE INDEX` (a SHARE lock on the table
  for the duration, which blocks writers), so they are applied while the Backend
  is stopped. No extension is required.
- The converging runtime grant
  `infra/development/work-publishing/grant-runtime.sql` applied as one
  transaction (`psql --single-transaction -v ON_ERROR_STOP=1`). Expected ACL
  delta on a role provisioned by the runtime plan only: none; on a role
  bootstrapped by `grant-community-app.sql`: the table-level UPDATE on
  `sessions`, `catalog_comments`, `catalog_comment_replies`,
  `publication_setting` is removed and the column lists are re-granted. The
  actual delta must be captured before and after with `aclexplode`, never
  assumed.
- A rebuilt Backend from the checkpoint head.

### 6.3 Plan: publishing acceptance database

Applicable only if a fresh read-only inventory confirms the dated observation:
base ledger = the 14 migrations above with equal checksums, target = 16; ordered
pending = `20260916010000`, `20260916011000` (each depends only on tables
present at base). Facts to re-capture first: the projection kind of
`catalog_discovery` (observed as the real Payload view; the repaired profile
read requires it), the Backend build in service, and the current `aclexplode`
set of the App role.

Steps, each with a stop condition:

1. Stop the Backend and worker; confirm no other sessions on the database (stop
   if any remain).
2. Consistent backup `pg_dump -Fc` of the database, plus a separate capture of
   roles and effective ACLs (`pg_dumpall --roles-only` and the `aclexplode`
   listing for the App role) so privileges can be reviewed independently of the
   data dump.
3. Isolated restore proof of that dump on a disposable server (ledger row count
   and checksums equal; stop if not).
4. Read-only inventory: ledger equals the base above (stop on any different id
   or checksum), App-role set equals the captured expectation, E-1 selectors
   from §6.7 counted (numbers recorded, nothing released).
5. Apply the two migrations with `pnpm db:migrate:community` as the migration
   role (stop on any runner error; the failed file's transaction rolls back and
   the ledger stays at base).
6. Apply `grant-runtime.sql` with
   `psql -v ON_ERROR_STOP=1 --single-transaction -v app_role=<app role>`;
   compare the post-run `aclexplode` set with the expected delta (stop and
   report if any other change appears).
7. Start the rebuilt Backend; re-run the read-only health statements; confirm
   readiness and one profile read through the real projection.

### 6.4 Plan: Phase 4 acceptance database (historical)

Decision for this task: leave it unchanged as historical acceptance evidence. It
is 8 migrations behind (base through `20260913120000`), so the hardening
migrations are not directly applicable: the six work-publishing migrations
(`20260914090000` … `20260915010000`) would have to precede them, with the
legacy backfill/bridge steps reviewed against that database's data. No plan is
proposed; if the Owner ever wants it upgraded, a fresh read-only inventory and a
dedicated plan come first.

### 6.5 Plan: compose.dev `yoyi_dev`

UNKNOWN in every column; not testable from this task. Future read-only
prerequisite: restore the container's bind-mount source (an Owner action outside
this task), then run the private read-only health statements to capture ledger,
projection kind, roles and the App-role ACL. Only then can pending migrations
and the grant delta be stated. Expectation to verify, not to assume: a database
bootstrapped by `pnpm dev:migrate` before this task holds the four table-level
UPDATEs that the converging grant removes.

### 6.6 Plan: TencentDB (Stage B)

UNKNOWN in every column; NOT TESTED. Future read-only prerequisite: the Owner
runs the private read-only health statements on the CVM as the read-only role
and shares the resulting text; no cloud, SSH or credential access is requested
or authorized by this task. No migration or grant applicability can be stated
before that inventory.

### 6.7 Orphan-reference release: a separate data mutation (not scheduled)

Finding E-1 (conflict copies of a new work's draft outliving submission, so a
later recycle-bin purge could delete the draft without releasing its media
references) is fixed in code for new submissions. Rows created before the fix
may exist on a retained database. Releasing them is a distinct mutation with its
own confirmation, never part of the migration/grant steps above.

- Selectors (read-only count first, executed against `community`):
  `media_item_refs` rows with `holder_kind='draft'` whose `holder_id` has no row
  in `work_drafts` (orphaned by a purge that predates the fix); and
  `work_drafts` rows with `conflict_of IS NOT NULL AND work_id IS NULL` whose
  `conflict_of` draft has been submitted (the pre-fix conflict copies that the
  purge would orphan next).
- Expected rows: UNKNOWN until the selectors run; on the publishing acceptance
  database the ref-to-missing-item check was 0 at 02:34Z, but the holder-side
  selector above was not part of that inspection. Bound each release statement
  with an explicit id list and `LIMIT`, and record the count before and after.
- Reference/holder checks: a ref is released only when its holder row is absent
  (first selector) or when the copy is re-parented to its work (second selector:
  `UPDATE work_drafts SET work_id=<work>` mirroring the fixed submission path,
  which makes the purge treat the copy as a holder; no ref is deleted for it).
- Concurrency: run with the Backend stopped or with the selected `work_drafts`
  rows locked `FOR UPDATE`, so a concurrent purge or submission cannot
  interleave.
- Lifecycle effect: a released ref makes its media item eligible for the
  existing orphan grace and purge sweep; no `media_items`, `media_blobs` or
  store file is deleted by the release itself.
- Recovery evidence: the selected rows are captured to a private file before the
  statement; recovery is re-inserting the captured rows (no other state
  changes).

### 6.8 Rollback policy

Compatible application rollback: restart the previous Backend build; the two
migrations' columns and indexes stay in place (the previous code ignores them)
and any `created_at` values collected meanwhile are kept. Later corrections are
reviewed forward migrations, never a drop. The converged grant is not re-widened
with the bootstrap script: that would silently reinstate the table-level UPDATEs
this task removes. Exceptional privilege recovery uses only the captured,
reviewed `aclexplode` difference from step 2, applied statement by statement
under a separate Owner decision. Backward compatibility of future migrations is
checked per migration, not promised here.

## 7. Verification

Recorded in the Draft PR: the actual-diff verification entry, the PostgreSQL
suites on the disposable server (App-role kinds clean / phase4-upgrade /
legacy-grants-upgrade, upgrade, community cases), unit and architecture tests,
Admin typecheck and lint, and the synthetic Admin walkthrough with before/after
screenshots. Owner visual acceptance is pending for the Admin usability changes
(I-1, I-2, I-3, I-6, I-7, I-8, H-1, H-2); everything else is machine-verifiable.
