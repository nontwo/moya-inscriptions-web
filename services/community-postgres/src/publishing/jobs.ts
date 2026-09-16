import type {
  PublishingBlobUnlink,
  PublishingCleanupCounts,
  PublishingDeriveEditPayload,
  PublishingJobClaim,
  PublishingJobClaimOptions,
  PublishingJobEnqueue,
  PublishingJobEnqueued,
  PublishingJobFailure,
  PublishingJobFailureOptions,
  PublishingJobLease,
  PublishingPurgePlan,
} from "@moya/api";
import type { PublishingJobKind } from "@moya/contracts/internal/community-operator";
import type { Pool } from "pg";

import {
  lockCapacity,
  nowParam,
  opaqueId,
  safeInteger,
  writeTransaction,
  type PublishingDb,
} from "./db.js";

/*
 * The durable job queue (claim, lease renewal, completion, failure with
 * backoff, requeue, enqueue, cleanup scheduling) and the purge primitives.
 * Owner: B1a. Each exported port function implements the same-named
 * WorkPublishingPort method (see its JSDoc in @moya/api); `pool` is the
 * adapter's pool. Shared helpers: ./db.ts.
 *
 * Lock order of every publishing transaction (never reversed):
 * actor → holder (draft or session) → item → blob → component → capacity.
 */

const JOB_SUBJECT = /^[a-z0-9][a-z0-9-]{0,127}$/u;
const JOB_ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/u;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 60 * 60 * 1_000;
/** Tombstoned or released blobs wait this long before a sweep plans their purge. */
const BLOB_PURGE_DELAY_SQL = "interval '1 hour'";
/** Succeeded job rows are kept this long for operator inspection, then deleted. */
const SUCCEEDED_JOB_RETENTION_SQL = "interval '7 days'";

/** A new opaque job id inside set-based inserts. */
const jobIdSql =
  "'publishing-job-' || replace(gen_random_uuid()::text, '-', '')";

/** The `publishing_jobs_active_unique` conflict target. */
const activeJobConflict =
  "ON CONFLICT (kind, subject_id, md5(COALESCE(payload, '{}'::jsonb)::text)) WHERE state IN ('queued', 'running') DO NOTHING";

/** Retry delay after the given (already counted) attempt: 30 s × 2^(attempts − 1), at most 1 h. */
export const jobBackoffMs = (attempts: number): number =>
  Math.min(
    BACKOFF_BASE_MS * 2 ** Math.min(Math.max(attempts - 1, 0), 20),
    BACKOFF_MAX_MS,
  );

interface JobRow {
  id: string;
  kind: PublishingJobKind;
  subject_id: string;
  payload: PublishingDeriveEditPayload | null;
  attempts: number;
  max_attempts: number;
  run_after: Date;
  lease_owner: string;
  lease_expires_at: Date;
}

const claimOf = (row: JobRow): PublishingJobClaim => ({
  id: row.id,
  kind: row.kind,
  subjectId: row.subject_id,
  payload: row.payload,
  attempts: row.attempts,
  maxAttempts: row.max_attempts,
  leaseOwner: row.lease_owner,
  leaseExpiresAt: row.lease_expires_at,
});

const assertLeaseMs = (leaseMs: number): void => {
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1)
    throw new TypeError("A positive lease duration is required");
};

/**
 * Enqueues one job inside the caller's transaction. An equal queued or
 * running job (kind, subject, payload) is reused and its id returned.
 */
export const insertJob = async (
  db: PublishingDb,
  job: PublishingJobEnqueue,
  now: Date,
): Promise<PublishingJobEnqueued> => {
  if (!JOB_SUBJECT.test(job.subjectId))
    throw new TypeError("Job subject is not a content-free identifier");
  if (
    job.maxAttempts !== undefined &&
    (!Number.isSafeInteger(job.maxAttempts) ||
      job.maxAttempts < 1 ||
      job.maxAttempts > 1000)
  )
    throw new TypeError("Job attempts must be within 1..1000");
  const at = nowParam(now);
  const runAfter = nowParam(job.runAfter ?? now);
  const payload =
    job.payload === undefined || job.payload === null
      ? null
      : JSON.stringify(job.payload);
  const withAttempts = job.maxAttempts !== undefined;
  // A concurrent completion can free the unique slot between both statements.
  for (let round = 0; round < 3; round += 1) {
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO community.publishing_jobs(id,kind,subject_id,payload,state,attempts,run_after,created_at,updated_at${withAttempts ? ",max_attempts" : ""})
       VALUES($1,$2,$3,$4::jsonb,'queued',0,$5::timestamptz,$6::timestamptz,$6::timestamptz${withAttempts ? ",$7" : ""})
       ${activeJobConflict}
       RETURNING id`,
      [
        opaqueId("publishing-job"),
        job.kind,
        job.subjectId,
        payload,
        runAfter,
        at,
        ...(withAttempts ? [job.maxAttempts] : []),
      ],
    );
    const created = inserted.rows[0];
    if (created !== undefined) return { id: created.id, created: true };
    const existing = (
      await db.query<{ id: string }>(
        `SELECT id FROM community.publishing_jobs
         WHERE kind=$1 AND subject_id=$2 AND state IN ('queued','running')
           AND md5(COALESCE(payload,'{}'::jsonb)::text)=md5(COALESCE($3::jsonb,'{}'::jsonb)::text)`,
        [job.kind, job.subjectId, payload],
      )
    ).rows[0];
    if (existing !== undefined) return { id: existing.id, created: false };
  }
  throw new Error("Publishing job could not be enqueued");
};

/**
 * Moves one account's committed and reserved bytes under its capacity row
 * lock (the row is created lazily). Counters never drop below zero; the
 * operator designation version is not touched by accounting.
 */
export const adjustCapacity = async (
  db: PublishingDb,
  accountId: string,
  delta: { readonly committed?: number; readonly reserved?: number },
  now: Date,
): Promise<void> => {
  const committed = delta.committed ?? 0;
  const reserved = delta.reserved ?? 0;
  if (committed === 0 && reserved === 0) return;
  await lockCapacity(db, accountId, now);
  await db.query(
    `UPDATE community.account_publishing_capacity
     SET committed_bytes=GREATEST(committed_bytes + $2::bigint, 0),
         reserved_bytes=GREATEST(reserved_bytes + $3::bigint, 0)
     WHERE account_id=$1`,
    [accountId, committed, reserved],
  );
};

/**
 * Releases every open component reservation of the given items: component
 * `reserved_bytes` become 0 and each owner's reserved counter drops by the
 * released amount (owners locked in id order).
 */
export const releaseReservations = async (
  db: PublishingDb,
  itemIds: readonly string[],
  now: Date,
): Promise<void> => {
  if (itemIds.length === 0) return;
  const released = await db.query<{ owner_id: string; bytes: string }>(
    `WITH open AS (
       SELECT id, owner_id, reserved_bytes FROM community.media_components
       WHERE item_id=ANY($1::text[]) AND reserved_bytes > 0
       ORDER BY id FOR UPDATE
     ), zeroed AS (
       UPDATE community.media_components c
       SET reserved_bytes=0, updated_at=$2::timestamptz
       FROM open WHERE c.id=open.id
       RETURNING open.owner_id, open.reserved_bytes
     )
     SELECT owner_id, sum(reserved_bytes)::text AS bytes
     FROM zeroed GROUP BY owner_id ORDER BY owner_id`,
    [itemIds, nowParam(now)],
  );
  for (const row of released.rows)
    await adjustCapacity(
      db,
      row.owner_id,
      { reserved: -safeInteger(row.bytes) },
      now,
    );
};

/**
 * Fails still-processing items whose `process_item` job ended without a
 * worker observing it (lease expiry without attempts left, operator abandon):
 * state `failed` with `processing_failed` and open reservations released, as
 * `markItemFailed` does. Items are locked in id order; other states are left
 * unchanged. Returns the failed item ids.
 */
export const failProcessingItems = async (
  db: PublishingDb,
  itemIds: readonly string[],
  now: Date,
): Promise<string[]> => {
  const unique = [...new Set(itemIds)].sort();
  if (unique.length === 0) return [];
  const failed = (
    await db.query<{ id: string }>(
      `UPDATE community.media_items i
       SET state='failed', failure_code='processing_failed', updated_at=$2::timestamptz, version=i.version+1
       FROM (
         SELECT id FROM community.media_items
         WHERE id=ANY($1::text[]) AND state='processing'
         ORDER BY id FOR UPDATE
       ) processing
       WHERE i.id=processing.id AND i.state='processing'
       RETURNING i.id`,
      [unique, nowParam(now)],
    )
  ).rows
    .map((row) => row.id)
    .sort();
  await releaseReservations(db, failed, now);
  return failed;
};

/** WorkPublishingPort.claimJobs */
export const claimJobs = async (
  pool: Pool,
  options: PublishingJobClaimOptions,
  now: Date,
): Promise<readonly PublishingJobClaim[]> => {
  if (options.owner.length < 1 || options.owner.length > 128)
    throw new TypeError(
      "A job lease owner label of 1..128 characters is required",
    );
  if (
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 100
  )
    throw new TypeError("A job claim takes 1..100 jobs");
  assertLeaseMs(options.leaseMs);
  if (options.kinds !== undefined && options.kinds.length === 0) return [];
  const at = nowParam(now);
  const claimed = await writeTransaction(pool, (db) =>
    db.query<JobRow>(
      `WITH next AS (
         SELECT id FROM community.publishing_jobs
         WHERE state='queued' AND run_after <= $1::timestamptz
           AND ($5::text[] IS NULL OR kind = ANY($5::text[]))
         ORDER BY run_after, id
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       UPDATE community.publishing_jobs j
       SET state='running', attempts=j.attempts + 1, lease_owner=$3,
           lease_expires_at=$1::timestamptz + $4::double precision * interval '1 millisecond',
           updated_at=$1::timestamptz, finished_at=NULL
       FROM next WHERE j.id=next.id
       RETURNING j.id,j.kind,j.subject_id,j.payload,j.attempts,j.max_attempts,j.run_after,j.lease_owner,j.lease_expires_at`,
      [
        at,
        options.limit,
        options.owner,
        options.leaseMs,
        options.kinds === undefined ? null : [...options.kinds],
      ],
    ),
  );
  return claimed.rows
    .sort(
      (left, right) =>
        left.run_after.getTime() - right.run_after.getTime() ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    )
    .map(claimOf);
};

/** WorkPublishingPort.renewJobLease */
export const renewJobLease = async (
  pool: Pool,
  lease: PublishingJobLease,
  leaseMs: number,
  now: Date,
): Promise<boolean> => {
  assertLeaseMs(leaseMs);
  const at = nowParam(now);
  const renewed = await writeTransaction(pool, (db) =>
    db.query(
      `UPDATE community.publishing_jobs
       SET lease_expires_at=$3::timestamptz + $4::double precision * interval '1 millisecond', updated_at=$3::timestamptz
       WHERE id=$1 AND state='running' AND lease_owner=$2`,
      [lease.id, lease.leaseOwner, at, leaseMs],
    ),
  );
  return renewed.rowCount === 1;
};

/** WorkPublishingPort.completeJob */
export const completeJob = async (
  pool: Pool,
  lease: PublishingJobLease,
  now: Date,
): Promise<boolean> => {
  const at = nowParam(now);
  const completed = await writeTransaction(pool, (db) =>
    db.query(
      `UPDATE community.publishing_jobs
       SET state='succeeded', lease_expires_at=NULL, finished_at=$3::timestamptz, updated_at=$3::timestamptz
       WHERE id=$1 AND state='running' AND lease_owner=$2`,
      [lease.id, lease.leaseOwner, at],
    ),
  );
  return completed.rowCount === 1;
};

/** WorkPublishingPort.releaseJob */
export const releaseJob = async (
  pool: Pool,
  lease: PublishingJobLease,
  now: Date,
): Promise<boolean> => {
  const at = nowParam(now);
  const released = await writeTransaction(pool, (db) =>
    db.query(
      `UPDATE community.publishing_jobs
       SET state='queued', attempts=GREATEST(attempts - 1, 0), run_after=$3::timestamptz,
           lease_owner=NULL, lease_expires_at=NULL, updated_at=$3::timestamptz
       WHERE id=$1 AND state='running' AND lease_owner=$2`,
      [lease.id, lease.leaseOwner, at],
    ),
  );
  return released.rowCount === 1;
};

/** WorkPublishingPort.failJob */
export const failJob = async (
  pool: Pool,
  lease: PublishingJobLease,
  errorCode: string,
  now: Date,
  options?: PublishingJobFailureOptions,
): Promise<PublishingJobFailure> => {
  if (!JOB_ERROR_CODE.test(errorCode))
    throw new TypeError("Job error codes are content-free identifiers");
  const at = nowParam(now);
  return writeTransaction(pool, async (db) => {
    // A process_item job's item is locked before the job row (the order
    // upload commits, worker results, lease expiry and abandon take; kind and
    // subject never change), so a final failure can fail the item here.
    const subject = (
      await db.query<{ kind: PublishingJobKind; subject_id: string }>(
        "SELECT kind,subject_id FROM community.publishing_jobs WHERE id=$1",
        [lease.id],
      )
    ).rows[0];
    if (subject?.kind === "process_item")
      await db.query(
        "SELECT id FROM community.media_items WHERE id=$1 FOR UPDATE",
        [subject.subject_id],
      );
    const job = (
      await db.query<{ attempts: number; max_attempts: number }>(
        "SELECT attempts,max_attempts FROM community.publishing_jobs WHERE id=$1 AND state='running' AND lease_owner=$2 FOR UPDATE",
        [lease.id, lease.leaseOwner],
      )
    ).rows[0];
    if (job === undefined) return "lease_lost";
    if ((options?.retryable ?? true) && job.attempts < job.max_attempts) {
      await db.query(
        `UPDATE community.publishing_jobs
         SET state='queued', run_after=$3::timestamptz, last_error_code=$2,
             lease_owner=NULL, lease_expires_at=NULL, updated_at=$4::timestamptz
         WHERE id=$1`,
        [
          lease.id,
          errorCode,
          nowParam(new Date(now.getTime() + jobBackoffMs(job.attempts))),
          at,
        ],
      );
      return "retry_scheduled";
    }
    await db.query(
      `UPDATE community.publishing_jobs
       SET state='failed', last_error_code=$2, lease_expires_at=NULL,
           finished_at=$3::timestamptz, updated_at=$3::timestamptz
       WHERE id=$1`,
      [lease.id, errorCode, at],
    );
    // Nothing processes the item again: it fails with the job, atomically
    // (a crash before the worker's own markItemFailed leaves nothing stuck).
    if (subject?.kind === "process_item")
      await failProcessingItems(db, [subject.subject_id], now);
    return "failed";
  });
};

/** WorkPublishingPort.requeueExpiredJobs */
export const requeueExpiredJobs = async (
  pool: Pool,
  now: Date,
  limit: number,
): Promise<number> => {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError("A positive requeue limit is required");
  const at = nowParam(now);
  return writeTransaction(pool, async (db) => {
    // Items of process_item jobs about to fail are locked first, in the order
    // upload commits and worker results take them (item before job), so this
    // pass never waits on a job row while holding an item another
    // transaction needs. A job that became final meanwhile for an item not
    // locked here stays running for the next pass.
    const candidates = (
      await db.query<{ subject_id: string }>(
        `SELECT DISTINCT subject_id FROM (
           SELECT subject_id FROM community.publishing_jobs
           WHERE state='running' AND lease_expires_at < $1::timestamptz
             AND kind='process_item' AND attempts >= max_attempts
           ORDER BY lease_expires_at, id
           LIMIT $2
         ) due`,
        [at, limit],
      )
    ).rows.map((row) => row.subject_id);
    const locked = (
      await db.query<{ id: string }>(
        "SELECT id FROM community.media_items WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",
        [candidates],
      )
    ).rows.map((row) => row.id);
    const requeued = await db.query<{
      kind: PublishingJobKind;
      subject_id: string;
      state: string;
    }>(
      `WITH expired AS (
         SELECT id FROM community.publishing_jobs
         WHERE state='running' AND lease_expires_at < $1::timestamptz
           AND (kind <> 'process_item' OR attempts < max_attempts OR subject_id = ANY($3::text[]))
         ORDER BY lease_expires_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       UPDATE community.publishing_jobs j
       SET state=CASE WHEN j.attempts < j.max_attempts THEN 'queued' ELSE 'failed' END,
           run_after=CASE WHEN j.attempts < j.max_attempts THEN $1::timestamptz ELSE j.run_after END,
           finished_at=CASE WHEN j.attempts < j.max_attempts THEN NULL ELSE $1::timestamptz END,
           last_error_code='lease_expired', lease_owner=NULL, lease_expires_at=NULL,
           updated_at=$1::timestamptz
       FROM expired WHERE j.id=expired.id
       RETURNING j.kind, j.subject_id, j.state`,
      [at, limit, locked],
    );
    // No worker observes these failures: their items fail here (P2, B3).
    await failProcessingItems(
      db,
      requeued.rows
        .filter((row) => row.kind === "process_item" && row.state === "failed")
        .map((row) => row.subject_id),
      now,
    );
    return requeued.rowCount ?? 0;
  });
};

/** WorkPublishingPort.enqueueJob */
export const enqueueJob = async (
  pool: Pool,
  job: PublishingJobEnqueue,
  now: Date,
): Promise<PublishingJobEnqueued> =>
  writeTransaction(pool, (db) => insertJob(db, job, now));

/** Subjects whose job of this kind already exists or ended without success (operator decides). */
const openOrUnresolvedJob = (
  kind: PublishingJobKind,
  subject: string,
): string =>
  `NOT EXISTS (SELECT 1 FROM community.publishing_jobs j WHERE j.kind='${kind}' AND j.subject_id=${subject} AND j.state IN ('queued','running','failed','abandoned'))`;

const scheduleKind = async (
  db: PublishingDb,
  kind: PublishingJobKind,
  candidates: string,
  at: string,
  limit: number,
): Promise<number> => {
  const inserted = await db.query(
    `INSERT INTO community.publishing_jobs(id,kind,subject_id,state,attempts,run_after,created_at,updated_at)
     SELECT ${jobIdSql}, '${kind}', subject_id, 'queued', 0, $1::timestamptz, $1::timestamptz, $1::timestamptz
     FROM (${candidates}) candidates
     ${activeJobConflict}
     RETURNING id`,
    [at, limit],
  );
  return inserted.rowCount ?? 0;
};

/**
 * SQL (for a derivative row `d` of item `i`) that is true when a holder still
 * needs that variant and edit key: the content of an active draft or
 * unresolved conflict copy, a snapshot, or a revision holding a ref to the
 * item, each through `community.media_required_derivatives`.
 */
const derivativeNeededSql = `(
  EXISTS (
    SELECT 1 FROM community.media_item_refs r
    JOIN community.work_drafts w ON w.id=r.holder_id AND w.state='active' AND w.resolved_at IS NULL
    CROSS JOIN LATERAL jsonb_array_elements(w.content->'items') e(item)
    CROSS JOIN LATERAL community.media_required_derivatives(
      i.kind, e.item->'edit',
      COALESCE(e.item->>'key' = w.content->>'coverKey', FALSE),
      CASE WHEN e.item->>'key' = w.content->>'coverKey' THEN w.content->'coverCrop' END) rd
    WHERE r.item_id=i.id AND r.holder_kind='draft' AND e.item->>'itemId'=i.id
      AND rd.variant=d.variant AND rd.edit_key=d.edit_key)
  OR EXISTS (
    SELECT 1 FROM community.media_item_refs r
    JOIN community.work_draft_snapshots w ON w.id=r.holder_id
    CROSS JOIN LATERAL jsonb_array_elements(w.content->'items') e(item)
    CROSS JOIN LATERAL community.media_required_derivatives(
      i.kind, e.item->'edit',
      COALESCE(e.item->>'key' = w.content->>'coverKey', FALSE),
      CASE WHEN e.item->>'key' = w.content->>'coverKey' THEN w.content->'coverCrop' END) rd
    WHERE r.item_id=i.id AND r.holder_kind='snapshot' AND e.item->>'itemId'=i.id
      AND rd.variant=d.variant AND rd.edit_key=d.edit_key)
  OR EXISTS (
    SELECT 1 FROM community.media_item_refs r
    JOIN community.work_revisions rv ON rv.id=r.holder_id
    JOIN community.work_revision_items ri ON ri.revision_id=rv.id AND ri.item_id=i.id
    CROSS JOIN LATERAL community.media_required_derivatives(
      i.kind, ri.edit,
      COALESCE(rv.cover_item_id = ri.item_id, FALSE),
      CASE WHEN rv.cover_item_id = ri.item_id THEN rv.cover_crop END) rd
    WHERE r.item_id=i.id AND r.holder_kind='revision'
      AND rd.variant=d.variant AND rd.edit_key=d.edit_key)
)`;

/**
 * Releases edit derivatives nothing needs any more (L12, A05): rows of ready
 * items with an edit key other than `base`, recorded more than an hour ago,
 * whose item no active session holds (a session's content lives only on the
 * client) and whose variant and key no draft, conflict copy, snapshot or
 * revision holding the item requires. Items are locked (skipping busy ones)
 * and the need is checked again after the lock, so a submission that holds
 * the item waits or wins. The released blobs become unused and a later
 * `purge_blob` job removes them.
 */
const releaseUnusedDerivatives = async (
  pool: Pool,
  now: Date,
  limit: number,
): Promise<void> => {
  const at = nowParam(now);
  const unused = (itemFilter: string) =>
    `SELECT d.item_id, d.variant, d.edit_key FROM community.media_derivatives d
     JOIN community.media_items i ON i.id=d.item_id
     WHERE d.edit_key <> 'base' AND i.state='ready'
       AND d.created_at < $1::timestamptz - ${BLOB_PURGE_DELAY_SQL}
       ${itemFilter}
       AND NOT EXISTS (
         SELECT 1 FROM community.media_item_refs r
         JOIN community.publishing_sessions s ON s.id=r.holder_id AND s.state='active'
         WHERE r.item_id=i.id AND r.holder_kind='session')
       AND NOT ${derivativeNeededSql}`;
  await writeTransaction(pool, async (db) => {
    const candidates = (
      await db.query<{ item_id: string }>(
        `SELECT DISTINCT item_id FROM (${unused("")} ORDER BY d.created_at, d.item_id LIMIT $2) found
         ORDER BY item_id`,
        [at, limit],
      )
    ).rows.map((row) => row.item_id);
    if (candidates.length === 0) return;
    const locked = (
      await db.query<{ id: string }>(
        "SELECT id FROM community.media_items WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE SKIP LOCKED",
        [candidates],
      )
    ).rows.map((row) => row.id);
    if (locked.length === 0) return;
    await db.query(
      `DELETE FROM community.media_derivatives t
       USING (${unused("AND d.item_id=ANY($2::text[])")}) gone
       WHERE t.item_id=gone.item_id AND t.variant=gone.variant AND t.edit_key=gone.edit_key`,
      [at, locked],
    );
  });
};

/** WorkPublishingPort.scheduleCleanup */
export const scheduleCleanup = async (
  pool: Pool,
  now: Date,
  limit: number,
): Promise<PublishingCleanupCounts> => {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError("A positive scheduling limit is required");
  const at = nowParam(now);
  // Its own transaction first: item locks never meet this pass's job inserts.
  await releaseUnusedDerivatives(pool, now, limit);
  return writeTransaction(pool, async (db) => {
    const expireSession = await scheduleKind(
      db,
      "expire_session",
      `SELECT s.id AS subject_id FROM community.publishing_sessions s
       WHERE s.state='active' AND s.lease_expires_at < $1::timestamptz
         AND ${openOrUnresolvedJob("expire_session", "s.id")}
       ORDER BY s.lease_expires_at, s.id LIMIT $2`,
      at,
      limit,
    );
    const purgeTrashedWork = await scheduleKind(
      db,
      "purge_trashed_work",
      `SELECT w.id AS subject_id FROM community.works w
       WHERE w.trashed_at IS NOT NULL AND w.deleted_at IS NULL
         AND w.trash_purge_after <= $1::timestamptz
         AND ${openOrUnresolvedJob("purge_trashed_work", "w.id")}
       ORDER BY w.trash_purge_after, w.id LIMIT $2`,
      at,
      limit,
    );
    // Current drafts, unresolved conflict copies, snapshots, revisions and
    // sessions all hold refs, so only true orphans are ever candidates.
    const purgeItem = await scheduleKind(
      db,
      "purge_item",
      `SELECT i.id AS subject_id FROM community.media_items i
       CROSS JOIN community.work_publishing_settings s
       WHERE s.id='settings' AND i.state <> 'purged'
         AND NOT EXISTS (SELECT 1 FROM community.media_item_refs r WHERE r.item_id=i.id)
         AND (
           i.state='cancelled'
           OR GREATEST(i.updated_at, COALESCE((SELECT max(c.updated_at) FROM community.media_components c WHERE c.item_id=i.id), i.updated_at))
              < $1::timestamptz - make_interval(days => s.orphan_grace_days)
         )
         AND ${openOrUnresolvedJob("purge_item", "i.id")}
       ORDER BY i.updated_at, i.id LIMIT $2`,
      at,
      limit,
    );
    const purgeBlob = await scheduleKind(
      db,
      "purge_blob",
      `SELECT b.id AS subject_id FROM community.media_blobs b
       WHERE (
           (b.state='tombstoned' AND b.tombstoned_at < $1::timestamptz - ${BLOB_PURGE_DELAY_SQL})
           OR (
             b.state='committed' AND b.created_at < $1::timestamptz - ${BLOB_PURGE_DELAY_SQL}
             AND NOT EXISTS (
               SELECT 1 FROM community.media_components c JOIN community.media_items i ON i.id=c.item_id
               WHERE c.blob_id=b.id AND i.state <> 'purged')
             AND NOT EXISTS (
               SELECT 1 FROM community.media_derivatives d JOIN community.media_items i ON i.id=d.item_id
               WHERE d.blob_id=b.id AND i.state <> 'purged')
           )
         )
         AND ${openOrUnresolvedJob("purge_blob", "b.id")}
       ORDER BY b.created_at, b.id LIMIT $2`,
      at,
      limit,
    );
    // Bounded retention of finished successes (their outcome is content-free
    // and nothing schedules on them); failed and abandoned rows stay for the
    // operator. The batch is materialized once: an `IN (… SKIP LOCKED LIMIT)`
    // subquery rescanned per row skips the rows this statement already
    // deleted and removes more than `limit`.
    await db.query(
      `WITH doomed AS MATERIALIZED (
         SELECT id FROM community.publishing_jobs
         WHERE state='succeeded' AND finished_at < $1::timestamptz - ${SUCCEEDED_JOB_RETENTION_SQL}
         ORDER BY finished_at, id
         FOR UPDATE SKIP LOCKED
         LIMIT $2
       )
       DELETE FROM community.publishing_jobs j USING doomed WHERE j.id=doomed.id`,
      [at, limit],
    );
    return { expireSession, purgeTrashedWork, purgeItem, purgeBlob };
  });
};

const unlinksOf = (
  rows: readonly { id: string; storage_key: string }[],
): PublishingBlobUnlink[] =>
  [...rows]
    .sort((left, right) => (left.id < right.id ? -1 : 1))
    .map((row) => ({ blobId: row.id, storageKey: row.storage_key }));

/**
 * WorkPublishingPort.purgeItem. Besides refs, the recheck under the item lock
 * refuses (as `referenced`) an item a revision of a work that is not deleted
 * names, and an item that is not cancelled while an active draft, unresolved
 * conflict copy or snapshot content names it or its orphan grace has not
 * passed since its last change (a dropped ref marks that change). Cancelled
 * items purge at once (explicit cancel, discard, deletion, expiry).
 */
export const purgeItem = async (
  pool: Pool,
  itemId: string,
  now: Date,
): Promise<PublishingPurgePlan> => {
  const at = nowParam(now);
  return writeTransaction(pool, async (db) => {
    const item = (
      await db.query<{ state: string }>(
        "SELECT state FROM community.media_items WHERE id=$1 FOR UPDATE",
        [itemId],
      )
    ).rows[0];
    if (item === undefined || item.state === "purged")
      return { status: "missing" };
    // A new statement after the row lock: refs committed meanwhile are seen.
    const kept = await db.query(
      `SELECT 1 FROM community.media_items i
       CROSS JOIN community.work_publishing_settings st
       WHERE i.id=$1 AND st.id='settings' AND (
         EXISTS (SELECT 1 FROM community.media_item_refs r WHERE r.item_id=i.id)
         OR EXISTS (
           SELECT 1 FROM community.work_revision_items ri
           JOIN community.work_revisions rv ON rv.id=ri.revision_id
           JOIN community.works w ON w.id=rv.work_id AND w.deleted_at IS NULL
           WHERE ri.item_id=i.id)
         OR (i.state <> 'cancelled' AND (
           GREATEST(i.updated_at, COALESCE((SELECT max(c.updated_at) FROM community.media_components c WHERE c.item_id=i.id), i.updated_at))
             >= $2::timestamptz - make_interval(days => st.orphan_grace_days)
           OR EXISTS (
             SELECT 1 FROM community.work_drafts d
             WHERE d.owner_id=i.owner_id AND d.state='active' AND d.resolved_at IS NULL
               AND d.content->'items' @> jsonb_build_array(jsonb_build_object('itemId', i.id)))
           OR EXISTS (
             SELECT 1 FROM community.work_draft_snapshots sn
             WHERE sn.owner_id=i.owner_id
               AND sn.content->'items' @> jsonb_build_array(jsonb_build_object('itemId', i.id)))
         ))
       )`,
      [itemId, at],
    );
    if ((kept.rowCount ?? 0) > 0) return { status: "referenced" };
    const blobs = await db.query<{ id: string; storage_key: string }>(
      `WITH used AS (
         SELECT blob_id FROM community.media_components WHERE item_id=$1 AND blob_id IS NOT NULL
         UNION
         SELECT blob_id FROM community.media_derivatives WHERE item_id=$1
       ), locked AS (
         SELECT b.id FROM community.media_blobs b JOIN used ON used.blob_id=b.id
         WHERE b.state IN ('committed','tombstoned')
         ORDER BY b.id FOR UPDATE OF b
       )
       UPDATE community.media_blobs b
       SET state='tombstoned', tombstoned_at=COALESCE(b.tombstoned_at,$2::timestamptz)
       FROM locked WHERE b.id=locked.id
       RETURNING b.id, b.storage_key`,
      [itemId, at],
    );
    await db.query(
      "UPDATE community.media_components SET state='cancelled', upload_attempt=NULL, updated_at=$2::timestamptz WHERE item_id=$1 AND state IN ('awaiting','receiving')",
      [itemId, at],
    );
    await releaseReservations(db, [itemId], now);
    await db.query(
      "UPDATE community.media_items SET state='purged', purged_at=$2::timestamptz, updated_at=$2::timestamptz, version=version+1 WHERE id=$1",
      [itemId, at],
    );
    return { status: "tombstoned", blobs: unlinksOf(blobs.rows) };
  });
};

/** WorkPublishingPort.purgeBlob */
export const purgeBlob = async (
  pool: Pool,
  blobId: string,
  now: Date,
): Promise<PublishingPurgePlan> => {
  const at = nowParam(now);
  return writeTransaction(pool, async (db) => {
    const blob = (
      await db.query<{ id: string; state: string; storage_key: string }>(
        "SELECT id,state,storage_key FROM community.media_blobs WHERE id=$1 FOR UPDATE",
        [blobId],
      )
    ).rows[0];
    if (blob === undefined || blob.state === "purged")
      return { status: "missing" };
    if (blob.state === "committed") {
      const used = await db.query(
        `SELECT 1 FROM community.media_components c JOIN community.media_items i ON i.id=c.item_id
         WHERE c.blob_id=$1 AND i.state <> 'purged'
         UNION ALL
         SELECT 1 FROM community.media_derivatives d JOIN community.media_items i ON i.id=d.item_id
         WHERE d.blob_id=$1 AND i.state <> 'purged'
         LIMIT 1`,
        [blobId],
      );
      if ((used.rowCount ?? 0) > 0) return { status: "referenced" };
      await db.query(
        "UPDATE community.media_blobs SET state='tombstoned', tombstoned_at=$2::timestamptz WHERE id=$1",
        [blobId, at],
      );
    }
    return {
      status: "tombstoned",
      blobs: [{ blobId: blob.id, storageKey: blob.storage_key }],
    };
  });
};

/** WorkPublishingPort.confirmPurged */
export const confirmPurged = async (
  pool: Pool,
  blobIds: readonly string[],
  now: Date,
): Promise<void> => {
  if (blobIds.length === 0) return;
  const at = nowParam(now);
  await writeTransaction(pool, async (db) => {
    const tombstoned = await db.query<{
      id: string;
      owner_id: string;
      byte_size: string;
    }>(
      "SELECT id,owner_id,byte_size FROM community.media_blobs WHERE id=ANY($1::text[]) AND state='tombstoned' ORDER BY id FOR UPDATE",
      [[...blobIds]],
    );
    if (tombstoned.rows.length === 0) return;
    await db.query(
      "UPDATE community.media_blobs SET state='purged', purged_at=$2::timestamptz WHERE id=ANY($1::text[])",
      [tombstoned.rows.map((row) => row.id), at],
    );
    const perOwner = new Map<string, number>();
    for (const row of tombstoned.rows)
      perOwner.set(
        row.owner_id,
        (perOwner.get(row.owner_id) ?? 0) + safeInteger(row.byte_size),
      );
    for (const owner of [...perOwner.keys()].sort())
      await adjustCapacity(
        db,
        owner,
        { committed: -(perOwner.get(owner) ?? 0) },
        now,
      );
  });
};
