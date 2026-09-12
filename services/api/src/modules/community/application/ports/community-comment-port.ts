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
  CommentPageRecord,
} from "../../domain/catalog-comment.js";

export interface CommentPageQuery {
  readonly catalogId: CatalogId;
  readonly page: number;
  readonly pageSize: number;
  /** Bounded first page of replies embedded in each returned comment. */
  readonly embeddedReplyLimit: number;
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
  /** Visible root comments for one Catalog record, in server order. */
  readVisibleComments(
    query: CommentPageQuery,
  ): Promise<CommentPageRecord<CatalogCommentWithReplies>>;

  /** Visible replies under one visible root, in server order. */
  readVisibleReplies(
    query: ReplyPageQuery,
  ): Promise<CommentPageRecord<CatalogCommentReplyRecord>>;

  /** The root comment regardless of moderation state, for write and moderation paths. */
  findComment(id: CatalogCommentId): Promise<CatalogCommentRecord | null>;

  findReply(id: CatalogCommentId): Promise<CatalogCommentReplyRecord | null>;

  insertComment(comment: CommentInsert): Promise<CatalogCommentRecord>;

  insertReply(reply: ReplyInsert): Promise<CatalogCommentReplyRecord>;

  /** Applies the moderation transition to a root comment or a reply; null when unknown. */
  applyCommentModeration(
    id: CatalogCommentId,
    moderation: CommentModerationState,
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
