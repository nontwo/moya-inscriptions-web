import { asCommunityOperationError } from "./availability.js";
import {
  applyCommentModerationSql,
  countModerationActionsInRangeSql,
  countModerationEventsSql,
  countOperatorCommentsByStateSql,
  countOperatorCommentsSql,
  countVisibleCommentsSql,
  countVisibleRepliesByRootSql,
  countVisibleRepliesSql,
  findCommentSql,
  findOperatorCommentSql,
  findReplySql,
  insertCommentSql,
  insertModerationEventSql,
  insertReplySql,
  listEmbeddedRepliesSql,
  listModerationEventsSql,
  listOperatorCommentsNewestSql,
  listOperatorCommentsOldestSql,
  listVisibleCommentsSql,
  listVisibleRepliesSql,
  readPublicationSettingSql,
  recentModerationEventsSql,
  selectHotCommentsSql,
  toSearchPattern,
  writePublicationSettingSql,
} from "./comment-queries.js";
import {
  mapCommentRow,
  mapModerationEventRow,
  mapOperatorCommentRow,
  mapReplyRow,
  parseCommentTotal,
} from "./comment-row-mapper.js";

import type {
  CommentRow,
  ModerationEventRow,
  OperatorCommentRow,
} from "./comment-row-mapper.js";
import type {
  CatalogCommentReplyRecord,
  CatalogCommentRecord,
  CatalogCommentWithReplies,
  CommentInsert,
  CommentListingRecord,
  CommentPageQuery,
  CommentPageRecord,
  CommunityCommentPort,
  ModeratedSubject,
  ModerationEvent,
  ModerationEventDraft,
  ModerationEventQueryInput,
  ModerationSummaryRecord,
  OperatorCommentListing,
  OperatorCommentQueryInput,
  OperatorCommentRecord,
  OperatorQueueCountsRecord,
  ReplyInsert,
  ReplyPageQuery,
} from "@moya/api";
import type { CatalogCommentId } from "@moya/contracts";
import type {
  CommentModerationState,
  ModerationEventAction,
  PublicationPolicy,
} from "@moya/contracts/internal/community-operator";
import type { Pool, PoolClient, QueryResultRow } from "pg";

const offset = (page: number, pageSize: number): number =>
  (page - 1) * pageSize;

/** Absent states count zero; `all` is the sum, never a separate query. */
const toQueueCounts = (
  rows: readonly ({ moderation: unknown; total: unknown } & QueryResultRow)[],
): OperatorQueueCountsRecord => {
  const counts = { pending: 0, visible: 0, hidden: 0 };
  for (const row of rows) {
    if (
      row.moderation === "pending" ||
      row.moderation === "visible" ||
      row.moderation === "hidden"
    )
      counts[row.moderation] = parseCommentTotal(row.total);
  }
  return { ...counts, all: counts.pending + counts.visible + counts.hidden };
};

/** Runs one parameterized statement on whichever connection the caller holds. */
type Runner = <Row extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: readonly unknown[],
) => Promise<readonly Row[]>;

/**
 * App-role adapter for comments, moderation and the publication setting. It is
 * DML-only: no statement here creates, alters or drops anything, and nothing is
 * ever deleted.
 */
export class PostgresCommunityCommentAdapter implements CommunityCommentPort {
  constructor(private readonly pool: Pool) {}

  /**
   * One repeatable-read snapshot: the hot selection, the latest page, its
   * total and the embedded replies all describe the same instant, so the two
   * lists cannot overlap and the total cannot disagree with them.
   */
  async readVisibleComments(
    query: CommentPageQuery,
  ): Promise<CommentListingRecord<CatalogCommentWithReplies>> {
    return this.snapshot(async (run) => {
      const hot =
        query.hotLimit > 0
          ? (
              await run<CommentRow>(selectHotCommentsSql, [
                query.catalogId,
                query.hotLimit,
              ])
            ).map(mapCommentRow)
          : [];
      const excluded = [
        ...new Set([...query.pinned, ...hot.map((comment) => comment.id)]),
      ];
      const totals = await run<{ total: unknown } & QueryResultRow>(
        countVisibleCommentsSql,
        [query.catalogId, excluded],
      );
      const latest = (
        await run<CommentRow>(listVisibleCommentsSql, [
          query.catalogId,
          query.pageSize,
          offset(query.page, query.pageSize),
          excluded,
        ])
      ).map(mapCommentRow);
      const rootIds = [...hot, ...latest].map((comment) => comment.id);
      const [repliesByRoot, replyTotals] = [
        await this.readEmbeddedReplies(run, rootIds, query.embeddedReplyLimit),
        await this.readReplyTotals(run, rootIds),
      ];
      const attach = (
        comment: CatalogCommentRecord,
      ): CatalogCommentWithReplies => ({
        ...comment,
        replies: repliesByRoot.get(comment.id) ?? [],
        replyTotal: replyTotals.get(comment.id) ?? 0,
      });
      return {
        hot: hot.map(attach),
        items: latest.map(attach),
        total: parseCommentTotal(totals[0]?.total),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
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
    audit?: ModerationEventDraft,
  ): Promise<ModeratedSubject | null> {
    const values = [id, moderation, operatorLabel, at, [...from]];
    type Changed = {
      id: unknown;
      moderation: unknown;
      kind: unknown;
    } & QueryResultRow;
    const rows =
      audit === undefined
        ? await this.query<Changed>(applyCommentModerationSql, values)
        : await this.transaction(async (run) => {
            const changed = await run<Changed>(
              applyCommentModerationSql,
              values,
            );
            const subject = changed[0];
            // The audit row exists exactly when the transition happened.
            if (subject !== undefined)
              await run(insertModerationEventSql, [
                audit.id,
                audit.occurredAt,
                audit.operatorLabel,
                audit.action,
                subject.kind,
                subject.id,
                audit.detail ?? null,
              ]);
            return changed;
          });
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

  /**
   * The review listing and its status counts from one snapshot, so the tab
   * numbers always describe the page beside them. Search is a bounded
   * substring match; the order is the review order, never the public one.
   */
  async readOperatorComments(
    query: OperatorCommentQueryInput,
  ): Promise<OperatorCommentListing> {
    const filters = [
      query.moderation ?? null,
      query.kind ?? null,
      query.catalogId ?? null,
      query.search === undefined ? null : toSearchPattern(query.search),
    ];
    return this.snapshot(async (run) => {
      const totals = await run<{ total: unknown } & QueryResultRow>(
        countOperatorCommentsSql,
        filters,
      );
      const byState = await run<
        { moderation: unknown; total: unknown } & QueryResultRow
      >(countOperatorCommentsByStateSql, [null, ...filters.slice(1)]);
      const rows = await run<OperatorCommentRow>(
        query.order === "oldest"
          ? listOperatorCommentsOldestSql
          : listOperatorCommentsNewestSql,
        [...filters, query.pageSize, offset(query.page, query.pageSize)],
      );
      return {
        items: rows.map(mapOperatorCommentRow),
        counts: toQueueCounts(byState),
        total: parseCommentTotal(totals[0]?.total),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async findOperatorComment(
    id: CatalogCommentId,
  ): Promise<OperatorCommentRecord | null> {
    const rows = await this.query<OperatorCommentRow>(findOperatorCommentSql, [
      id,
    ]);
    const row = rows[0];
    return row === undefined ? null : mapOperatorCommentRow(row);
  }

  async readModerationEvents(
    query: ModerationEventQueryInput,
  ): Promise<CommentPageRecord<ModerationEvent>> {
    const filters = [query.subjectId ?? null, query.action ?? null];
    return this.snapshot(async (run) => {
      const totals = await run<{ total: unknown } & QueryResultRow>(
        countModerationEventsSql,
        filters,
      );
      const rows = await run<ModerationEventRow>(listModerationEventsSql, [
        ...filters,
        query.pageSize,
        offset(query.page, query.pageSize),
      ]);
      return {
        items: rows.map(mapModerationEventRow),
        total: parseCommentTotal(totals[0]?.total),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async readModerationSummary(range: {
    readonly from: Date;
    readonly to: Date;
  }): Promise<ModerationSummaryRecord> {
    return this.snapshot(async (run) => {
      const byState = await run<
        { moderation: unknown; total: unknown } & QueryResultRow
      >(countOperatorCommentsByStateSql, [null, null, null, null]);
      const byAction = await run<
        { action: unknown; total: unknown } & QueryResultRow
      >(countModerationActionsInRangeSql, [range.from, range.to]);
      const recent = await run<ModerationEventRow>(
        recentModerationEventsSql,
        [10],
      );
      const actions: Record<ModerationEventAction, number> = {
        approve: 0,
        reject: 0,
        hide: 0,
        unhide: 0,
        suspend: 0,
        reinstate: 0,
        set_publication_policy: 0,
      };
      for (const row of byAction) {
        const action = String(row.action) as ModerationEventAction;
        if (action in actions) actions[action] = parseCommentTotal(row.total);
      }
      return {
        queue: toQueueCounts(byState),
        actions,
        recentEvents: recent.map(mapModerationEventRow),
      };
    });
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

  private async readReplyTotals(
    run: Runner,
    rootIds: readonly CatalogCommentId[],
  ): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (rootIds.length === 0) return totals;
    const rows = await run<
      { root_comment_id: unknown; total: unknown } & QueryResultRow
    >(countVisibleRepliesByRootSql, [[...rootIds]]);
    for (const row of rows)
      totals.set(String(row.root_comment_id), parseCommentTotal(row.total));
    return totals;
  }

  private async readEmbeddedReplies(
    run: Runner,
    rootIds: readonly CatalogCommentId[],
    limit: number,
  ): Promise<Map<string, CatalogCommentReplyRecord[]>> {
    const grouped = new Map<string, CatalogCommentReplyRecord[]>();
    if (rootIds.length === 0 || limit <= 0) return grouped;
    const rows = await run<CommentRow>(listEmbeddedRepliesSql, [
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

  private async connect(): Promise<PoolClient> {
    try {
      return await this.pool.connect();
    } catch (error) {
      throw asCommunityOperationError(error, "connect");
    }
  }

  private async query<Row extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: readonly unknown[],
  ): Promise<readonly Row[]> {
    const client = await this.connect();
    try {
      const result = await client.query<Row>(sql, [...values]);
      return result.rows;
    } catch (error) {
      throw asCommunityOperationError(error, "query");
    } finally {
      client.release();
    }
  }

  /** A read-only repeatable-read transaction: every statement sees one snapshot. */
  private snapshot<Result>(
    read: (run: Runner) => Promise<Result>,
  ): Promise<Result> {
    return this.inTransaction(
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      read,
    );
  }

  /** A read-write transaction: a transition and its audit row commit together. */
  private transaction<Result>(
    write: (run: Runner) => Promise<Result>,
  ): Promise<Result> {
    return this.inTransaction("BEGIN", write);
  }

  private async inTransaction<Result>(
    begin: string,
    work: (run: Runner) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.connect();
    const run: Runner = async (sql, values) =>
      (await client.query(sql, [...values])).rows;
    try {
      await client.query(begin);
      const result = await work(run);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw asCommunityOperationError(error, "query");
    } finally {
      client.release();
    }
  }
}
