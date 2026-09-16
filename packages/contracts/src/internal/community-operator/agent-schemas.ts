import { z } from "zod";

import { contentIdentitySchema } from "../../schemas.js";
import {
  commentModerationActionSchema,
  operatorLabelSchema,
} from "./schemas.js";

/**
 * Agent Administration V1 (Issue #141 r3, Phase B). Server-only shapes shared
 * by the Backend agent boundary, the Payload MCP adapter and the Owner-only
 * operations view. Nothing here is a Public DTO or reaches OpenAPI.
 *
 * A machine principal is an operator label with the `agent-` prefix: it is
 * recorded on every audit row and receipt exactly like the Owner's label, and
 * it is never a PublicUserId or a Payload row id. Scopes are enforced by the
 * Backend on every call; the Admin only asserts which principal is calling.
 */

/** Every operation is frozen at preparation; this is the ceiling per operation. */
export const AGENT_OPERATION_TARGET_MAXIMUM = 500;
/** Targets are executed and persisted in chunks of at most this many. */
export const AGENT_OPERATION_CHUNK_SIZE = 50;
/** A prepared operation that nobody approves is refused after this long. */
export const AGENT_OPERATION_PREPARED_LIFETIME_MS = 24 * 60 * 60 * 1_000;

export const agentPrincipalLabelSchema = operatorLabelSchema.refine(
  (label) => /^agent-[a-z0-9-]{2,57}$/u.test(label),
  { message: "an agent principal label starts with agent-" },
);

export const agentScopeSchema = z.enum([
  "users:read",
  "content:read",
  "comments:read",
  "comments:moderate",
  "featured:write",
  "operations:execute",
  "operations:undo",
]);

const isoDateTime = z.iso.datetime({ offset: false });
const version = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const agentPrincipalSchema = z.strictObject({
  label: agentPrincipalLabelSchema,
  displayName: z.string().min(1).max(80),
  scopes: z.array(agentScopeSchema).max(7),
  enabled: z.boolean(),
  version,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  revokedAt: isoDateTime.nullable(),
});

/** Owner-only: create or change a principal; a revoked principal stays revoked. */
export const agentPrincipalMutationSchema = z.strictObject({
  requestId: z.uuid(),
  label: agentPrincipalLabelSchema,
  displayName: z.string().min(1).max(80),
  scopes: z.array(agentScopeSchema).max(7),
  enabled: z.boolean(),
  /** 0 creates; otherwise the version last read. */
  expectedVersion: version,
});

export const agentPrincipalRevokeSchema = z.strictObject({
  requestId: z.uuid(),
  label: agentPrincipalLabelSchema,
  expectedVersion: version,
});

export const agentOperationKindSchema = z.enum([
  "comments.moderate",
  "featured.set",
]);

/**
 * A bounded, persisted, revocable delegation: while it is active a principal's
 * prepared operation of this kind with at most `maxTargets` targets is
 * approved without an Owner click. It never covers future comments: an
 * operation still names a fixed, frozen selection.
 */
export const agentDelegationSchema = z.strictObject({
  id: z.uuid(),
  principal: agentPrincipalLabelSchema,
  kind: agentOperationKindSchema,
  maxTargets: z.number().int().min(1).max(AGENT_OPERATION_TARGET_MAXIMUM),
  expiresAt: isoDateTime,
  createdBy: operatorLabelSchema,
  createdAt: isoDateTime,
  revokedAt: isoDateTime.nullable(),
  revokedBy: operatorLabelSchema.nullable(),
});

export const agentDelegationCreateSchema = z.strictObject({
  requestId: z.uuid(),
  principal: agentPrincipalLabelSchema,
  kind: agentOperationKindSchema,
  maxTargets: z.number().int().min(1).max(AGENT_OPERATION_TARGET_MAXIMUM),
  expiresAt: isoDateTime,
});

export const agentDelegationRevokeSchema = z.strictObject({
  requestId: z.uuid(),
  id: z.uuid(),
});

export const agentOperationStateSchema = z.enum([
  "prepared",
  "approved",
  "executing",
  "completed",
  "cancelled",
  "failed",
]);

export const agentTargetOutcomeSchema = z.enum([
  "applied",
  "conflict",
  "not_found",
  "failed",
  "cancelled",
]);

export const agentCommentIdSchema = z
  .string()
  .regex(/^comment-[0-9a-f]{32}$/u, "not a platform comment id");

const commentModerationStateSchema = z.enum(["pending", "visible", "hidden"]);

/** A frozen comment target with the state observed at preparation. */
export const agentCommentTargetSchema = z.strictObject({
  id: agentCommentIdSchema,
  prior: commentModerationStateSchema.nullable(),
});

const featuredPosition = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** A frozen recommendation target with the row observed at preparation (null: no row). */
export const agentFeaturedTargetSchema = z.strictObject({
  target: contentIdentitySchema,
  enabled: z.boolean(),
  position: featuredPosition,
  prior: z
    .strictObject({
      enabled: z.boolean(),
      position: featuredPosition,
      version,
    })
    .nullable(),
});

export const agentOperationTargetSchema = z.union([
  agentCommentTargetSchema,
  agentFeaturedTargetSchema,
]);

export const agentOperationResultSchema = z.strictObject({
  index: z.number().int().min(0),
  id: z.string().min(1).max(128),
  outcome: agentTargetOutcomeSchema,
  /** The version or state after an applied item; a bare code otherwise. */
  detail: z.string().max(200).nullable(),
});

export const agentOperationApprovalSchema = z.strictObject({
  kind: z.enum(["owner", "delegation"]),
  by: operatorLabelSchema,
  delegationId: z.uuid().nullable(),
  at: isoDateTime,
});

export const agentOperationTallySchema = z.strictObject({
  applied: z.number().int().min(0),
  conflicts: z.number().int().min(0),
  notFound: z.number().int().min(0),
  failed: z.number().int().min(0),
  cancelled: z.number().int().min(0),
});

export const agentOperationSchema = z.strictObject({
  id: z.uuid(),
  principal: agentPrincipalLabelSchema,
  requestId: z.uuid(),
  kind: agentOperationKindSchema,
  /** The comment transition for `comments.moderate`; null for `featured.set`. */
  action: commentModerationActionSchema.nullable(),
  state: agentOperationStateSchema,
  approval: agentOperationApprovalSchema.nullable(),
  undoOf: z.uuid().nullable(),
  targetCount: z.number().int().min(1).max(AGENT_OPERATION_TARGET_MAXIMUM),
  nextIndex: z.number().int().min(0),
  results: z.array(agentOperationResultSchema),
  tally: agentOperationTallySchema,
  version,
  createdAt: isoDateTime,
  expiresAt: isoDateTime,
  approvedAt: isoDateTime.nullable(),
  startedAt: isoDateTime.nullable(),
  finishedAt: isoDateTime.nullable(),
  cancelRequestedAt: isoDateTime.nullable(),
  /** Whether an executor currently holds the lease (a second executor waits). */
  leaseHeld: z.boolean(),
});

export const agentOperationDetailSchema = agentOperationSchema.extend({
  targets: z.array(agentOperationTargetSchema),
});

export const agentPrepareCommentsCommandSchema = z.strictObject({
  requestId: z.uuid(),
  action: commentModerationActionSchema,
  ids: z
    .array(agentCommentIdSchema)
    .min(1)
    .max(AGENT_OPERATION_TARGET_MAXIMUM)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "duplicate target",
    }),
});

export const agentPrepareFeaturedCommandSchema = z.strictObject({
  requestId: z.uuid(),
  items: z
    .array(
      z.strictObject({
        target: contentIdentitySchema,
        enabled: z.boolean(),
        position: featuredPosition,
      }),
    )
    .min(1)
    .max(AGENT_OPERATION_TARGET_MAXIMUM)
    .refine(
      (items) =>
        new Set(items.map((item) => `${item.target.type}:${item.target.id}`))
          .size === items.length,
      { message: "duplicate target" },
    ),
});

/** Execute, cancel, approve and prepare-undo all name one operation. */
export const agentOperationCommandSchema = z.strictObject({
  requestId: z.uuid(),
  operationId: z.uuid(),
});

export const agentOperationReadSchema = z.strictObject({
  operationId: z.uuid(),
});

export const agentOperationQuerySchema = z.strictObject({
  state: agentOperationStateSchema.optional(),
  principal: agentPrincipalLabelSchema.optional(),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const agentOperationPageSchema = z.strictObject({
  items: z.array(agentOperationSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});

export const agentPrincipalPageSchema = z.strictObject({
  items: z.array(agentPrincipalSchema),
});

export const agentDelegationPageSchema = z.strictObject({
  items: z.array(agentDelegationSchema),
});

export const agentDelegationQuerySchema = z.strictObject({
  principal: agentPrincipalLabelSchema.optional(),
  includeInactive: z.boolean().default(false),
});

export type AgentScope = z.infer<typeof agentScopeSchema>;
export type AgentPrincipal = z.infer<typeof agentPrincipalSchema>;
export type AgentPrincipalMutation = z.infer<
  typeof agentPrincipalMutationSchema
>;
export type AgentPrincipalRevoke = z.infer<typeof agentPrincipalRevokeSchema>;
export type AgentOperationKind = z.infer<typeof agentOperationKindSchema>;
export type AgentDelegation = z.infer<typeof agentDelegationSchema>;
export type AgentDelegationCreate = z.infer<typeof agentDelegationCreateSchema>;
export type AgentDelegationRevoke = z.infer<typeof agentDelegationRevokeSchema>;
export type AgentDelegationQuery = z.infer<typeof agentDelegationQuerySchema>;
export type AgentOperationState = z.infer<typeof agentOperationStateSchema>;
export type AgentTargetOutcome = z.infer<typeof agentTargetOutcomeSchema>;
export type AgentCommentTarget = z.infer<typeof agentCommentTargetSchema>;
export type AgentFeaturedTarget = z.infer<typeof agentFeaturedTargetSchema>;
export type AgentOperationTarget = z.infer<typeof agentOperationTargetSchema>;
export type AgentOperationResult = z.infer<typeof agentOperationResultSchema>;
export type AgentOperationApproval = z.infer<
  typeof agentOperationApprovalSchema
>;
export type AgentOperationTally = z.infer<typeof agentOperationTallySchema>;
export type AgentOperation = z.infer<typeof agentOperationSchema>;
export type AgentOperationDetail = z.infer<typeof agentOperationDetailSchema>;
export type AgentPrepareCommentsCommand = z.infer<
  typeof agentPrepareCommentsCommandSchema
>;
export type AgentPrepareFeaturedCommand = z.infer<
  typeof agentPrepareFeaturedCommandSchema
>;
export type AgentOperationCommand = z.infer<typeof agentOperationCommandSchema>;
export type AgentOperationRead = z.infer<typeof agentOperationReadSchema>;
export type AgentOperationQuery = z.infer<typeof agentOperationQuerySchema>;
export type AgentOperationPage = z.infer<typeof agentOperationPageSchema>;
export type AgentPrincipalPage = z.infer<typeof agentPrincipalPageSchema>;
export type AgentDelegationPage = z.infer<typeof agentDelegationPageSchema>;
