import {
  operatorContentQuerySchema,
  moderateWorkCommandSchema,
  featuredMutationSchema,
  featuredSettingsMutationSchema,
  operatorDeleteBodySchema,
  operatorRemoveThreadSchema,
} from "@moya/contracts/internal/community-operator";
import {
  CommunityInputError,
  CommunityNotFoundError,
} from "../errors/community-request-errors.js";
import type { CommunityContentOperatorPort } from "../ports/community-content-operator-port.js";
import type { DiscussionPort } from "../ports/discussion-port.js";
const parse = <T>(
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  input: unknown,
): T => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new CommunityInputError("Invalid operator command");
  return result.data;
};
/** The internal command contract is enforced here, outside the Public API transport. */
export class CommunityContentOperatorService {
  constructor(
    private readonly content: CommunityContentOperatorPort | undefined,
    private readonly discussion: DiscussionPort | undefined,
    private readonly operator = "owner",
  ) {}
  private contentPort() {
    if (!this.content) throw new CommunityNotFoundError();
    return this.content;
  }
  readWorks(input: unknown) {
    return this.contentPort().readWorks(
      parse(operatorContentQuerySchema, input),
    );
  }
  readFeatured(input: unknown) {
    return this.contentPort().readFeatured(
      parse(operatorContentQuerySchema, input),
    );
  }
  moderateWork(id: string, input: unknown) {
    return this.contentPort().moderateWork(
      id,
      this.operator,
      parse(moderateWorkCommandSchema, input),
    );
  }
  setFeatured(input: unknown) {
    return this.contentPort().setFeatured(
      this.operator,
      parse(featuredMutationSchema, input),
    );
  }
  setFeaturedQuantity(input: unknown) {
    return this.contentPort().setFeaturedQuantity(
      this.operator,
      parse(featuredSettingsMutationSchema, input),
    );
  }
  async deleteBody(id: string, input: unknown) {
    if (!this.discussion) throw new CommunityNotFoundError();
    await this.discussion.operatorDeleteBody(
      this.operator,
      id,
      parse(operatorDeleteBodySchema, input).requestId,
    );
    return { deleted: true };
  }
  removeThread(id: string, input: unknown) {
    if (!this.discussion) throw new CommunityNotFoundError();
    const command = parse(operatorRemoveThreadSchema, input);
    return this.discussion.removeDiscussionThread(
      this.operator,
      id,
      command.requestId,
      command.expectedAffectedCount,
    );
  }
}
