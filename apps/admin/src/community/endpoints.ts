import {
  adminBulkModerateCommentsRequestSchema,
  adminModerateCommentRequestSchema,
  adminModerateUserRequestSchema,
  adminReadCommentRequestSchema,
  moderationEventQuerySchema,
  moderationSummaryQuerySchema,
  operatorCommentQuerySchema,
  setPublicationPolicyCommandSchema,
} from "@moya/contracts/internal/community-operator";

import { isOwner } from "../editorial/access";
import { callCommunityOperator, CommunityOperatorError } from "./backend";

export { CommunityOperatorError } from "./backend";

import type {
  BulkModerationResult,
  ModerationEventPage,
  ModerationResult,
  ModerationSummary,
  OperatorCommentDetail,
  OperatorCommentPage,
  PublicationPolicyState,
  UserModerationResult,
} from "@moya/contracts/internal/community-operator";
import type { Endpoint, PayloadRequest } from "payload";

/**
 * The Owner's Admin is a client of the Backend operator boundary and nothing
 * more. Every request envelope is validated strictly and completely here; the
 * subject id is mapped into the Backend route and only the validated command
 * body is forwarded. An unknown, extra or malformed field is refused before
 * any call is made. The acting identity is the server-side operator label the
 * Backend holds; no request field can name an actor.
 */
export type OperatorCall = <Result>(
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
) => Promise<Result>;

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

/** Validated query fields only, in a fixed order, each URL-encoded once. */
const toQuery = (
  values: Readonly<Record<string, string | number | undefined>>,
): string => {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(values))
    if (value !== undefined) search.set(name, String(value));
  return search.size === 0 ? "" : `?${search.toString()}`;
};

const segment = (id: string): string => encodeURIComponent(id);

export type CommunityOperation = (
  req: PayloadRequest,
  input: unknown,
) => Promise<unknown>;

export const communityOperations = (
  call: OperatorCall,
): Readonly<Record<string, CommunityOperation>> => ({
  "read-policy": async (): Promise<PublicationPolicyState> =>
    call("GET", "publication-policy"),
  "set-policy": async (_req, input): Promise<PublicationPolicyState> =>
    call(
      "PUT",
      "publication-policy",
      parse(setPublicationPolicyCommandSchema, input),
    ),
  "read-comments": async (_req, input): Promise<OperatorCommentPage> => {
    const query = parse(operatorCommentQuerySchema, input ?? {});
    return call(
      "GET",
      `comments${toQuery({
        moderation: query.moderation,
        kind: query.kind,
        catalogId: query.catalogId,
        search: query.search,
        order: query.order,
        page: query.page,
        pageSize: query.pageSize,
      })}`,
    );
  },
  "read-comment": async (_req, input): Promise<OperatorCommentDetail> => {
    const { id } = parse(adminReadCommentRequestSchema, input);
    return call("GET", `comments/${segment(id)}`);
  },
  "moderate-comment": async (_req, input): Promise<ModerationResult> => {
    const { id, action } = parse(adminModerateCommentRequestSchema, input);
    return call("POST", `comments/${segment(id)}/moderation`, { action });
  },
  "moderate-comments": async (_req, input): Promise<BulkModerationResult> => {
    const { ids, action } = parse(
      adminBulkModerateCommentsRequestSchema,
      input,
    );
    return call("POST", "comments/moderation", { action, ids });
  },
  "moderate-user": async (_req, input): Promise<UserModerationResult> => {
    const { id, action } = parse(adminModerateUserRequestSchema, input);
    return call("POST", `users/${segment(id)}/status`, { action });
  },
  "read-events": async (_req, input): Promise<ModerationEventPage> => {
    const query = parse(moderationEventQuerySchema, input ?? {});
    return call(
      "GET",
      `moderation-events${toQuery({
        subjectId: query.subjectId,
        action: query.action,
        page: query.page,
        pageSize: query.pageSize,
      })}`,
    );
  },
  "read-summary": async (_req, input): Promise<ModerationSummary> => {
    const query = parse(moderationSummaryQuerySchema, input ?? {});
    return call("GET", `summary${toQuery({ range: query.range })}`);
  },
});

const endpoint = (name: string, operation: CommunityOperation): Endpoint => ({
  path: `/community-moderation/${name}`,
  method: "post",
  handler: async (req) => {
    try {
      requireOwner(req);
      const input = await readJson(req);
      const result = await operation(req, input);
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

/** The real endpoint set, with the transport injectable for boundary tests. */
export const createCommunityEndpoints = (
  call: OperatorCall = callCommunityOperator,
): Endpoint[] =>
  Object.entries(communityOperations(call)).map(([name, operation]) =>
    endpoint(name, operation),
  );

export const communityEndpoints: Endpoint[] = createCommunityEndpoints();
