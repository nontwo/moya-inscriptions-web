import {
  moderateCommentCommandSchema,
  moderateUserCommandSchema,
  operatorCommentPageSchema,
  operatorCommentQuerySchema,
  operatorLabelSchema,
  publicationPolicyStateSchema,
  setPublicationPolicyCommandSchema,
} from "@moya/contracts/internal/community-operator";

import {
  CommunityInputError,
  CommunityNotFoundError,
} from "../errors/community-request-errors.js";
import { defaultRandomBytes, generateOpaqueId } from "../session-token.js";

import type { CatalogCommentId, PublicUserId } from "@moya/contracts";
import type {
  CommentModerationState,
  ModerationResult,
  OperatorCommentPage,
  PublicationPolicyState,
  UserModerationResult,
} from "@moya/contracts/internal/community-operator";
import type {
  CommunityCommentPort,
  ModerationEventAction,
} from "../ports/community-comment-port.js";
import type { CommunityIdentityPort } from "../ports/community-identity-port.js";
import type { RandomBytes } from "../session-token.js";

export interface CommunityModerationServiceOptions {
  readonly clock?: () => Date;
  readonly randomBytes?: RandomBytes;
  /** Recorded on every action; never a PublicUserId or a Payload row id. */
  readonly operatorLabel?: string;
}

const defaultOperatorLabel = "owner";
const defaultOperatorPageSize = 20;

/**
 * Amendment section 5, edge by edge: pending -> visible (approval),
 * visible -> hidden (hide), hidden -> visible (unhide). Nothing else.
 */
const moderationTransitions: Record<
  "approve" | "hide" | "unhide",
  {
    readonly to: CommentModerationState;
    readonly from: CommentModerationState[];
  }
> = {
  approve: { to: "visible", from: ["pending"] },
  hide: { to: "hidden", from: ["visible"] },
  unhide: { to: "visible", from: ["hidden"] },
};

/**
 * The Owner's moderation surface behind the authenticated operator boundary.
 * The Backend stays the sole writer of community data; Payload Admin is only a
 * client of these operations.
 */
export class CommunityModerationService {
  private readonly clock: () => Date;
  private readonly randomBytes: RandomBytes;
  private readonly operatorLabel: string;

  constructor(
    private readonly commentPort: CommunityCommentPort,
    private readonly identityPort: CommunityIdentityPort,
    options: CommunityModerationServiceOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date());
    this.randomBytes = options.randomBytes ?? defaultRandomBytes;
    this.operatorLabel = operatorLabelSchema.parse(
      options.operatorLabel ?? defaultOperatorLabel,
    );
  }

  async readPublicationPolicy(): Promise<PublicationPolicyState> {
    const state = await this.commentPort.readPublicationPolicy();
    return publicationPolicyStateSchema.parse({
      policy: state.policy,
      updatedAt: state.updatedAt.toISOString().replace(/\.\d{3}Z$/, ".000Z"),
      updatedBy: state.updatedBy,
    });
  }

  /**
   * Switching affects new submissions only: no existing row is rewritten, and
   * no bulk publication or takedown is part of the setting.
   */
  async setPublicationPolicy(body: unknown): Promise<PublicationPolicyState> {
    const command = this.parse(setPublicationPolicyCommandSchema, body);
    const at = this.clock();
    await this.commentPort.writePublicationPolicy(
      command.policy,
      this.operatorLabel,
      at,
    );
    await this.record("set_publication_policy", "setting", "publication", at, {
      detail: command.policy,
    });
    return this.readPublicationPolicy();
  }

  async readComments(query: unknown): Promise<OperatorCommentPage> {
    const parsed = this.parse(operatorCommentQuerySchema, query);
    const pageSize = parsed.pageSize ?? defaultOperatorPageSize;
    const page = parsed.page ?? 1;
    const result = await this.commentPort.readOperatorComments({
      ...(parsed.moderation === undefined
        ? {}
        : { moderation: parsed.moderation }),
      page,
      pageSize,
    });
    return operatorCommentPageSchema.parse({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages:
        result.total === 0 ? 0 : Math.ceil(result.total / result.pageSize),
    });
  }

  async moderateComment(
    id: CatalogCommentId,
    body: unknown,
  ): Promise<ModerationResult> {
    const { action } = this.parse(moderateCommentCommandSchema, body);
    const at = this.clock();
    const transition = moderationTransitions[action];
    const moderated = await this.commentPort.applyCommentModeration(
      id,
      transition.to,
      transition.from,
      this.operatorLabel,
      at,
    );
    if (moderated === null)
      throw new CommunityNotFoundError(
        "Comment was not found in a state this action can leave",
      );
    await this.record(action, moderated.kind, moderated.id, at);
    return { id: moderated.id, moderation: moderated.moderation };
  }

  /** Suspension revokes sessions and refuses new writes; comments keep their state. */
  async moderateUser(
    id: PublicUserId,
    body: unknown,
  ): Promise<UserModerationResult> {
    const { action } = this.parse(moderateUserCommandSchema, body);
    const at = this.clock();
    const result = await this.identityPort.setUserStatus(
      id,
      action === "suspend" ? "suspended" : "active",
      at,
    );
    if (result === null) throw new CommunityNotFoundError("User was not found");
    await this.record(action, "user", result.user.id, at);
    return {
      id: result.user.id,
      status: result.user.status,
      revokedSessions: result.revokedSessions,
    };
  }

  private parse<Schema extends { parse: (input: unknown) => unknown }>(
    schema: Schema,
    input: unknown,
  ): ReturnType<Schema["parse"]> {
    try {
      return schema.parse(input) as ReturnType<Schema["parse"]>;
    } catch {
      throw new CommunityInputError("Operator command is invalid");
    }
  }

  private async record(
    action: ModerationEventAction,
    subjectKind: "comment" | "reply" | "user" | "setting",
    subjectId: string,
    occurredAt: Date,
    options: { readonly detail?: string } = {},
  ): Promise<void> {
    await this.commentPort.recordModerationEvent({
      id: generateOpaqueId("moderation", this.randomBytes),
      occurredAt,
      operatorLabel: this.operatorLabel,
      action,
      subjectKind,
      subjectId,
      ...(options.detail === undefined ? {} : { detail: options.detail }),
    });
  }
}
