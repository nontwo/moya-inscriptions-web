import type {
  CatalogCommentId,
  CatalogId,
  PublicUserId,
} from "@moya/contracts";
import type {
  CommentModerationAction,
  CommentModerationState,
  OperatorComment,
  PublicationPolicy,
} from "@moya/contracts/internal/community-operator";

import type {
  CatalogCommentRecord,
  CatalogCommentReplyRecord,
  CatalogCommentWithReplies,
  CommentListingRecord,
  CommentPageRecord,
} from "../../domain/catalog-comment.js";

export interface CommentPageQuery {
  readonly catalogId: CatalogId;
  readonly page: number;
  readonly pageSize: number;
  /** Bounded first page of replies embedded in each returned comment. */
  readonly embeddedReplyLimit: number;
  /**
   * Upper bound of the hot section selected by the store: visible roots with
   * at least one visible reply, most replies first, then newest, then id.
   * 0 when the caller pinned a set instead of asking for a fresh selection.
   */
  readonly hotLimit: number;
  /** Roots the latest list excludes in addition to the hot ones selected here. */
  readonly pinned: readonly CatalogCommentId[];
}

export interface ReplyPageQuery {
  readonly rootCommentId: CatalogCommentId;
  readonly page: number;
  readonly pageSize: number;
}

export interface CommentInsert {
  readonly id: CatalogCommentId;
  readonly catalogId: CatalogId;
  readonly authorId: PublicUserId;
  readonly text: string;
  readonly moderation: CommentModerationState;
  readonly createdAt: Date;
}

export interface ReplyInsert {
  readonly id: CatalogCommentId;
  readonly rootCommentId: CatalogCommentId;
  readonly authorId: PublicUserId;
  readonly text: string;
  readonly moderation: CommentModerationState;
  readonly createdAt: Date;
  /** A sibling reply under the same root; the adapter rejects any other target. */
  readonly replyToReplyId?: CatalogCommentId;
}

export type ModerationEventAction =
  CommentModerationAction | "suspend" | "reinstate" | "set_publication_policy";

export interface ModerationEvent {
  readonly id: string;
  readonly occurredAt: Date;
  readonly operatorLabel: string;
  readonly action: ModerationEventAction;
  readonly subjectKind: "comment" | "reply" | "user" | "setting";
  readonly subjectId: string;
  readonly detail?: string;
}

/** What the moderation write actually changed; null when the id is unknown. */
export interface ModeratedSubject {
  readonly id: CatalogCommentId;
  readonly kind: "comment" | "reply";
  readonly moderation: CommentModerationState;
}

export interface OperatorCommentQueryInput {
  readonly moderation?: CommentModerationState;
  readonly page: number;
  readonly pageSize: number;
}

/**
 * Application-owned comment, moderation and setting port for the community
 * namespace. The Backend is the sole writer; nothing here deletes a row.
 */
export interface CommunityCommentPort {
  /**
   * The combined listing for one Catalog record: the hot section, then the
   * latest page excluding hot and pinned roots. Read in one snapshot, so the
   * two lists and the total agree with each other.
   */
  readVisibleComments(
    query: CommentPageQuery,
  ): Promise<CommentListingRecord<CatalogCommentWithReplies>>;

  /** Visible replies under one visible root, in server order. */
  readVisibleReplies(
    query: ReplyPageQuery,
  ): Promise<CommentPageRecord<CatalogCommentReplyRecord>>;

  /** The root comment regardless of moderation state, for write and moderation paths. */
  findComment(id: CatalogCommentId): Promise<CatalogCommentRecord | null>;

  findReply(id: CatalogCommentId): Promise<CatalogCommentReplyRecord | null>;

  insertComment(comment: CommentInsert): Promise<CatalogCommentRecord>;

  insertReply(reply: ReplyInsert): Promise<CatalogCommentReplyRecord>;

  /**
   * Applies the moderation transition to a root comment or a reply. `from`
   * lists the states the edge may leave, so an out-of-machine transition
   * matches no row and returns null (the caller turns that into 404).
   */
  applyCommentModeration(
    id: CatalogCommentId,
    moderation: CommentModerationState,
    from: readonly CommentModerationState[],
    operatorLabel: string,
    at: Date,
  ): Promise<ModeratedSubject | null>;

  /** Bounded operator listing; V1 keeps no large review queue. */
  readOperatorComments(
    query: OperatorCommentQueryInput,
  ): Promise<CommentPageRecord<OperatorComment>>;

  readPublicationPolicy(): Promise<{
    readonly policy: PublicationPolicy;
    readonly updatedAt: Date;
    readonly updatedBy: string;
  }>;

  writePublicationPolicy(
    policy: PublicationPolicy,
    operatorLabel: string,
    at: Date,
  ): Promise<void>;

  recordModerationEvent(event: ModerationEvent): Promise<void>;
}
