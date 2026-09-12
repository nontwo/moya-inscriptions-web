import { CommunityStoreUnavailableError } from "@moya/api";

import { fixtureUsers } from "./community-identity-fixture.js";

import type {
  CatalogCommentReplyRecord,
  CatalogCommentRecord,
  CatalogCommentWithReplies,
  CatalogPublicationPort,
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
import type { CatalogCommentId, CatalogId } from "@moya/contracts";
import type {
  CommentModerationState,
  OperatorComment,
  PublicationPolicy,
} from "@moya/contracts/internal/community-operator";

export const publishedCatalogId = "catalog-published-01" as CatalogId;

/** Only the published record answers true, mirroring the Catalog read side. */
export class FixtureCatalogPublicationPort implements CatalogPublicationPort {
  constructor(
    private readonly published: ReadonlySet<string> = new Set([
      publishedCatalogId,
    ]),
  ) {}

  async isPublished(catalogId: CatalogId): Promise<boolean> {
    return this.published.has(catalogId);
  }
}

const byNewest = (
  left: { createdAt: Date; id: string },
  right: { createdAt: Date; id: string },
): number =>
  right.createdAt.getTime() - left.createdAt.getTime() ||
  right.id.localeCompare(left.id);

const byOldest = (
  left: { createdAt: Date; id: string },
  right: { createdAt: Date; id: string },
): number =>
  left.createdAt.getTime() - right.createdAt.getTime() ||
  left.id.localeCompare(right.id);

/** Deterministic in-memory port mirroring the adapter's SQL semantics. */
export class InMemoryCommunityCommentPort implements CommunityCommentPort {
  readonly comments = new Map<string, CatalogCommentRecord>();
  readonly replies = new Map<
    string,
    CatalogCommentReplyRecord & { readonly replyToReplyId?: string }
  >();
  readonly events: ModerationEvent[] = [];
  policy: PublicationPolicy = "PRE_MODERATION";
  policyUpdatedAt = new Date("2026-09-12T00:00:00.000Z");
  policyUpdatedBy = "platform";
  unavailable = false;

  private assertAvailable(): void {
    if (this.unavailable) throw new CommunityStoreUnavailableError();
  }

  private visibleRepliesFor(rootId: string): CatalogCommentReplyRecord[] {
    return [...this.replies.values()]
      .filter(
        (reply) =>
          reply.rootCommentId === rootId && reply.moderation === "visible",
      )
      .sort(byOldest);
  }

  async readVisibleComments(
    query: CommentPageQuery,
  ): Promise<CommentPageRecord<CatalogCommentWithReplies>> {
    this.assertAvailable();
    const matching = [...this.comments.values()]
      .filter(
        (comment) =>
          comment.catalogId === query.catalogId &&
          comment.moderation === "visible",
      )
      .sort(byNewest);
    const start = (query.page - 1) * query.pageSize;
    return {
      items: matching.slice(start, start + query.pageSize).map((comment) => ({
        ...comment,
        replies: this.visibleRepliesFor(comment.id).slice(
          0,
          query.embeddedReplyLimit,
        ),
      })),
      total: matching.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async readVisibleReplies(
    query: ReplyPageQuery,
  ): Promise<CommentPageRecord<CatalogCommentReplyRecord>> {
    this.assertAvailable();
    const matching = this.visibleRepliesFor(query.rootCommentId);
    const start = (query.page - 1) * query.pageSize;
    return {
      items: matching.slice(start, start + query.pageSize),
      total: matching.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findComment(
    id: CatalogCommentId,
  ): Promise<CatalogCommentRecord | null> {
    this.assertAvailable();
    return this.comments.get(id) ?? null;
  }

  async findReply(
    id: CatalogCommentId,
  ): Promise<CatalogCommentReplyRecord | null> {
    this.assertAvailable();
    return this.replies.get(id) ?? null;
  }

  async insertComment(comment: CommentInsert): Promise<CatalogCommentRecord> {
    this.assertAvailable();
    const author = fixtureUsers.active;
    const record: CatalogCommentRecord = {
      id: comment.id,
      catalogId: comment.catalogId,
      author: { id: comment.authorId, displayName: author.displayName },
      text: comment.text,
      createdAt: comment.createdAt,
      moderation: comment.moderation,
    };
    this.comments.set(record.id, record);
    return record;
  }

  async insertReply(reply: ReplyInsert): Promise<CatalogCommentReplyRecord> {
    this.assertAvailable();
    const target =
      reply.replyToReplyId === undefined
        ? undefined
        : this.replies.get(reply.replyToReplyId);
    const record: CatalogCommentReplyRecord & { replyToReplyId?: string } = {
      id: reply.id,
      rootCommentId: reply.rootCommentId,
      author: {
        id: reply.authorId,
        displayName: fixtureUsers.active.displayName,
      },
      text: reply.text,
      createdAt: reply.createdAt,
      moderation: reply.moderation,
      ...(target === undefined ? {} : { replyTo: target.author }),
      ...(reply.replyToReplyId === undefined
        ? {}
        : { replyToReplyId: reply.replyToReplyId }),
    };
    this.replies.set(record.id, record);
    return record;
  }

  /** Mirrors the adapter: a row outside `from` matches nothing. */
  async applyCommentModeration(
    id: CatalogCommentId,
    moderation: CommentModerationState,
    from: readonly CommentModerationState[],
  ): Promise<ModeratedSubject | null> {
    this.assertAvailable();
    const comment = this.comments.get(id);
    if (comment !== undefined && from.includes(comment.moderation)) {
      this.comments.set(id, { ...comment, moderation });
      return { id, kind: "comment", moderation };
    }
    const reply = this.replies.get(id);
    if (reply !== undefined && from.includes(reply.moderation)) {
      this.replies.set(id, { ...reply, moderation });
      return { id, kind: "reply", moderation };
    }
    return null;
  }

  async readOperatorComments(
    query: OperatorCommentQueryInput,
  ): Promise<CommentPageRecord<OperatorComment>> {
    this.assertAvailable();
    const rows: OperatorComment[] = [
      ...[...this.comments.values()].map((comment) => ({
        id: comment.id,
        kind: "comment" as const,
        catalogId: comment.catalogId,
        author: {
          id: comment.author.id,
          handle: fixtureUsers.active.handle,
          displayName: comment.author.displayName,
          status: "active" as const,
        },
        text: comment.text,
        createdAt: comment.createdAt
          .toISOString()
          .replace(/\.\d{3}Z$/, ".000Z"),
        moderation: comment.moderation,
        raw: comment,
      })),
      ...[...this.replies.values()].map((reply) => ({
        id: reply.id,
        kind: "reply" as const,
        catalogId: publishedCatalogId,
        rootCommentId: reply.rootCommentId,
        author: {
          id: reply.author.id,
          handle: fixtureUsers.active.handle,
          displayName: reply.author.displayName,
          status: "active" as const,
        },
        text: reply.text,
        createdAt: reply.createdAt.toISOString().replace(/\.\d{3}Z$/, ".000Z"),
        moderation: reply.moderation,
        raw: reply,
      })),
    ]
      .filter(
        (row) =>
          query.moderation === undefined || row.moderation === query.moderation,
      )
      .sort((left, right) => byNewest(left.raw, right.raw))
      .map((row) => {
        const { raw, ...operatorRow } = row;
        void raw;
        return operatorRow;
      });
    const start = (query.page - 1) * query.pageSize;
    return {
      items: rows.slice(start, start + query.pageSize),
      total: rows.length,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async readPublicationPolicy(): Promise<{
    readonly policy: PublicationPolicy;
    readonly updatedAt: Date;
    readonly updatedBy: string;
  }> {
    this.assertAvailable();
    return {
      policy: this.policy,
      updatedAt: this.policyUpdatedAt,
      updatedBy: this.policyUpdatedBy,
    };
  }

  async writePublicationPolicy(
    policy: PublicationPolicy,
    operatorLabel: string,
    at: Date,
  ): Promise<void> {
    this.assertAvailable();
    this.policy = policy;
    this.policyUpdatedBy = operatorLabel;
    this.policyUpdatedAt = at;
  }

  async recordModerationEvent(event: ModerationEvent): Promise<void> {
    this.assertAvailable();
    this.events.push(event);
  }
}
