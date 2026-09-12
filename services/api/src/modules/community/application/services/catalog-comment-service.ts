import {
  CommunityInputError,
  CommunityNotFoundError,
} from "../errors/community-request-errors.js";
import {
  mapCatalogComment,
  mapCatalogCommentPage,
  mapCatalogCommentReply,
  mapCatalogCommentReplyPage,
} from "../mappers/community-public-contract-mapper.js";
import { defaultRandomBytes, generateOpaqueId } from "../session-token.js";

import type {
  CatalogComment,
  CatalogCommentId,
  CatalogCommentPage,
  CatalogCommentReply,
  CatalogCommentReplyPage,
  CatalogId,
  CreateCatalogCommentReplyRequest,
  CreateCatalogCommentRequest,
  PublicUserId,
} from "@moya/contracts";
import type { CommunityCommentPort } from "../ports/community-comment-port.js";
import type { CatalogPublicationPort } from "../ports/catalog-publication-port.js";
import type { RandomBytes } from "../session-token.js";

/** Fixed by the Mission 2B Contract review; the transport layer parses them. */
const embeddedReplyLimit = 3;

export interface CatalogCommentServiceOptions {
  readonly clock?: () => Date;
  readonly randomBytes?: RandomBytes;
}

export interface CommentSubmission<Item> {
  readonly item: Item;
  /** `pending` under PRE_MODERATION; the transport turns it into 202 vs 201. */
  readonly awaitingApproval: boolean;
}

export interface CommentPageInput {
  readonly page: number;
  readonly pageSize: number;
}

/**
 * The three comment operations plus bounded reply pagination. Public reads
 * return `visible` items only; a reply never bypasses a root that is not
 * visible, and moderation state never leaves the Backend.
 */
export class CatalogCommentService {
  private readonly clock: () => Date;
  private readonly randomBytes: RandomBytes;

  constructor(
    private readonly commentPort: CommunityCommentPort,
    private readonly catalogPublicationPort: CatalogPublicationPort,
    options: CatalogCommentServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.randomBytes = options.randomBytes ?? defaultRandomBytes;
  }

  async readComments(
    catalogId: CatalogId,
    query: CommentPageInput,
  ): Promise<CatalogCommentPage> {
    await this.assertPublishedCatalog(catalogId);
    const comments = await this.commentPort.readVisibleComments({
      catalogId,
      page: query.page,
      pageSize: query.pageSize,
      embeddedReplyLimit,
    });
    return mapCatalogCommentPage({
      items: comments.items.map((comment) =>
        mapCatalogComment(comment, comment.replies),
      ),
      total: comments.total,
      page: comments.page,
      pageSize: comments.pageSize,
    });
  }

  async readReplies(
    catalogId: CatalogId,
    rootCommentId: CatalogCommentId,
    query: CommentPageInput,
  ): Promise<CatalogCommentReplyPage> {
    await this.assertVisibleRoot(catalogId, rootCommentId);
    return mapCatalogCommentReplyPage(
      await this.commentPort.readVisibleReplies({
        rootCommentId,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  }

  async createComment(
    catalogId: CatalogId,
    authorId: PublicUserId,
    request: CreateCatalogCommentRequest,
  ): Promise<CommentSubmission<CatalogComment>> {
    await this.assertPublishedCatalog(catalogId);
    const moderation = await this.entryModerationState();
    const created = await this.commentPort.insertComment({
      id: generateOpaqueId("comment", this.randomBytes) as CatalogCommentId,
      catalogId,
      authorId,
      text: request.text,
      moderation,
      createdAt: this.clock(),
    });
    return {
      item: mapCatalogComment(created, []),
      awaitingApproval: moderation === "pending",
    };
  }

  async createReply(
    catalogId: CatalogId,
    rootCommentId: CatalogCommentId,
    authorId: PublicUserId,
    request: CreateCatalogCommentReplyRequest,
  ): Promise<CommentSubmission<CatalogCommentReply>> {
    await this.assertVisibleRoot(catalogId, rootCommentId);
    if (request.replyTo !== undefined) {
      const target = await this.commentPort.findReply(request.replyTo);
      if (
        target === null ||
        target.rootCommentId !== rootCommentId ||
        target.moderation !== "visible"
      )
        throw new CommunityInputError(
          "replyTo must be a visible reply under the same root comment",
        );
    }
    const moderation = await this.entryModerationState();
    const created = await this.commentPort.insertReply({
      id: generateOpaqueId("comment", this.randomBytes) as CatalogCommentId,
      rootCommentId,
      authorId,
      text: request.text,
      moderation,
      createdAt: this.clock(),
      ...(request.replyTo === undefined
        ? {}
        : { replyToReplyId: request.replyTo }),
    });
    return {
      item: mapCatalogCommentReply(created),
      awaitingApproval: moderation === "pending",
    };
  }

  /** The setting is read per submission, so a switch needs no restart. */
  private async entryModerationState(): Promise<"pending" | "visible"> {
    const { policy } = await this.commentPort.readPublicationPolicy();
    return policy === "DIRECT_PUBLICATION" ? "visible" : "pending";
  }

  private async assertPublishedCatalog(catalogId: CatalogId): Promise<void> {
    if (!(await this.catalogPublicationPort.isPublished(catalogId)))
      throw new CommunityNotFoundError("Catalog record is not published");
  }

  private async assertVisibleRoot(
    catalogId: CatalogId,
    rootCommentId: CatalogCommentId,
  ): Promise<void> {
    await this.assertPublishedCatalog(catalogId);
    const root = await this.commentPort.findComment(rootCommentId);
    if (
      root === null ||
      root.catalogId !== catalogId ||
      root.moderation !== "visible"
    )
      throw new CommunityNotFoundError("Root comment is not visible");
  }
}
