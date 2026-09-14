import { asCommunityOperationError } from "./availability.js";
import { createHash, randomUUID } from "node:crypto";
import { CommunityConflictError, CommunityNotFoundError } from "@moya/api";
import type { CommunityContentOperatorPort } from "@moya/api";
import {
  operatorWorkSchema,
  operatorWorkPageSchema,
  featuredPageSchema,
} from "@moya/contracts/internal/community-operator";
import type {
  OperatorContentQuery,
  OperatorWork,
  OperatorWorkPage,
  ModerateWorkCommand,
  FeaturedMutation,
  FeaturedSettingsMutation,
  FeaturedPage,
} from "@moya/contracts/internal/community-operator";
import type { Pool, PoolClient, QueryResultRow } from "pg";
interface WorkRow extends QueryResultRow {
  id: string;
  title: string;
  text: string;
  author_id: string;
  display_name: string;
  author_status: "active" | "suspended";
  operator_state: "visible" | "hidden" | "removed";
  deleted_at: Date | null;
  version: number;
  first_published_at: Date | null;
  public_revision_id: string | null;
  latest_submission: OperatorWork["latestSubmission"];
  publicly_visible: boolean;
}
const workProjection = `SELECT w.*,u.display_name,u.status AS author_status,
  community.work_is_public(w) AND u.status='active' AS publicly_visible,
  (SELECT json_build_object('revisionId',r.id,'title',r.title,'disposition',r.disposition)
   FROM community.work_revisions r WHERE r.work_id=w.id
   AND r.disposition<>'not_required' AND w.deleted_at IS NULL
   ORDER BY r.sequence DESC LIMIT 1) AS latest_submission
  FROM community.works w JOIN community.public_users u ON u.id=w.author_id`;
const workDto = (w: WorkRow): OperatorWork =>
  operatorWorkSchema.parse({
    id: w.id,
    title: w.title,
    text: w.text,
    authorId: w.author_id,
    authorName: w.display_name,
    authorStatus: w.author_status,
    state: w.operator_state,
    authorDeleted: w.deleted_at !== null,
    version: w.version,
    firstPublishedAt: w.first_published_at?.toISOString() ?? null,
    latestSubmission: w.latest_submission,
    publicRevisionId: w.deleted_at === null ? w.public_revision_id : null,
    publiclyVisible: w.publicly_visible,
  });
export class PostgresCommunityContentOperatorAdapter implements CommunityContentOperatorPort {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(
    run: (db: PoolClient) => Promise<T>,
    read = false,
  ): Promise<T> {
    const db = await this.pool.connect().catch((error) => {
      throw asCommunityOperationError(error, "connect");
    });
    try {
      await db.query(
        read ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN",
      );
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
  private mutate<T>(
    operator: string,
    requestId: string,
    action: string,
    target: { type: string; id: string } | null,
    input: unknown,
    change: (db: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.transaction(async (db) => {
      await db.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('phase4-content-operator',0))",
      );
      const fingerprint = createHash("sha256")
        .update(JSON.stringify([action, target, input]))
        .digest("hex");
      const old = await db.query(
        "SELECT fingerprint,result FROM community.content_operator_receipts WHERE operator_label=$1 AND request_id=$2",
        [operator, requestId],
      );
      if (old.rows[0]) {
        if (old.rows[0].fingerprint !== fingerprint)
          throw new CommunityConflictError("Request identity already used");
        return old.rows[0].result as T;
      }
      const result = await change(db);
      await db.query(
        "INSERT INTO community.content_operator_events(id,operator_label,action,content_type,content_id,detail) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          operator,
          action,
          target?.type ?? null,
          target?.id ?? null,
          JSON.stringify({ command: input, result }),
        ],
      );
      await db.query(
        "INSERT INTO community.content_operator_receipts(operator_label,request_id,fingerprint,result) VALUES($1,$2,$3,$4)",
        [operator, requestId, fingerprint, JSON.stringify(result)],
      );
      return result;
    });
  }
  async readWorkTitle(id: string): Promise<string | null> {
    return (
      (
        await this.pool
          .query("SELECT title FROM community.works WHERE id=$1", [id])
          .catch((error) => {
            throw asCommunityOperationError(error, "query");
          })
      ).rows[0]?.title ?? null
    );
  }
  /**
   * Works newest first by first publication, else first submission. Search
   * covers the public text and, for a pending or never-public work, the text
   * of the author's current revision when it requested public visibility
   * (content operators already see in the submission queue); self-only
   * content stays unsearchable.
   */
  async readWorks(query: OperatorContentQuery): Promise<OperatorWorkPage> {
    return this.transaction(async (db) => {
      const where = ` LEFT JOIN community.work_revisions ar ON ar.id=w.author_revision_id AND ar.requested_visibility='public'
        WHERE ($1='' OR position(lower($1) in lower(w.id||' '||w.title||' '||w.text||' '||COALESCE(ar.title,'')||' '||COALESCE(ar.body,'')||' '||u.display_name||' '||u.handle))>0)`;
      const total = await db.query(
        `SELECT COUNT(*)::integer AS total FROM community.works w JOIN community.public_users u ON u.id=w.author_id${where}`,
        [query.search],
      );
      const rows = await db.query<WorkRow>(
        `${workProjection}${where} ORDER BY COALESCE(w.first_published_at,w.first_submitted_at,w.updated_at) DESC,w.id LIMIT $2 OFFSET $3`,
        [query.search, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return operatorWorkPageSchema.parse({
        items: rows.rows.map(workDto),
        total: total.rows[0].total,
        page: query.page,
        pageSize: query.pageSize,
      });
    }, true);
  }
  async moderateWork(
    id: string,
    operator: string,
    input: ModerateWorkCommand,
  ): Promise<OperatorWork> {
    return this.mutate(
      operator,
      input.requestId,
      "work.moderate",
      { type: "work", id },
      input,
      async (db) => {
        const before = (
          await db.query<WorkRow>(
            `${workProjection} WHERE w.id=$1 FOR UPDATE OF w`,
            [id],
          )
        ).rows[0];
        if (!before) throw new CommunityNotFoundError();
        if (before.deleted_at || before.version !== input.expectedVersion)
          throw new CommunityConflictError("Work changed or author deleted it");
        await db.query(
          "UPDATE community.works SET operator_state=$2,version=version+1,updated_at=statement_timestamp() WHERE id=$1",
          [id, input.state],
        );
        return workDto(
          (await db.query<WorkRow>(`${workProjection} WHERE w.id=$1`, [id]))
            .rows[0]!,
        );
      },
    );
  }
  async readFeatured(query: OperatorContentQuery): Promise<FeaturedPage> {
    return this.transaction(async (db) => {
      const from = `FROM community.featured_content f LEFT JOIN catalog_discovery c ON f.content_type='catalog' AND c.catalog_id=f.content_id LEFT JOIN community.works w ON f.content_type='work' AND w.id=f.content_id LEFT JOIN community.public_users u ON u.id=w.author_id`;
      const where =
        " WHERE ($1='' OR position(lower($1) in lower(COALESCE(c.title,w.title,f.content_id)))>0)";
      const total = (
        await db.query(`SELECT COUNT(*)::integer AS total ${from}${where}`, [
          query.search,
        ])
      ).rows[0].total;
      const rows = await db.query(
        `SELECT f.*,COALESCE(c.title,w.title) AS title,CASE WHEN f.content_type='catalog' THEN c.catalog_id IS NOT NULL ELSE w.id IS NOT NULL AND community.work_is_public(w) AND u.status='active' END AS eligible ${from}${where} ORDER BY f.position,f.content_type,f.content_id LIMIT $2 OFFSET $3`,
        [query.search, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const settings = (
        await db.query(
          "SELECT enabled_quantity,version FROM community.featured_settings WHERE id=TRUE",
        )
      ).rows[0];
      return featuredPageSchema.parse({
        items: rows.rows.map((r) => ({
          target: { type: r.content_type, id: r.content_id },
          title: r.title,
          eligible: r.eligible,
          enabled: r.enabled,
          position: Number(r.position),
          version: r.version,
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
        enabledQuantity:
          settings.enabled_quantity === null
            ? null
            : Number(settings.enabled_quantity),
        settingsVersion: settings.version,
      });
    }, true);
  }
  async setFeatured(
    operator: string,
    input: FeaturedMutation,
  ): Promise<{ version: number }> {
    return this.mutate(
      operator,
      input.requestId,
      "featured.set",
      input.target,
      input,
      async (db) => {
        const row = (
          await db.query(
            "SELECT version FROM community.featured_content WHERE content_type=$1 AND content_id=$2 FOR UPDATE",
            [input.target.type, input.target.id],
          )
        ).rows[0];
        if ((row?.version ?? 0) !== input.expectedVersion)
          throw new CommunityConflictError("Featured membership changed");
        if (!row) {
          const exists = await db.query(
            input.target.type === "catalog"
              ? "SELECT catalog_id FROM catalog_discovery WHERE catalog_id=$1"
              : "SELECT id FROM community.works WHERE id=$1",
            [input.target.id],
          );
          if (!exists.rows.length) throw new CommunityNotFoundError();
        }
        // Featuring is a public exposure: a work that is not effectively
        // public (self-only, pending first submission, trashed, hidden,
        // removed or by an inactive author) cannot be enabled.
        if (
          input.target.type === "work" &&
          input.enabled &&
          (
            await db.query(
              "SELECT 1 FROM community.works w JOIN community.public_users u ON u.id=w.author_id WHERE w.id=$1 AND community.work_is_public(w) AND u.status='active' FOR SHARE OF w",
              [input.target.id],
            )
          ).rowCount !== 1
        )
          throw new CommunityConflictError(
            "Only a public work can be featured",
          );
        const updated = await db.query(
          "INSERT INTO community.featured_content(content_type,content_id,enabled,position) VALUES($1,$2,$3,$4) ON CONFLICT(content_type,content_id) DO UPDATE SET enabled=EXCLUDED.enabled,position=EXCLUDED.position,version=community.featured_content.version+1 RETURNING version",
          [input.target.type, input.target.id, input.enabled, input.position],
        );
        return { version: updated.rows[0].version };
      },
    );
  }
  async setFeaturedQuantity(
    operator: string,
    input: FeaturedSettingsMutation,
  ): Promise<{ version: number }> {
    return this.mutate(
      operator,
      input.requestId,
      "featured.quantity",
      null,
      input,
      async (db) => {
        const row = (
          await db.query(
            "SELECT version FROM community.featured_settings WHERE id=TRUE FOR UPDATE",
          )
        ).rows[0];
        if (row.version !== input.expectedVersion)
          throw new CommunityConflictError("Featured settings changed");
        const updated = await db.query(
          "UPDATE community.featured_settings SET enabled_quantity=$1,version=version+1 WHERE id=TRUE RETURNING version",
          [input.enabledQuantity],
        );
        return { version: updated.rows[0].version };
      },
    );
  }
}
