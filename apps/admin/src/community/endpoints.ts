import {
  moderateCommentCommandSchema,
  moderateUserCommandSchema,
  operatorCommentQuerySchema,
  setPublicationPolicyCommandSchema,
} from "@moya/contracts/internal/community-operator";

import { isOwner } from "../editorial/access";
import { callCommunityOperator, CommunityOperatorError } from "./backend";

import type {
  ModerationResult,
  OperatorCommentPage,
  PublicationPolicyState,
  UserModerationResult,
} from "@moya/contracts/internal/community-operator";
import type { Endpoint, PayloadRequest } from "payload";

/** Community moderation is Owner-only; `automation` never moderates. */
const requireOwner = (req: PayloadRequest): void => {
  if (!isOwner(req))
    throw new CommunityOperatorError("COMMUNITY_OWNER_ONLY", 403);
};

const readJson = async (req: PayloadRequest): Promise<unknown> => {
  if (!req.json) throw new CommunityOperatorError("JSON_BODY_REQUIRED", 400);
  try {
    return await req.json();
  } catch {
    throw new CommunityOperatorError("JSON_BODY_REQUIRED", 400);
  }
};

const parse = <Schema extends { parse: (input: unknown) => unknown }>(
  schema: Schema,
  input: unknown,
): ReturnType<Schema["parse"]> => {
  try {
    return schema.parse(input) as ReturnType<Schema["parse"]>;
  } catch {
    throw new CommunityOperatorError("COMMAND_INVALID", 400);
  }
};

const commentId = (input: unknown): string => {
  const id =
    typeof input === "object" && input !== null && "id" in input
      ? input.id
      : undefined;
  if (typeof id !== "string" || !/^comment-[0-9a-f]{32}$/.test(id))
    throw new CommunityOperatorError("COMMAND_INVALID", 400);
  return id;
};

const userId = (input: unknown): string => {
  const id =
    typeof input === "object" && input !== null && "id" in input
      ? input.id
      : undefined;
  if (typeof id !== "string" || !/^user-[0-9a-f]{32}$/.test(id))
    throw new CommunityOperatorError("COMMAND_INVALID", 400);
  return id;
};

const operations: Record<
  string,
  (req: PayloadRequest, input: unknown) => Promise<unknown>
> = {
  "read-policy": async (): Promise<PublicationPolicyState> =>
    callCommunityOperator("GET", "publication-policy"),
  "set-policy": async (_req, input): Promise<PublicationPolicyState> =>
    callCommunityOperator(
      "PUT",
      "publication-policy",
      parse(setPublicationPolicyCommandSchema, input),
    ),
  "read-comments": async (_req, input): Promise<OperatorCommentPage> => {
    const query = parse(operatorCommentQuerySchema, input ?? {});
    const search = new URLSearchParams();
    if (query.moderation !== undefined)
      search.set("moderation", query.moderation);
    if (query.page !== undefined) search.set("page", String(query.page));
    if (query.pageSize !== undefined)
      search.set("pageSize", String(query.pageSize));
    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    return callCommunityOperator("GET", `comments${suffix}`);
  },
  "moderate-comment": async (_req, input): Promise<ModerationResult> =>
    callCommunityOperator(
      "POST",
      `comments/${commentId(input)}/moderation`,
      parse(moderateCommentCommandSchema, input),
    ),
  "moderate-user": async (_req, input): Promise<UserModerationResult> =>
    callCommunityOperator(
      "POST",
      `users/${userId(input)}/status`,
      parse(moderateUserCommandSchema, input),
    ),
};

const endpoint = (name: string): Endpoint => ({
  path: `/community/${name}`,
  method: "post",
  handler: async (req) => {
    try {
      requireOwner(req);
      const input = await readJson(req);
      const result = await operations[name]?.(req, input);
      return Response.json(
        { ok: true, result },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (!(error instanceof CommunityOperatorError))
        req.payload.logger.error({ err: error });
      return Response.json(
        {
          ok: false as const,
          error: {
            code:
              error instanceof CommunityOperatorError
                ? error.code
                : "OPERATION_FAILED",
          },
        },
        {
          status: error instanceof CommunityOperatorError ? error.status : 500,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  },
});

export const communityEndpoints: Endpoint[] =
  Object.keys(operations).map(endpoint);
