import {
  CommunityConflictError,
  CommunityInputError,
  CommunityNotFoundError,
} from "@moya/api";
import {
  editableWorkSchema,
  trashedWorkPageSchema,
} from "@moya/contracts/schemas";
import type {
  EditableWork,
  MediaCrop,
  MediaEdit,
  PublishingMediaItem,
  PublishingPageQuery,
  TrashRestoreResult,
  TrashedWorkPage,
  WorkVisibilityCommand,
  WorkVisibilityResult,
} from "@moya/contracts";
import type {
  PublishingCommandIdentity,
  PublishingTrashPurge,
} from "@moya/api";
import type { Pool, QueryResultRow } from "pg";

import {
  authorCommand,
  isoOrNull,
  nowParam,
  pageBounds,
  pageOf,
  publishingAuthorActions,
  readTransaction,
  selectSettings,
  writeTransaction,
} from "./db.js";
import type { PublishingDb } from "./db.js";
import { revisionAuthorship } from "./authorship.js";
import type { RevisionAuthorshipColumns } from "./authorship.js";
import { insertJob } from "./jobs.js";
import { cancelItems, releaseHolderRefs, selectMediaItems } from "./media.js";
import {
  clipboardOriginSql,
  revisionCover,
  revisionCoverColumns,
  revisionCoverJoin,
  workExcerpt,
} from "./media-read.js";
import type { RevisionCoverColumns } from "./media-read.js";
import {
  applyPublicRevision,
  closePendingRevisions,
  touchWork,
  withholdReplacedPublicRevision,
} from "./submissions.js";

/*
 * Author work reads for editing, visibility changes (P10), the recycle bin
 * (T01-T03) and the retention purge. Every author command runs under the
 * actor lock with its receipt and audit row (./db.ts authorCommand).
 */

const activeActor = async (db: PublishingDb, actorId: string) => {
  const active = await db.query(
    "SELECT id FROM community.public_users WHERE id=$1 AND status='active'",
    [actorId],
  );
  if (active.rowCount !== 1) throw new CommunityNotFoundError();
};

const positiveInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;

/** Public presentation facts only; private facts such as display rotation stay stored. */
export const presentationDto = (
  kind: "static" | "live",
  stored: Record<string, unknown> | null,
): PublishingMediaItem["presentation"] => {
  const width = positiveInteger(stored?.width);
  const height = positiveInteger(stored?.height);
  if (stored === null || width === null || height === null) return null;
  const durationMs = positiveInteger(stored.durationMs);
  return {
    width,
    height,
    ...(kind === "live" && durationMs !== null ? { durationMs } : {}),
    ...(kind === "live" && typeof stored.hasAudio === "boolean"
      ? { hasAudio: stored.hasAudio }
      : {}),
  };
};

interface EditableWorkRow extends QueryResultRow {
  id: string;
  author_revision_id: string | null;
  visibility: "public" | "self";
  first_published_at: Date | null;
  edited_at: Date | null;
  version: number;
}

interface RevisionRow extends QueryResultRow, RevisionAuthorshipColumns {
  id: string;
  title: string;
  body: string;
  cover_item_id: string | null;
  cover_crop: MediaCrop | null;
}

interface RevisionItemRow extends QueryResultRow {
  item_id: string;
  edit: MediaEdit;
  kind: "static" | "live";
  quality_mode: "standard" | "original" | "legacy";
  clipboard: boolean;
}

/** WorkPublishingPort.readEditableWork */
export const readEditableWork = async (
  pool: Pool,
  actorId: string,
  workId: string,
): Promise<EditableWork> =>
  readTransaction(pool, async (db) => {
    await activeActor(db, actorId);
    const work = (
      await db.query<EditableWorkRow>(
        "SELECT id,author_revision_id,visibility,first_published_at,edited_at,version FROM community.works WHERE id=$1 AND author_id=$2 AND deleted_at IS NULL AND trashed_at IS NULL",
        [workId, actorId],
      )
    ).rows[0];
    if (work === undefined || work.author_revision_id === null)
      throw new CommunityNotFoundError();
    const revision = (
      await db.query<RevisionRow>(
        "SELECT id,title,body,authorship_kind,reference_title,original_author,source_note,cover_item_id,cover_crop FROM community.work_revisions WHERE id=$1",
        [work.author_revision_id],
      )
    ).rows[0];
    if (revision === undefined) throw new CommunityNotFoundError();
    const items = (
      await db.query<RevisionItemRow>(
        `SELECT ri.item_id,ri.edit,i.kind,i.quality_mode,${clipboardOriginSql("i")} AS clipboard FROM community.work_revision_items ri JOIN community.media_items i ON i.id=ri.item_id WHERE ri.revision_id=$1 ORDER BY ri.position`,
        [revision.id],
      )
    ).rows;
    const draft = (
      await db.query<{ id: string }>(
        "SELECT id FROM community.work_drafts WHERE owner_id=$1 AND work_id=$2 AND state='active' AND conflict_of IS NULL",
        [actorId, workId],
      )
    ).rows[0];
    return editableWorkSchema.parse({
      workId: work.id,
      revisionId: revision.id,
      content: {
        title: revision.title,
        body: revision.body,
        authorship: revisionAuthorship(revision),
        visibility: work.visibility,
        items: items.map((item) => ({
          key: item.item_id,
          itemId: item.item_id,
          kind: item.kind,
          qualityMode: item.quality_mode,
          edit: item.edit,
          ...(item.clipboard ? { origin: "clipboard" } : {}),
        })),
        coverKey: revision.cover_item_id,
        coverCrop: revision.cover_item_id === null ? null : revision.cover_crop,
      },
      // The owner's item view (base derivative paths, as drafts show them).
      mediaItems: await (async () => {
        const byId = await selectMediaItems(
          db,
          actorId,
          items.map((item) => item.item_id),
        );
        return items.flatMap((item) => {
          const dto = byId.get(item.item_id);
          return dto === undefined ? [] : [dto];
        });
      })(),
      visibility: work.visibility,
      firstPublishedAt: isoOrNull(work.first_published_at),
      editedAt: isoOrNull(work.edited_at),
      draftId: draft?.id ?? null,
      version: work.version,
    });
  });

interface LockedWorkRow extends QueryResultRow {
  id: string;
  visibility: "public" | "self";
  author_revision_id: string | null;
  trashed_at: Date | null;
  trash_purge_after: Date | null;
  deleted_at: Date | null;
  operator_state: "visible" | "hidden" | "removed";
}

/** Locks the actor's work that is not purged; anything else is not found. */
const lockOwnWork = async (
  db: PublishingDb,
  actorId: string,
  workId: string,
): Promise<LockedWorkRow> => {
  const work = (
    await db.query<LockedWorkRow>(
      "SELECT id,visibility,author_revision_id,trashed_at,trash_purge_after,deleted_at,operator_state FROM community.works WHERE id=$1 AND author_id=$2 FOR UPDATE",
      [workId, actorId],
    )
  ).rows[0];
  if (work === undefined || work.deleted_at !== null)
    throw new CommunityNotFoundError();
  return work;
};

const workUnavailable = (): never => {
  throw new CommunityInputError("work_unavailable");
};

/** WorkPublishingPort.setVisibility */
export const setVisibility = async (
  pool: Pool,
  actorId: string,
  workId: string,
  command: WorkVisibilityCommand,
  now: Date,
): Promise<WorkVisibilityResult> =>
  authorCommand(
    pool,
    {
      actorId,
      requestId: command.requestId,
      action: publishingAuthorActions.setVisibility,
      subjectId: workId,
      input: command,
      now,
    },
    async (db) => {
      const work = await lockOwnWork(db, actorId, workId);
      if (work.trashed_at !== null || work.operator_state === "removed")
        workUnavailable();
      const result = { workId, visibility: command.visibility };
      if (command.visibility === "self") {
        // Third-party access ends with this commit; public intent is withdrawn.
        await closePendingRevisions(db, workId, "withdrawn");
        if (work.visibility !== "self") {
          await db.query(
            "UPDATE community.works SET visibility='self' WHERE id=$1",
            [workId],
          );
          await touchWork(db, workId, now);
        }
        return result;
      }
      if (work.visibility === "public") return result;
      if (work.author_revision_id === null)
        throw new CommunityConflictError("The work has no revision");
      const settings = await selectSettings(db, "share");
      const revision = (
        await db.query<{ disposition: string }>(
          "SELECT disposition FROM community.work_revisions WHERE id=$1 FOR UPDATE",
          [work.author_revision_id],
        )
      ).rows[0];
      if (revision === undefined) throw new CommunityNotFoundError();
      // Self-only → public follows the current policy for the author's
      // current revision (P10): an approved revision is public again at once;
      // otherwise (self-only, withdrawn or rejected) direct publication
      // approves it and pre-moderation queues it again.
      if (revision.disposition === "approved") {
        await applyPublicRevision(db, workId, work.author_revision_id, now);
      } else if (settings.policy === "DIRECT_PUBLICATION") {
        await closePendingRevisions(
          db,
          workId,
          "superseded",
          work.author_revision_id,
        );
        await db.query(
          "UPDATE community.work_revisions SET disposition='approved',decided_at=$2::timestamptz,decided_by=NULL,version=version+1 WHERE id=$1",
          [work.author_revision_id, nowParam(now)],
        );
        await applyPublicRevision(db, workId, work.author_revision_id, now);
      } else {
        await closePendingRevisions(
          db,
          workId,
          "superseded",
          work.author_revision_id,
        );
        if (revision.disposition !== "pending")
          await db.query(
            "UPDATE community.work_revisions SET disposition='pending',decided_at=NULL,decided_by=NULL,version=version+1 WHERE id=$1",
            [work.author_revision_id],
          );
        // Public intent is recorded; others see nothing replaced while the
        // work was self-only until the pending revision is approved.
        await db.query(
          "UPDATE community.works SET visibility='public' WHERE id=$1",
          [workId],
        );
        await withholdReplacedPublicRevision(
          db,
          workId,
          work.author_revision_id,
        );
      }
      await touchWork(db, workId, now);
      return result;
    },
  );

/** WorkPublishingPort.trashWork */
export const trashWork = async (
  pool: Pool,
  actorId: string,
  workId: string,
  command: PublishingCommandIdentity,
  now: Date,
): Promise<{ readonly deleted: true }> =>
  authorCommand(
    pool,
    {
      actorId,
      requestId: command.requestId,
      action: publishingAuthorActions.trashWork,
      subjectId: workId,
      input: command,
      now,
    },
    async (db) => {
      const work = await lockOwnWork(db, actorId, workId);
      if (work.trashed_at === null) {
        const settings = await selectSettings(db, "share");
        const purgeAfter = (
          await db.query<{ purge_after: Date }>(
            `UPDATE community.works SET trashed_at=$2::timestamptz,
              trash_purge_after=$2::timestamptz+make_interval(days=>$3::integer)
            WHERE id=$1 RETURNING trash_purge_after AS purge_after`,
            [workId, nowParam(now), settings.trashRetentionDays],
          )
        ).rows[0]!.purge_after;
        await closePendingRevisions(db, workId, "withdrawn");
        await touchWork(db, workId, now);
        const job = await insertJob(
          db,
          {
            kind: "purge_trashed_work",
            subjectId: workId,
            runAfter: purgeAfter,
          },
          now,
        );
        // A queued purge left from an earlier stay in the bin runs at this
        // stay's purge time instead.
        if (!job.created)
          await db.query(
            "UPDATE community.publishing_jobs SET run_after=$2::timestamptz,updated_at=$3::timestamptz WHERE id=$1 AND state='queued'",
            [job.id, nowParam(purgeAfter), nowParam(now)],
          );
      }
      return { deleted: true } as const;
    },
  );

/** WorkPublishingPort.restoreWork */
export const restoreWork = async (
  pool: Pool,
  actorId: string,
  workId: string,
  command: PublishingCommandIdentity,
  now: Date,
): Promise<TrashRestoreResult> =>
  authorCommand(
    pool,
    {
      actorId,
      requestId: command.requestId,
      action: publishingAuthorActions.restoreWork,
      subjectId: workId,
      input: command,
      now,
    },
    async (db) => {
      const work = await lockOwnWork(db, actorId, workId);
      if (work.trashed_at === null)
        throw new CommunityConflictError("The work is not in the recycle bin");
      // Past its retention time a work belongs to the purge, whenever the
      // worker runs it; a removed work is never self-restorable (T03).
      if (
        work.operator_state === "removed" ||
        (work.trash_purge_after !== null &&
          work.trash_purge_after.getTime() <= now.getTime())
      )
        workUnavailable();
      await db.query(
        "UPDATE community.works SET trashed_at=NULL,trash_purge_after=NULL,visibility='self' WHERE id=$1",
        [workId],
      );
      await closePendingRevisions(db, workId, "withdrawn");
      // The purge queued for this stay in the bin is not needed any more.
      await db.query(
        "DELETE FROM community.publishing_jobs WHERE kind='purge_trashed_work' AND subject_id=$1 AND state='queued'",
        [workId],
      );
      await touchWork(db, workId, now);
      return { workId, visibility: "self" } as const;
    },
  );

interface TrashRow extends RevisionCoverColumns {
  id: string;
  title: string | null;
  body: string | null;
  item_count: number;
  trashed_at: Date;
  trash_purge_after: Date;
  operator_state: string;
}

/** WorkPublishingPort.listTrash */
export const listTrash = async (
  pool: Pool,
  actorId: string,
  query: PublishingPageQuery,
  now: Date,
): Promise<TrashedWorkPage> =>
  readTransaction(pool, async (db) => {
    await activeActor(db, actorId);
    const where =
      "w.author_id=$1 AND w.trashed_at IS NOT NULL AND w.deleted_at IS NULL";
    const total = Number(
      (
        await db.query<{ total: string }>(
          `SELECT count(*) AS total FROM community.works w WHERE ${where}`,
          [actorId],
        )
      ).rows[0]?.total ?? 0,
    );
    const { limit, offset } = pageBounds(query);
    const rows = (
      await db.query<TrashRow>(
        `SELECT w.id,r.title,r.body,w.trashed_at,w.trash_purge_after,w.operator_state,
          (SELECT count(*)::integer FROM community.work_revision_items ri WHERE ri.revision_id=r.id) AS item_count,
          ${revisionCoverColumns("cov")}
        FROM community.works w
        LEFT JOIN community.work_revisions r ON r.id=w.author_revision_id
        ${revisionCoverJoin("r", "cov")}
        WHERE ${where}
        ORDER BY w.trashed_at DESC,w.id DESC LIMIT $2 OFFSET $3`,
        [actorId, limit, offset],
      )
    ).rows;
    return trashedWorkPageSchema.parse(
      pageOf(
        rows.map((row) => ({
          workId: row.id,
          title: row.title ?? "",
          excerpt: workExcerpt(row.body ?? ""),
          coverSrc: revisionCover(row)?.src ?? null,
          itemCount: row.item_count ?? 0,
          trashedAt: row.trashed_at.toISOString(),
          purgeAfter: row.trash_purge_after.toISOString(),
          // The same rule restoreWork applies: never a removed work, and
          // never once the retention purge is due.
          restorable:
            row.operator_state !== "removed" &&
            row.trash_purge_after.getTime() > now.getTime(),
        })),
        total,
        query,
      ),
    );
  });

/** WorkPublishingPort.purgeTrashedWork */
export const purgeTrashedWork = async (
  pool: Pool,
  workId: string,
  now: Date,
): Promise<PublishingTrashPurge> =>
  writeTransaction(pool, async (db) => {
    const at = nowParam(now);
    // Holders before the work, in the order author submissions lock them.
    await db.query(
      "SELECT id FROM community.publishing_sessions WHERE work_id=$1 ORDER BY id FOR UPDATE",
      [workId],
    );
    const drafts = (
      await db.query<{ id: string }>(
        "SELECT id FROM community.work_drafts WHERE work_id=$1 ORDER BY id FOR UPDATE",
        [workId],
      )
    ).rows.map((row) => row.id);
    const work = (
      await db.query<{
        due: boolean | null;
        trashed: boolean;
        deleted: boolean;
      }>(
        "SELECT trash_purge_after<=$2::timestamptz AS due,trashed_at IS NOT NULL AS trashed,deleted_at IS NOT NULL AS deleted FROM community.works WHERE id=$1 FOR UPDATE",
        [workId, at],
      )
    ).rows[0];
    if (work === undefined || work.deleted) return "missing";
    if (!work.trashed || work.due !== true) return "not_due";
    await db.query(
      "UPDATE community.works SET deleted_at=$2::timestamptz,updated_at=$2::timestamptz,version=version+1 WHERE id=$1",
      [workId, at],
    );
    await closePendingRevisions(db, workId, "withdrawn");
    const holders = (
      await db.query<{
        kind: "revision" | "draft" | "snapshot" | "session";
        id: string;
      }>(
        `SELECT 'revision'::text AS kind,id FROM community.work_revisions WHERE work_id=$1
        UNION ALL SELECT 'draft',id FROM community.work_drafts WHERE work_id=$1
        UNION ALL SELECT 'snapshot',id FROM community.work_draft_snapshots WHERE work_id=$1 OR draft_id=ANY($2::text[])
        UNION ALL SELECT 'session',id FROM community.publishing_sessions WHERE work_id=$1`,
        [workId, drafts],
      )
    ).rows;
    // Items any revision of the work held (submitted content) keep the
    // orphan grace; the rest only this work's drafts, history and sessions
    // held, which end here like a draft deletion.
    const submitted = new Set(
      (
        await db.query<{ item_id: string }>(
          "SELECT DISTINCT ri.item_id FROM community.work_revision_items ri JOIN community.work_revisions r ON r.id=ri.revision_id WHERE r.work_id=$1",
          [workId],
        )
      ).rows.map((row) => row.item_id),
    );
    // Every holder lets go of its items in one item lock pass; each released
    // live item waits the whole orphan grace from now (T02, T05).
    const released = await releaseHolderRefs(
      db,
      (["revision", "draft", "snapshot", "session"] as const).map((kind) => ({
        holderKind: kind,
        holderIds: holders
          .filter((holder) => holder.kind === kind)
          .map((holder) => holder.id),
      })),
      now,
    );
    await db.query(
      "DELETE FROM community.work_draft_snapshots WHERE id=ANY($1::text[])",
      [
        holders
          .filter((holder) => holder.kind === "snapshot")
          .map((holder) => holder.id),
      ],
    );
    await db.query(
      `UPDATE community.publishing_sessions SET state=CASE WHEN state='active' THEN 'discarded' ELSE state END,
        ended_at=CASE WHEN state='active' THEN $2::timestamptz ELSE ended_at END,draft_id=NULL
      WHERE work_id=$1 OR draft_id=ANY($3::text[])`,
      [workId, at, drafts],
    );
    // Draft rows and their conflict copies go with their content, as a
    // draft deletion removes them (no content outlives the purged work).
    await db.query(
      "DELETE FROM community.work_drafts WHERE id=ANY($1::text[]) OR conflict_of=ANY($1::text[])",
      [drafts],
    );
    const orphaned = (
      await db.query<{ id: string; cancelled: boolean }>(
        `SELECT i.id,i.state='cancelled' AS cancelled FROM community.media_items i
        WHERE i.id=ANY($1::text[]) AND i.state<>'purged'
          AND NOT EXISTS (SELECT 1 FROM community.media_item_refs r WHERE r.item_id=i.id)
        ORDER BY i.id`,
        [released],
      )
    ).rows;
    // Unsubmitted media nothing else holds is cancelled at once (reservations
    // released, transfers fenced, purge now).
    await cancelItems(
      db,
      orphaned.filter((item) => !submitted.has(item.id)).map((item) => item.id),
      now,
      { onlyUnreferenced: true },
    );
    // A purge before the grace ends would only answer `referenced`; the time
    // uses the same SQL interval arithmetic as purge_item's recheck.
    const afterGrace = (
      await db.query<{ run_after: Date }>(
        "SELECT $1::timestamptz+make_interval(days=>orphan_grace_days)+interval '1 second' AS run_after FROM community.work_publishing_settings WHERE id='settings' FOR SHARE",
        [at],
      )
    ).rows[0]!.run_after;
    for (const item of orphaned)
      if (submitted.has(item.id))
        await insertJob(
          db,
          {
            kind: "purge_item",
            subjectId: item.id,
            runAfter: item.cancelled ? now : afterGrace,
          },
          now,
        );
    return "purged";
  });
