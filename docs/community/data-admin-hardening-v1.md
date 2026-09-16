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

| Prior concern                                                                                               | Status                                                                                                                        | Current-code evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Narrow column GRANTs do not remove an earlier broad table grant; the upgrade test recreates a fresh role | CONFIRMED → FIXED IN CODE                                                                                                     | A role that received `grant-community-app.sql` and then `grant-runtime.sql` kept table-level `UPDATE` on `sessions`, `catalog_comments`, `catalog_comment_replies`, `publication_setting` (aclexplode diff; non-listed columns updatable). `grant-runtime.sql` now revokes exactly the table-level privileges it grants at column level before re-granting; the App-role test gained a `legacy-grants-upgrade` kind that applies the old set to the SAME role and asserts the effective set equals a fresh role's (RED on the original script, GREEN now).                                                                                                                                                                                                                              |
| A. `dev:migrate` applies only the Mission 2A/2B grants                                                      | CONFIRMED (new) → FIXED IN CODE (r2)                                                                                          | `package.json` `dev:migrate` never applied `grant-runtime.sql`; a developer following `docs/development.md` got an App role without any Phase 4/publishing grant. The command now applies the converging runtime grant after the bootstrap; `compose.dev.yml` mounts it; `current-truth-config.test.ts` pins the chain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| A. Effective permissions: PUBLIC grants, memberships, ownership, SECURITY DEFINER                           | NOT REPRODUCED (no defect)                                                                                                    | All ten community functions are SECURITY INVOKER; PUBLIC EXECUTE is the PostgreSQL default and the five adapter-called functions are granted explicitly; no default ACLs, no role memberships, every relation owned by the migration role. Verified on the disposable server and on the two retained targets.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| B. Withdrawn Catalog relations counted but not listed; suspended/blocked accounts counted but not listed    | ALREADY FIXED at the DTO layer since #126; residual divergence → FIXED IN CODE                                                | The service override replaced the adapter's four raw totals with list totals whenever a discovery port was composed (always, in the shipped composition). The adapter's `readProfile` now computes the totals with the list predicates in one snapshot (people: active + interactable; relations: published Catalog record or effectively public work) and the override is removed, which also removes ~15 redundant statements per profile read. Regression: suspended and viewer-blocked followers, withdrawn Catalog favorite.                                                                                                                                                                                                                                                       |
| B. Works total vs visible works                                                                             | NOT REPRODUCED                                                                                                                | Count and list use equivalent predicates for owner and third parties (experiment: 5/5 and 1/1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| C. One sequence materializes all eligible content; cleanup bounds parents, not cascaded children            | CONFIRMED → partly FIXED IN CODE, partly NEEDS OWNER DECISION                                                                 | Measured: 1,600 rows / 13.9 ms / 456 kB per guest sequence at 2k works; 17,500 rows / 203 ms / 4.4 MB / 6.6 MB WAL at 20k works. Cleanup of 100 parents cascaded 1,750,000 rows in 431–607 ms with 244 MB WAL inside the request. Fixed: the sweep is now bounded by cascaded item rows (20,000 per browse, oldest first, at most 100 parents) and `discovery_sequences(created_at,id)` is indexed. The materialization size itself is the accepted Phase 4 design ("snapshot sequence"); a bound (per-viewer reuse window, rate limit or keyset snapshot) is the Owner's decision (§5).                                                                                                                                                                                                |
| C. Page read cost                                                                                           | CONFIRMED (new) → FIXED IN CODE                                                                                               | Every page joined the whole eligible set (5.8 ms guest / 17 ms signed-in at 2k works; 61 / 177 ms at 20k). The page read is now driven by the items index with per-item live eligibility (0.19–0.8 ms measured), same membership, order, LIMIT and withdrawal filtering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D. Indexes                                                                                                  | CONFIRMED → FIXED IN CODE (migration `20260916010000`)                                                                        | `follows` had only its primary key, so followers lists and totals scanned the whole table (Seq Scan, 286 buffers vs 13 with the index); `publishing_jobs` had no `(kind, subject_id)` index outside the queued/running partial index, so every draft save scanned the job table once per media item (191 ms at 20k jobs); `discovery_sequences` had no `created_at` index. Three indexes added; write cost is one extra entry per follow, job transition and first-page browse.                                                                                                                                                                                                                                                                                                         |
| D. N+1 reads                                                                                                | CONFIRMED → FIXED IN CODE                                                                                                     | `listWorks` issued two statements per work (now two per page, `revisionsMedia`); `listPeople` one avatar statement per row (now one per page); `readDiscussion` three reply statements per root and `ownComments` one work check per row plus one full Catalog detail read per item (now grouped statements and one batched published-ids read); the Admin comment queue evaluated the sibling-count subquery for every union row before `LIMIT` (185 ms at 25k rows; now computed for the page only).                                                                                                                                                                                                                                                                                  |
| E. Revision pointers, reply pointers, blob purge, retries, races                                            | NOT REPRODUCED (schema-enforced) except one path → FIXED IN CODE                                                              | Composite FKs bind `public_revision_id`/`author_revision_id` to the same work and reply pointers to the same thread; purge predicates refuse referenced blobs; receipts, attempt fences and version checks prevent double publish, double count and resurrection. Found and fixed: a conflict copy of a new work's draft kept `work_id NULL`, so a later recycle-bin purge deleted it without releasing its media references (orphaned refs, never-purged media). Submission now binds the copies to the work and the purge treats them as holders. Also fixed: a lock-order inversion between `openEditDraft` and `purgeTrashedWork` (deadlock reproduced with two connections) and the user-suspension / publication-policy audit rows, which were committed in a second transaction. |
| F. Receipt tables lack timestamps; legacy `user_media` outside capacity; cleanup vs replay                  | CONFIRMED (metadata) → FIXED IN CODE (migration `20260916011000`); accounting → NEEDS OWNER DECISION; replay → NOT REPRODUCED | `discussion_command_receipts` and `content_operator_receipts` had no timestamp (author receipts had one); both gain a nullable `created_at` with a default for new rows only (existing rows stay NULL, no invented history) and the inserts name their columns. No receipt or audit row is ever deleted in code, so the replay window is unbounded and no unsafe cleanup exists; deleting a receipt would indeed re-execute create-type commands, which is why none is proposed. Legacy PNG bytes in PostgreSQL are intentionally retained and are not counted by publishing capacity; whether to display or count them is the Owner's call.                                                                                                                                            |
| G. Comment attachments                                                                                      | NOT IMPLEMENTED (truthful)                                                                                                    | No contract field, storage association, upload route or authorization path exists; the live compositions render no media control or presentation (`live-comments.test.ts` pins the whole mapper output). No misleading enabled control was found. The future seam is documented in §4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| H. Recommendation semantics                                                                                 | NOT REPRODUCED for the rules; two usability defects → FIXED IN CODE; two orderings → NEEDS OWNER DECISION                     | Explicit work choice, explicit disable, inheritance for existing and future eligible public works, no exposure of private/pending-only/hidden/removed/trashed content, deterministic order and complete pagination all verified by SQL. Fixed: a recommendation created from the Works tab or bulk carried the inherited sentinel position 9007199254740991 and sorted among automatic rows; bulk cancel wrote explicit-disabled rows for never-recommended works. Owner decision: order among automatic rows (opaque id today). Recommended users hold no authority (no read path treats `featured_users` as permission).                                                                                                                                                              |
| 5. Admin bulk state lost on leaving the view                                                                | CONFIRMED as usability, NOT data loss → FIXED IN CODE                                                                         | Pending bulk items (with their request identities) lived only in the bulk component and were dropped by a tab switch, although the same view already blocks navigation for a single unresolved command; server-side receipts and version checks meant no double application (a re-run yields truthful 409s). The view now treats pending bulk items like an unresolved single command and offers an explicit discard.                                                                                                                                                                                                                                                                                                                                                                   |
| 6. Identity/authority coupling                                                                              | NOT REPRODUCED                                                                                                                | `featured_users`, `account_publishing_capacity.capacity_class`, `development_accounts` and the operator label grant no authority; no Payload column references a `PublicUserId` and no community table references Payload. Only a naming overlap (quota tier `owner`, operator label `owner`, Payload role `owner`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 3. Findings table

Severity as verified; "verdict" summarizes the independent lenses that completed
(code / reproduction / intent).

| Id      | Area           | Finding                                                                                 | Verdict                                                                              | Status                                                        |
| ------- | -------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| A1      | grants         | Upgraded App role keeps table-level UPDATE on four tables                               | holds / holds / intent: Development-hygiene decision → Owner-authorized by this task | FIXED IN CODE, VERIFIED ON DISPOSABLE UPGRADE (RED/GREEN)     |
| A2      | grants         | `dev:migrate` never applies `grant-runtime.sql`                                         | holds ×3                                                                             | FIXED IN CODE (r2)                                            |
| A3      | grants         | Test cannot observe inherited privileges                                                | holds / intent: scope note                                                           | FIXED IN CODE (new test kind)                                 |
| A4      | grants         | `grant-community-app.sql` hard-codes role/database                                      | refuted (intentional local bootstrap)                                                | INTENTIONAL                                                   |
| A5      | grants         | Production README describes the 2A/2B set                                               | refuted as defect; two Owner-gated environments                                      | NEEDS OWNER DECISION (single Production model)                |
| B-1/J-2 | counts         | Adapter totals looser than lists, discarded by an override                              | holds ×2                                                                             | FIXED IN CODE                                                 |
| C-1     | discovery      | Page read scans all eligible rows                                                       | measured                                                                             | FIXED IN CODE                                                 |
| C-2     | discovery      | Cleanup bounded by parents only, inline                                                 | measured                                                                             | FIXED IN CODE                                                 |
| C-3/D8  | discovery      | No `created_at` index                                                                   | measured                                                                             | FIXED IN CODE (migration)                                     |
| C-4     | discovery      | Full materialization per anonymous first page                                           | measured                                                                             | NEEDS OWNER DECISION                                          |
| C-5/H-4 | recommendation | Automatic tier ordered by opaque id                                                     | holds / intent: documented tie rule                                                  | NEEDS OWNER DECISION                                          |
| C-6     | discovery      | Per-row `accounts_can_interact` for signed-in viewers                                   | measured                                                                             | NOT FIXED (cost only; set-based rewrite proposed)             |
| D1      | indexes        | `follows.followed_id` unindexed                                                         | measured                                                                             | FIXED IN CODE (migration)                                     |
| D2      | queue          | Sibling count per union row before LIMIT                                                | measured                                                                             | FIXED IN CODE                                                 |
| D3      | works          | Two statements per work in `listWorks`                                                  | code                                                                                 | FIXED IN CODE                                                 |
| D4      | discussion     | Three statements per root in `readDiscussion`                                           | code                                                                                 | FIXED IN CODE                                                 |
| D5      | discussion     | Per-row work check and per-item Catalog detail read in My Comments                      | code                                                                                 | FIXED IN CODE                                                 |
| D6      | people         | Avatar statement per row                                                                | code                                                                                 | FIXED IN CODE                                                 |
| D7      | jobs           | No open-job `(kind, subject_id)` index                                                  | measured                                                                             | FIXED IN CODE (migration)                                     |
| D9      | cleanup        | Media sweeps scan the corpus every 60 s                                                 | measured (0.25 s/min at 20k rows)                                                    | NEEDS OWNER DECISION (partial indexes or cadence)             |
| D10     | profile        | Totals recomputed through page reads                                                    | code                                                                                 | FIXED IN CODE (with B-1)                                      |
| E-1     | integrity      | Conflict copies outlive submission; purge orphans their refs                            | reproduced by SQL                                                                    | FIXED IN CODE                                                 |
| E-2     | integrity      | Suspend/reinstate and policy switch audited in a second transaction                     | code                                                                                 | FIXED IN CODE                                                 |
| E-3     | integrity      | Lock-order inversion `openEditDraft` vs `purgeTrashedWork`                              | deadlock reproduced                                                                  | FIXED IN CODE                                                 |
| E-4     | integrity      | Self→public under direct publication approves a previously rejected revision            | code                                                                                 | NEEDS OWNER DECISION                                          |
| F-1     | retention      | Two receipt tables without timestamps                                                   | schema                                                                               | FIXED IN CODE (migration)                                     |
| F-2     | retention      | Legacy `user_media` bytes outside capacity                                              | code                                                                                 | NEEDS OWNER DECISION                                          |
| F-3     | retention      | Per-account `reconcile_capacity` unreachable                                            | code                                                                                 | NEEDS OWNER DECISION (new operator command)                   |
| F-4     | retention      | `account_publishing_capacity.updated_at` is the designation time, shown as counter time | code                                                                                 | NOT FIXED (documented; additive metadata proposal)            |
| F-5     | retention      | Audit tables index only their key; mixed clock sources                                  | schema                                                                               | NOT FIXED (indexes only matter once a reader exists; see I-5) |
| G-1     | attachments    | No test for "no media" in live compositions                                             | refuted (whole-shape mapper test exists)                                             | NOT REPRODUCED                                                |
| H-1     | recommendation | Works-tab recommendations land at the sentinel position                                 | holds ×2                                                                             | FIXED IN CODE                                                 |
| H-2     | recommendation | Bulk cancel writes disabled rows for never-recommended works                            | holds / intent: explicit rows are documented                                         | FIXED IN CODE (client skips never-recommended works only)     |
| H-3     | recommendation | Admin shows ineligible works of a recommended author as recommended                     | code: intentional membership vs eligibility                                          | INTENTIONAL                                                   |
| I-1     | admin          | Pending bulk state lost on view change                                                  | code: usability / intent: holds                                                      | FIXED IN CODE                                                 |
| I-2     | admin          | Bulk recommend of a non-public work reported as a state conflict                        | code                                                                                 | FIXED IN CODE                                                 |
| I-3     | admin          | Definite refusals classified as unknown, no discard                                     | holds ×2                                                                             | FIXED IN CODE                                                 |
| I-4     | admin          | Bulk hide/remove re-applies the current state, bumping version and audit                | holds                                                                                | FIXED IN CODE                                                 |
| I-5     | admin          | Work-level operator actions have no readable history                                    | intent: product enhancement                                                          | NEEDS OWNER DECISION                                          |
| I-6     | admin          | Label inconsistencies                                                                   | code                                                                                 | FIXED IN CODE (visual gate)                                   |
| I-7     | admin          | Detail aside below the list on small screens; clipped menu                              | code                                                                                 | FIXED IN CODE (visual gate)                                   |
| I-8     | admin          | Native confirm for bulk hide/remove; misleading selection count                         | holds                                                                                | FIXED IN CODE (visual gate)                                   |
| I-9     | admin          | Excerpt splits surrogate pairs                                                          | code                                                                                 | FIXED IN CODE                                                 |
| J-1     | structure      | Two comment read implementations; Production runs the older one                         | reproduced by SQL                                                                    | NEEDS OWNER DECISION (documented in §4)                       |
| J-3     | structure      | Operator label defaulted in three services                                              | code                                                                                 | NOT FIXED (documented seam)                                   |
| J-4     | structure      | Dead exports                                                                            | code                                                                                 | FIXED IN CODE                                                 |
| J-5     | structure      | Own-branch predicate written five times, stale migration comment                        | code                                                                                 | NOT FIXED (documented)                                        |
| J-6     | structure      | `work_edit_drafts` / `works.media_ids` runtime-dead but retained                        | intentional                                                                          | INTENTIONAL                                                   |
| seed    | tooling        | `scripts/seed-phase4-support.mjs` cannot complete on current main                       | reproduced while provisioning                                                        | FIXED IN CODE (r2)                                            |

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

## 6. Retained-target health (read-only) and application plan

Inspected with bounded metadata statements only, as the bootstrap owner role
through the container-local socket, session forced read-only; containers that
the machine reboot had stopped were started for the inspection and returned to
their stopped state. Full outputs are private.

| Target                                                                                  | Observed                           | Ledger                                                            | Privileges                                                                                                                                      | Invariants                                                                                            | Notes                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development acceptance database (work-publishing-v1, Owner acceptance data), port 54351 | 2026-09-16T02:34Z, PostgreSQL 18.4 | 14 community + 6 Payload migrations, checksums equal the manifest | App role: column-level UPDATE only, DELETE on the 10 runtime tables; **no table-level UPDATE residue** (provisioned with the runtime plan only) | pointer/thread/ref/blob/block invariants all 0 mismatches; 0 invalid indexes; 0 NOT VALID constraints | 27 MB; `discovery_sequence_items` largest (5,994 live + 481 dead rows, 95 sequences); 835 committed blobs match the private store file count and byte total exactly; 12-blob sample present with exact sizes, 6 purged absent |
| Phase 4 acceptance database, port 54341                                                 | 2026-09-16T02:36Z                  | 8 community migrations                                            | DELETE on 5 tables, no table-level UPDATE                                                                                                       | 0 mismatches                                                                                          | 423 sequences / 7,658 items for 10 works                                                                                                                                                                                      |
| compose.dev `yoyi_dev`, port 54330                                                      | not inspected                      | —                                                                 | —                                                                                                                                               | —                                                                                                     | NOT TESTED: container cannot start (bind-mount source gone); volume untouched. This is the target where the `dev:migrate` bootstrap residue would exist.                                                                      |
| Partner-account TencentDB (Stage B)                                                     | not inspected                      | —                                                                 | —                                                                                                                                               | —                                                                                                     | NOT TESTED: reachable only through the CVM with the Owner's SSH access; reading those access records was refused by the session policy.                                                                                       |

NOT YET APPLIED TO RETAINED TARGET — plan for each retained database, to be run
only after a separate Owner confirmation:

1. Prerequisite: a fresh consistent backup (`pg_dump -Fc`) of the target and an
   isolated restore check, as the work-publishing closure did.
2. Inspection first (read-only): the App role's `aclexplode` set compared with
   the runtime plan; the E-1 queries (`media_item_refs` rows whose draft holder
   no longer exists; active conflict copies of submitted new-work drafts).
3. Apply the two forward migrations `20260916010000` and `20260916011000` with
   `pnpm db:migrate:community` (migration role); they add indexes and nullable
   columns only and are reversible by dropping them.
4. Apply `infra/development/work-publishing/grant-runtime.sql` with
   `-v app_role=<app role>`; effective change on 54351/54341: none beyond the
   already-held set (verified read-only); on a `dev:migrate`-bootstrapped
   database: the four table-level UPDATEs are removed.
5. Release any orphaned references found in step 2 through a one-off reviewed
   statement mirroring `releaseHolderRefs` (never delete media rows).
6. Restart the Backend on the rebuilt code; re-run the read-only inspection.

Rollback: drop the three indexes and the two columns; grants can be re-widened
with the bootstrap script; no data is rewritten by any step.

## 7. Verification

Recorded in the Draft PR: the actual-diff verification entry, the PostgreSQL
suites on the disposable server (App-role kinds clean / phase4-upgrade /
legacy-grants-upgrade, upgrade, community cases), unit and architecture tests,
Admin typecheck and lint, and the synthetic Admin walkthrough with before/after
screenshots. Owner visual acceptance is pending for the Admin usability changes
(I-1, I-2, I-3, I-6, I-7, I-8, H-1, H-2); everything else is machine-verifiable.
