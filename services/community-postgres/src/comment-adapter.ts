import { asCommunityOperationError } from "./availability.js";
import {
  applyCommentModerationSql,
  countOperatorCommentsSql,
  countVisibleCommentsSql,
  countVisibleRepliesSql,
  findCommentSql,
  findReplySql,
  insertCommentSql,
  insertModerationEventSql,
  insertReplySql,
  listEmbeddedRepliesSql,
  listOperatorCommentsSql,
  listVisibleCommentsSql,
  listVisibleRepliesSql,
  readPublicationSettingSql,
  writePublicationSettingSql,
} from "./comment-queries.js";
import {
  mapCommentRow,
  mapOperatorCommentRow,
  mapReplyRow,
  parseCommentTotal,
} from "./comment-row-mapper.js";

import type { CommentRow, OperatorCommentRow } from "./comment-row-mapper.js";
import type {
  CatalogCommentReplyRecord,
  CatalogCommentRecord,
  CatalogCommentWithReplies,
  CommentInsert,
  CommentPageQuery,
  CommentPageRecord,
  CommunityCommentPort,
  ModeratedSubject,
  ModerationEvent,
  OperatorCommentQueryInput,
  ReplyInsert,
  ReplyPageQuery,
} from "@moya/api";
import type { CatalogCommentId } from "@moya/contracts";
import type {
  CommentModerationState,
  OperatorComment,
  PublicationPolicy,
} from "@moya/contracts/internal/community-operator";
import type { Pool, QueryResultRow } from "pg";

const offset = (page: number, pageSize: number): number =>
  (page - 1) * pageSize;

/**
 * App-role adapter for comments, moderation and the publication setting. It is
 * DML-only: no statement here creates, alters or drops anything, and nothing is
 * ever deleted.
 */
export class PostgresCommunityCommentAdapter implements CommunityCommentPort {
  constructor(private readonly pool: Pool) {}

  async readVisibleComments(
    query: CommentPageQuery,
  ): Promise<CommentPageRecord<CatalogCommentWithReplies>> {
    const [totals, rows] = await Promise.all([
      this.query<{ total: unknown } & QueryResultRow>(countVisibleCommentsSql, [
        query.catalogId,
      ]),
      this.query<CommentRow>(listVisibleCommentsSql, [
        query.catalogId,
        query.pageSize,
        offset(query.page, query.pageSize),
      ]),
    ]);
    const comments = rows.map(mapCommentRow);
    const repliesByRoot = await this.readEmbeddedReplies(
      comments.map((comment) => comment.id),
      query.embeddedReplyLimit,
    );
    return {
      items: comments.map((comment) => ({
        ...comment,
        replies: repliesByRoot.get(comment.id) ?? [],
      })),
      total: parseCommentTotal(totals[0]?.total),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async readVisibleReplies(
    query: ReplyPageQuery,
  ): Promise<CommentPageRecord<CatalogCommentReplyRecord>> {
    const [totals, rows] = await Promise.all([
      this.query<{ total: unknown } & QueryResultRow>(countVisibleRepliesSql, [
        query.rootCommentId,
      ]),
      this.query<CommentRow>(listVisibleRepliesSql, [
        query.rootCommentId,
        query.pageSize,
        offset(query.page, query.pageSize),
      ]),
    ]);
    return {
      items: rows.map(mapReplyRow),
      total: parseCommentTotal(totals[0]?.total),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findComment(
    id: CatalogCommentId,
  ): Promise<CatalogCommentRecord | null> {
    const rows = await this.query<CommentRow>(findCommentSql, [id]);
    const row = rows[0];
    return row === undefined ? null : mapCommentRow(row);
  }

  async findReply(
    id: CatalogCommentId,
  ): Promise<CatalogCommentReplyRecord | null> {
    const rows = await this.query<CommentRow>(findReplySql, [id]);
    const row = rows[0];
    return row === undefined ? null : mapReplyRow(row);
  }

  async insertComment(comment: CommentInsert): Promise<CatalogCommentRecord> {
    const rows = await this.query<CommentRow>(insertCommentSql, [
      comment.id,
      comment.catalogId,
      comment.authorId,
      comment.text,
      comment.moderation,
      comment.createdAt,
    ]);
    const row = rows[0];
    if (row === undefined) throw new Error("Comment insert returned no row");
    return mapCommentRow(row);
  }

  async insertReply(reply: ReplyInsert): Promise<CatalogCommentReplyRecord> {
    const rows = await this.query<CommentRow>(insertReplySql, [
      reply.id,
      reply.rootCommentId,
      reply.authorId,
      reply.text,
      reply.moderation,
      reply.createdAt,
      reply.replyToReplyId ?? null,
    ]);
    const row = rows[0];
    if (row === undefined) throw new Error("Reply insert returned no row");
    return mapReplyRow(row);
  }

  async applyCommentModeration(
    id: CatalogCommentId,
    moderation: CommentModerationState,
    from: readonly CommentModerationState[],
    operatorLabel: string,
    at: Date,
  ): Promise<ModeratedSubject | null> {
    const rows = await this.query<
      { id: unknown; moderation: unknown; kind: unknown } & QueryResultRow
    >(applyCommentModerationSql, [
      id,
      moderation,
      operatorLabel,
      at,
      [...from],
    ]);
    const row = rows[0];
    if (row === undefined) return null;
    if (
      typeof row.id !== "string" ||
      (row.kind !== "comment" && row.kind !== "reply") ||
      typeof row.moderation !== "string"
    )
      throw new Error("Invalid PostgreSQL moderation result");
    return {
      id: row.id as CatalogCommentId,
      kind: row.kind,
      moderation: row.moderation as CommentModerationState,
    };
  }

  async readOperatorComments(
    query: OperatorCommentQueryInput,
  ): Promise<CommentPageRecord<OperatorComment>> {
    const moderation = query.moderation ?? null;
    const [totals, rows] = await Promise.all([
      this.query<{ total: unknown } & QueryResultRow>(
        countOperatorCommentsSql,
        [moderation],
      ),
      this.query<OperatorCommentRow>(listOperatorCommentsSql, [
        moderation,
        query.pageSize,
        offset(query.page, query.pageSize),
      ]),
    ]);
    return {
      items: rows.map(mapOperatorCommentRow),
      total: parseCommentTotal(totals[0]?.total),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async readPublicationPolicy(): Promise<{
    readonly policy: PublicationPolicy;
    readonly updatedAt: Date;
    readonly updatedBy: string;
  }> {
    const rows = await this.query<
      {
        policy: unknown;
        updated_at: unknown;
        updated_by: unknown;
      } & QueryResultRow
    >(readPublicationSettingSql, []);
    const row = rows[0];
    if (
      row === undefined ||
      (row.policy !== "PRE_MODERATION" &&
        row.policy !== "DIRECT_PUBLICATION") ||
      !(row.updated_at instanceof Date) ||
      typeof row.updated_by !== "string"
    )
      throw new Error("Invalid PostgreSQL publication setting row");
    return {
      policy: row.policy,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    };
  }

  async writePublicationPolicy(
    policy: PublicationPolicy,
    operatorLabel: string,
    at: Date,
  ): Promise<void> {
    await this.query(writePublicationSettingSql, [policy, operatorLabel, at]);
  }

  async recordModerationEvent(event: ModerationEvent): Promise<void> {
    await this.query(insertModerationEventSql, [
      event.id,
      event.occurredAt,
      event.operatorLabel,
      event.action,
      event.subjectKind,
      event.subjectId,
      event.detail ?? null,
    ]);
  }

  private async readEmbeddedReplies(
    rootIds: readonly CatalogCommentId[],
    limit: number,
  ): Promise<Map<string, CatalogCommentReplyRecord[]>> {
    const grouped = new Map<string, CatalogCommentReplyRecord[]>();
    if (rootIds.length === 0 || limit <= 0) return grouped;
    const rows = await this.query<CommentRow>(listEmbeddedRepliesSql, [
      [...rootIds],
      limit,
    ]);
    for (const reply of rows.map(mapReplyRow)) {
      const bucket = grouped.get(reply.rootCommentId);
      if (bucket === undefined) grouped.set(reply.rootCommentId, [reply]);
      else bucket.push(reply);
    }
    return grouped;
  }

  private async query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: readonly unknown[],
  ): Promise<readonly Row[]> {
    let client;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw asCommunityOperationError(error, "connect");
    }
    try {
      const result = await client.query<Row>(sql, [...values]);
      return result.rows;
    } catch (error) {
      throw asCommunityOperationError(error, "query");
    } finally {
      client.release();
    }
  }
}
