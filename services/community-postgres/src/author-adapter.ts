import { asCommunityOperationError } from "./availability.js";
import { createHash, randomUUID } from "node:crypto";
import { CommunityConflictError, CommunityNotFoundError } from "@moya/api";
import {
  authorProfileSchema,
  workEditDraftSchema,
  workSchema,
} from "@moya/contracts/schemas";
import type {
  AuthorCommunityPort,
  AuthorListItem,
  AuthorPage,
  OwnedMediaInput,
  OwnedMediaRead,
  WorkApplyResult,
  WorkDraftResult,
} from "@moya/api";
import type {
  AuthorListQuery,
  AuthorMedia,
  AuthorProfile,
  AvatarUpdate,
  ContentIdentity,
  ContentRelationUpdate,
  GuestFavoriteMerge,
  PrivacyUpdate,
  ProfileUpdate,
  RelationshipUpdate,
  UserWork,
  WorkDraftApply,
  WorkDraftSave,
  WorkEditDraft,
} from "@moya/contracts";
import type { Pool, PoolClient, QueryResultRow } from "pg";

interface UserRow extends QueryResultRow {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  following_privacy: "public" | "private";
  followers_privacy: "public" | "private";
  favorites_privacy: "public" | "private";
  likes_privacy: "public" | "private";
  avatar_media_id: string | null;
  next_avatar_at: Date | null;
}
interface WorkRow extends QueryResultRow {
  id: string;
  author_id: string;
  display_name: string;
  title: string;
  text: string;
  media_ids: string[];
  first_published_at: Date;
  version: number;
  operator_state: "visible" | "hidden" | "removed";
  deleted_at: Date | null;
}
interface DraftRow extends QueryResultRow {
  id: string;
  work_id: string;
  version: number;
  base_work_version: number;
  base_draft_version: number;
  title: string;
  text: string;
  media_ids: string[];
  created_at: Date;
  conflicted: boolean;
}
const offset = (q: AuthorListQuery) => (q.page - 1) * q.pageSize;
const opaque = (prefix: string) =>
  `${prefix}-${randomUUID().replaceAll("-", "")}`;
const mediaDto = (r: {
  id: string;
  width: number;
  height: number;
}): AuthorMedia => ({
  id: r.id,
  width: r.width,
  height: r.height,
  src: `/api/community/media/${r.id}`,
});
const draftDto = (r: DraftRow): WorkEditDraft =>
  workEditDraftSchema.parse({
    id: r.id,
    workId: r.work_id,
    version: r.version,
    baseWorkVersion: r.base_work_version,
    baseDraftVersion: r.base_draft_version,
    content: { title: r.title, text: r.text, mediaIds: r.media_ids },
    savedAt: r.created_at.toISOString(),
    conflicted: r.conflicted,
  });

export class PostgresAuthorCommunityAdapter implements AuthorCommunityPort {
  constructor(private readonly pool: Pool) {}

  private async read<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect().catch((error) => {
      throw asCommunityOperationError(error, "connect");
    });
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await run(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw asCommunityOperationError(error, "query");
    } finally {
      db.release();
    }
  }

  /** Lock the actor before the receipt: retries and device concurrency serialize. */
  private async mutate<T>(
    actor: string,
    request: string,
    action: string,
    subject: string,
    input: unknown,
    run: (db: PoolClient) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect().catch((error) => {
      throw asCommunityOperationError(error, "connect");
    });
    try {
      await db.query("BEGIN");
      await this.active(db, actor, true);
      const fingerprint = createHash("sha256")
        .update(JSON.stringify([action, subject, input]))
        .digest("hex");
      const receipt = (
        await db.query<{ fingerprint: string; result: T }>(
          "SELECT fingerprint,result FROM community.author_command_receipts WHERE actor_id=$1 AND request_id=$2",
          [actor, request],
        )
      ).rows[0];
      if (receipt !== undefined) {
        if (receipt.fingerprint !== fingerprint)
          throw new CommunityConflictError(
            "Request identity was already used for different content",
          );
        await db.query("COMMIT");
        return receipt.result;
      }
      const result = await run(db);
      await db.query(
        "INSERT INTO community.author_events(id,actor_id,action,subject_id) VALUES($1,$2,$3,$4)",
        [opaque("author-event"), actor, action, subject],
      );
      await db.query(
        "INSERT INTO community.author_command_receipts(actor_id,request_id,fingerprint,result) VALUES($1,$2,$3,$4::jsonb)",
        [actor, request, fingerprint, JSON.stringify(result ?? null)],
      );
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw asCommunityOperationError(error, "query");
    } finally {
      db.release();
    }
  }

  private async active(
    db: PoolClient,
    id: string,
    lock = false,
  ): Promise<void> {
    const r = await db.query(
      `SELECT id FROM community.public_users WHERE id=$1 AND status='active'${lock ? " FOR NO KEY UPDATE" : ""}`,
      [id],
    );
    if (r.rowCount !== 1) throw new CommunityNotFoundError();
  }
  private async accessible(
    db: PoolClient,
    viewer: string | null,
    target: string,
  ): Promise<UserRow> {
    const row = (
      await db.query<UserRow>(
        `SELECT u.*, CASE WHEN avatar_changed_on IS NULL THEN NULL ELSE
      ((avatar_changed_on + 1)::timestamp AT TIME ZONE 'America/New_York') END AS next_avatar_at
      FROM community.public_users u WHERE id=$1 AND status='active' AND community.accounts_can_interact($2,id)`,
        [target, viewer],
      )
    ).rows[0];
    if (!row) throw new CommunityNotFoundError();
    return row;
  }
  private async media(db: PoolClient, ids: string[]): Promise<AuthorMedia[]> {
    const r = await db.query<{ id: string; width: number; height: number }>(
      "SELECT m.id,m.width,m.height FROM unnest($1::text[]) WITH ORDINALITY a(id,n) JOIN community.user_media m ON m.id=a.id ORDER BY a.n",
      [ids],
    );
    return r.rows.map(mediaDto);
  }
  private async ownedMedia(
    db: PoolClient,
    actor: string,
    ids: string[],
  ): Promise<void> {
    const r = await db.query(
      "SELECT id FROM community.user_media WHERE owner_id=$1 AND id=ANY($2::text[])",
      [actor, ids],
    );
    if (r.rowCount !== ids.length || new Set(ids).size !== ids.length)
      throw new CommunityNotFoundError("Media is unavailable to this author");
  }
  private async work(
    db: PoolClient,
    id: string,
    viewer: string | null,
    ownerOnly = false,
    lock = false,
  ): Promise<WorkRow> {
    const row = (
      await db.query<WorkRow>(
        `SELECT w.*,u.display_name FROM community.works w JOIN community.public_users u ON u.id=w.author_id
      WHERE w.id=$1 AND w.deleted_at IS NULL AND u.status='active' AND community.accounts_can_interact($2,w.author_id)
      AND (w.operator_state='visible' OR w.author_id=$2) ${ownerOnly ? "AND w.author_id=$2 FOR UPDATE OF w" : lock ? "FOR SHARE OF w" : ""}`,
        [id, viewer],
      )
    ).rows[0];
    if (!row) throw new CommunityNotFoundError();
    return row;
  }
  private async workDto(
    db: PoolClient,
    row: WorkRow,
    viewer: string | null,
  ): Promise<UserWork> {
    return workSchema.parse({
      id: row.id,
      authorId: row.author_id,
      authorName: row.display_name,
      title: row.title,
      text: row.text,
      media: await this.media(db, row.media_ids),
      firstPublishedAt: row.first_published_at.toISOString(),
      version: row.version,
      canEdit: row.author_id === viewer,
      available: row.operator_state === "visible" && row.deleted_at === null,
    });
  }

  async readProfile(id: string, viewer: string | null): Promise<AuthorProfile> {
    return this.read(async (db) => {
      const u = await this.accessible(db, viewer, id);
      const owner = viewer === id;
      const count = async (sql: string) =>
        Number(
          (await db.query<{ total: string }>(sql, [id])).rows[0]?.total ?? 0,
        );
      const following =
        viewer === null
          ? false
          : (
              await db.query(
                "SELECT 1 FROM community.follows WHERE follower_id=$1 AND followed_id=$2",
                [viewer, id],
              )
            ).rowCount === 1;
      return authorProfileSchema.parse({
        id,
        handle: u.handle,
        displayName: u.display_name,
        bio: u.bio,
        avatar: u.avatar_media_id
          ? ((await this.media(db, [u.avatar_media_id]))[0] ?? null)
          : null,
        isOwner: owner,
        following,
        privacy: {
          following: u.following_privacy,
          followers: u.followers_privacy,
          favorites: u.favorites_privacy,
          likes: u.likes_privacy,
        },
        totals: {
          works: await count(
            "SELECT count(*) AS total FROM community.works WHERE author_id=$1 AND deleted_at IS NULL AND operator_state='visible'",
          ),
          following:
            owner || u.following_privacy === "public"
              ? await count(
                  "SELECT count(*) AS total FROM community.follows WHERE follower_id=$1",
                )
              : null,
          followers:
            owner || u.followers_privacy === "public"
              ? await count(
                  "SELECT count(*) AS total FROM community.follows WHERE followed_id=$1",
                )
              : null,
          favorites:
            owner || u.favorites_privacy === "public"
              ? await count(
                  "SELECT count(*) AS total FROM community.content_relations WHERE user_id=$1 AND relation='favorite'",
                )
              : null,
          likes:
            owner || u.likes_privacy === "public"
              ? await count(
                  "SELECT count(*) AS total FROM community.content_relations WHERE user_id=$1 AND relation='like'",
                )
              : null,
        },
        nextAvatarChangeAt: owner
          ? (u.next_avatar_at?.toISOString() ?? null)
          : null,
      });
    });
  }
  async updateProfile(actor: string, input: ProfileUpdate): Promise<void> {
    await this.mutate(
      actor,
      input.requestId,
      "profile.update",
      actor,
      input,
      async (db) => {
        await db.query(
          "UPDATE community.public_users SET display_name=$2,bio=$3,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
          [actor, input.displayName, input.bio],
        );
      },
    );
  }
  async updatePrivacy(actor: string, input: PrivacyUpdate): Promise<void> {
    await this.mutate(
      actor,
      input.requestId,
      "privacy.update",
      actor,
      input,
      async (db) => {
        const p = input.privacy;
        await db.query(
          "UPDATE community.public_users SET following_privacy=$2,followers_privacy=$3,favorites_privacy=$4,likes_privacy=$5,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
          [actor, p.following, p.followers, p.favorites, p.likes],
        );
      },
    );
  }
  async updateAvatar(
    actor: string,
    input: AvatarUpdate,
  ): Promise<{ nextChangeAt: string }> {
    return this.mutate(
      actor,
      input.requestId,
      "avatar.update",
      actor,
      input,
      async (db) => {
        await this.ownedMedia(db, actor, [input.mediaId]);
        const row = (
          await db.query<{ next_change: Date }>(
            `UPDATE community.public_users SET avatar_media_id=$2,
        avatar_changed_on=(statement_timestamp() AT TIME ZONE 'America/New_York')::date,updated_at=CURRENT_TIMESTAMP
        WHERE id=$1 AND (avatar_changed_on IS NULL OR avatar_changed_on < (statement_timestamp() AT TIME ZONE 'America/New_York')::date)
        RETURNING ((avatar_changed_on + 1)::timestamp AT TIME ZONE 'America/New_York') AS next_change`,
            [actor, input.mediaId],
          )
        ).rows[0];
        if (!row)
          throw new CommunityConflictError(
            "Avatar has already changed on this New York calendar date",
          );
        return { nextChangeAt: row.next_change.toISOString() };
      },
    );
  }
  async saveMedia(input: OwnedMediaInput): Promise<AuthorMedia> {
    return this.mutate(
      input.ownerId,
      input.requestId ?? randomUUID(),
      "media.upload",
      input.ownerId,
      { sha256: input.sha256, width: input.width, height: input.height },
      async (db) => {
        await db.query(
          "INSERT INTO community.user_media(id,owner_id,mime_type,width,height,sha256,bytes) VALUES($1,$2,'image/png',$3,$4,$5,$6)",
          [
            input.id,
            input.ownerId,
            input.width,
            input.height,
            input.sha256,
            input.bytes,
          ],
        );
        return mediaDto(input);
      },
    );
  }
  async readMedia(
    id: string,
    viewer: string | null,
  ): Promise<OwnedMediaRead | null> {
    return this.read(async (db) => {
      const row = (
        await db.query<{ bytes: Buffer; width: number; height: number }>(
          `SELECT m.bytes,m.width,m.height FROM community.user_media m
        JOIN community.public_users u ON u.id=m.owner_id WHERE m.id=$1 AND u.status='active'
        AND community.accounts_can_interact($2,m.owner_id) AND (m.owner_id=$2 OR u.avatar_media_id=m.id OR EXISTS (
          SELECT 1 FROM community.works w WHERE w.author_id=m.owner_id AND m.id=ANY(w.media_ids) AND w.deleted_at IS NULL AND w.operator_state='visible'))`,
          [id, viewer],
        )
      ).rows[0];
      return row ?? null;
    });
  }

  async follow(actor: string, input: RelationshipUpdate): Promise<void> {
    if (actor === input.targetId)
      throw new CommunityConflictError("Cannot follow yourself");
    await this.mutate(
      actor,
      input.requestId,
      "follow",
      input.targetId,
      input,
      async (db) => {
        // Pair advisory lock prevents a concurrent block from racing a new follow.
        await this.lockPair(db, actor, input.targetId);
        await this.accessible(db, actor, input.targetId);
        if (input.enabled)
          await db.query(
            "INSERT INTO community.follows(follower_id,followed_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [actor, input.targetId],
          );
        else
          await db.query(
            "DELETE FROM community.follows WHERE follower_id=$1 AND followed_id=$2",
            [actor, input.targetId],
          );
      },
    );
  }
  private async lockPair(db: PoolClient, a: string, b: string): Promise<void> {
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      [a, b].sort().join(":"),
    ]);
  }
  async block(actor: string, input: RelationshipUpdate): Promise<void> {
    if (actor === input.targetId)
      throw new CommunityConflictError("Cannot block yourself");
    await this.mutate(
      actor,
      input.requestId,
      "block",
      input.targetId,
      input,
      async (db) => {
        await this.lockPair(db, actor, input.targetId);
        if (input.enabled) await this.active(db, input.targetId);
        if (input.enabled) {
          await db.query(
            "INSERT INTO community.blocks(blocker_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
            [actor, input.targetId],
          );
          await db.query(
            "DELETE FROM community.follows WHERE (follower_id=$1 AND followed_id=$2) OR (follower_id=$2 AND followed_id=$1)",
            [actor, input.targetId],
          );
        } else
          await db.query(
            "DELETE FROM community.blocks WHERE blocker_id=$1 AND blocked_id=$2",
            [actor, input.targetId],
          );
      },
    );
  }
  async listPeople(
    id: string,
    viewer: string | null,
    list: "following" | "followers" | "blocks",
    q: AuthorListQuery,
  ): Promise<AuthorPage<AuthorListItem>> {
    return this.read(async (db) => {
      const u = await this.accessible(db, viewer, id);
      if (
        viewer !== id &&
        (list === "blocks" ||
          u[
            list === "following" ? "following_privacy" : "followers_privacy"
          ] !== "public")
      )
        throw new CommunityNotFoundError();
      const from =
        list === "blocks"
          ? "community.blocks r JOIN community.public_users u ON u.id=r.blocked_id WHERE r.blocker_id=$1"
          : list === "following"
            ? "community.follows r JOIN community.public_users u ON u.id=r.followed_id WHERE r.follower_id=$1"
            : "community.follows r JOIN community.public_users u ON u.id=r.follower_id WHERE r.followed_id=$1";
      const eligible = `${from}${list === "blocks" ? "" : " AND u.status='active' AND community.accounts_can_interact($2,u.id)"}`;
      const values = list === "blocks" ? [id] : [id, viewer];
      const total = Number(
        (
          await db.query<{ total: string }>(
            `SELECT count(*) AS total FROM ${eligible}`,
            values,
          )
        ).rows[0]?.total ?? 0,
      );
      const rows = (
        await db.query<UserRow>(
          `SELECT u.* FROM ${eligible} ORDER BY r.created_at DESC,u.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, q.pageSize, offset(q)],
        )
      ).rows;
      const items = await Promise.all(
        rows.map(async (row) => ({
          id: row.id,
          handle: row.handle,
          displayName: row.display_name,
          avatar: row.avatar_media_id
            ? ((await this.media(db, [row.avatar_media_id]))[0] ?? null)
            : null,
        })),
      );
      return { items, total, page: q.page, pageSize: q.pageSize };
    });
  }
  async readWork(id: string, viewer: string | null): Promise<UserWork> {
    return this.read(async (db) =>
      this.workDto(db, await this.work(db, id, viewer), viewer),
    );
  }
  async listWorks(
    id: string,
    viewer: string | null,
    q: AuthorListQuery,
  ): Promise<AuthorPage<UserWork>> {
    return this.read(async (db) => {
      await this.accessible(db, viewer, id);
      const where =
        "w.author_id=$1 AND w.deleted_at IS NULL AND (w.operator_state='visible' OR w.author_id=$2)";
      const total = Number(
        (
          await db.query<{ total: string }>(
            `SELECT count(*) AS total FROM community.works w WHERE ${where}`,
            [id, viewer],
          )
        ).rows[0]?.total ?? 0,
      );
      const rows = (
        await db.query<WorkRow>(
          `SELECT w.*,u.display_name FROM community.works w JOIN community.public_users u ON u.id=w.author_id WHERE ${where} ORDER BY first_published_at DESC,w.id DESC LIMIT $3 OFFSET $4`,
          [id, viewer, q.pageSize, offset(q)],
        )
      ).rows;
      return {
        items: await Promise.all(rows.map((r) => this.workDto(db, r, viewer))),
        total,
        page: q.page,
        pageSize: q.pageSize,
      };
    });
  }
  async deleteWork(
    actor: string,
    id: string,
    requestId: string,
  ): Promise<void> {
    await this.mutate(actor, requestId, "work.delete", id, {}, async (db) => {
      await this.work(db, id, actor, true);
      await db.query(
        "UPDATE community.works SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE community.work_edit_drafts SET discarded_at=CURRENT_TIMESTAMP WHERE work_id=$1 AND discarded_at IS NULL AND applied_at IS NULL",
        [id],
      );
    });
  }
  async saveDraft(
    actor: string,
    id: string,
    input: WorkDraftSave,
  ): Promise<WorkDraftResult> {
    return this.mutate(
      actor,
      input.requestId,
      "draft.save",
      id,
      input,
      async (db) => {
        const work = await this.work(db, id, actor, true);
        await this.ownedMedia(db, actor, input.content.mediaIds);
        const latest = Number(
          (
            await db.query<{ version: number }>(
              "SELECT coalesce(max(version),0) AS version FROM community.work_edit_drafts WHERE work_id=$1",
              [id],
            )
          ).rows[0]?.version ?? 0,
        );
        const conflict =
          input.baseDraftVersion !== latest ||
          input.baseWorkVersion !== work.version;
        const c = input.content;
        const draft = (
          await db.query<DraftRow>(
            `INSERT INTO community.work_edit_drafts(id,work_id,author_id,version,base_work_version,base_draft_version,title,text,media_ids,conflicted)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [
              opaque("draft"),
              id,
              actor,
              latest + 1,
              input.baseWorkVersion,
              input.baseDraftVersion,
              c.title,
              c.text,
              c.mediaIds,
              conflict,
            ],
          )
        ).rows[0]!;
        return { draft: draftDto(draft), conflict, latestVersion: latest + 1 };
      },
    );
  }
  async listDrafts(
    actor: string,
    id: string,
    q: AuthorListQuery,
  ): Promise<AuthorPage<WorkEditDraft> & { readonly currentVersion: number }> {
    return this.read(async (db) => {
      const work = await this.work(db, id, actor);
      if (work.author_id !== actor) throw new CommunityNotFoundError();
      const where =
        "work_id=$1 AND applied_at IS NULL AND discarded_at IS NULL";
      const total = Number(
        (
          await db.query<{ total: string }>(
            `SELECT count(*) AS total FROM community.work_edit_drafts WHERE ${where}`,
            [id],
          )
        ).rows[0]?.total ?? 0,
      );
      const rows = (
        await db.query<DraftRow>(
          `SELECT * FROM community.work_edit_drafts WHERE ${where} ORDER BY version DESC LIMIT $2 OFFSET $3`,
          [id, q.pageSize, offset(q)],
        )
      ).rows;
      return {
        items: rows.map(draftDto),
        currentVersion: Number(
          (
            await db.query<{ version: number }>(
              "SELECT coalesce(max(version),0) AS version FROM community.work_edit_drafts WHERE work_id=$1",
              [id],
            )
          ).rows[0]?.version ?? 0,
        ),
        total,
        page: q.page,
        pageSize: q.pageSize,
      };
    });
  }
  async applyDraft(
    actor: string,
    id: string,
    input: WorkDraftApply,
  ): Promise<WorkApplyResult> {
    return this.mutate(
      actor,
      input.requestId,
      "draft.apply",
      id,
      input,
      async (db) => {
        const work = await this.work(db, id, actor, true);
        const draft = (
          await db.query<DraftRow>(
            "SELECT * FROM community.work_edit_drafts WHERE id=$1 AND work_id=$2 AND applied_at IS NULL AND discarded_at IS NULL FOR UPDATE",
            [input.draftId, id],
          )
        ).rows[0];
        if (!draft) throw new CommunityNotFoundError();
        if (draft.base_work_version !== work.version)
          return { applied: false, conflict: true, workVersion: work.version };
        if (work.operator_state !== "visible")
          throw new CommunityConflictError(
            "This work is unavailable; edits cannot restore it",
          );
        await this.ownedMedia(db, actor, draft.media_ids);
        await db.query(
          "UPDATE community.works SET title=$2,text=$3,media_ids=$4,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1",
          [id, draft.title, draft.text, draft.media_ids],
        );
        // Consume exactly the chosen version. Newer and unchosen versions survive.
        await db.query(
          "UPDATE community.work_edit_drafts SET applied_at=CURRENT_TIMESTAMP WHERE id=$1",
          [draft.id],
        );
        return {
          applied: true,
          conflict: false,
          workVersion: work.version + 1,
        };
      },
    );
  }
  async discardDraft(
    actor: string,
    id: string,
    draftId: string,
    requestId: string,
  ): Promise<void> {
    await this.mutate(
      actor,
      requestId,
      "draft.discard",
      id,
      { draftId },
      async (db) => {
        await this.work(db, id, actor, true);
        const r = await db.query(
          "UPDATE community.work_edit_drafts SET discarded_at=CURRENT_TIMESTAMP WHERE id=$1 AND work_id=$2 AND author_id=$3 AND applied_at IS NULL",
          [draftId, id, actor],
        );
        if (r.rowCount !== 1) throw new CommunityNotFoundError();
      },
    );
  }
  async changeRelation(
    actor: string,
    relation: "favorite" | "like",
    input: ContentRelationUpdate,
  ): Promise<void> {
    await this.mutate(
      actor,
      input.requestId,
      relation,
      input.target.id,
      input,
      async (db) => {
        if (input.target.type === "work" && input.enabled) {
          const work = await this.work(db, input.target.id, actor, false, true);
          if (work.operator_state !== "visible")
            throw new CommunityNotFoundError();
          await this.lockPair(db, actor, work.author_id);
          await this.accessible(db, actor, work.author_id);
        }
        if (input.enabled)
          await db.query(
            "INSERT INTO community.content_relations(user_id,content_type,content_id,relation) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [actor, input.target.type, input.target.id, relation],
          );
        else
          await db.query(
            "DELETE FROM community.content_relations WHERE user_id=$1 AND content_type=$2 AND content_id=$3 AND relation=$4",
            [actor, input.target.type, input.target.id, relation],
          );
      },
    );
  }
  async mergeGuestFavorites(
    actor: string,
    input: GuestFavoriteMerge,
  ): Promise<{ acknowledged: readonly ContentIdentity[] }> {
    if (input.expectedAccountId !== actor)
      throw new CommunityConflictError("账户已变化，请重新确认收藏导入账户");
    return this.mutate(
      actor,
      input.requestId,
      "guest-favorites.merge",
      actor,
      input,
      async (db) => {
        const acknowledged: ContentIdentity[] = [];
        for (const target of input.items) {
          // Unavailable relations are retained without claiming public availability.
          await db.query(
            "INSERT INTO community.content_relations(user_id,content_type,content_id,relation) VALUES($1,$2,$3,'favorite') ON CONFLICT DO NOTHING",
            [actor, target.type, target.id],
          );
          acknowledged.push(target);
        }
        return { acknowledged };
      },
    );
  }
}
