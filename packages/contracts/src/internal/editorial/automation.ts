import { z } from "zod";

import { editorialDraftSchema, isWellFormedEditorialText } from "./schemas.js";

const documentIdSchema = z.union([
  z.string().min(1).max(128).regex(/^\S+$/u).refine(isWellFormedEditorialText),
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
]);
const revisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const idempotencyKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const editorialReadDraftSchema = z.strictObject({
  id: documentIdSchema,
});

export const editorialSaveDraftSchema = z.strictObject({
  id: documentIdSchema.optional(),
  expectedRevision: revisionSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
  content: editorialDraftSchema,
});

export const editorialApproveBatchSchema = z.strictObject({
  automationUserId: documentIdSchema,
  label: z
    .string()
    .min(1)
    .max(200)
    .refine(isWellFormedEditorialText)
    .optional(),
  items: z
    .array(
      z.strictObject({
        id: documentIdSchema,
        revision: revisionSchema.min(1),
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (items) =>
        new Set(items.map(({ id }) => String(id))).size === items.length,
      { message: "Each document may appear only once per approval" },
    ),
});

export const editorialPublishApprovedSchema = z.strictObject({
  approvalId: documentIdSchema,
  id: documentIdSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const editorialRestoreDraftSchema = z.strictObject({
  versionId: documentIdSchema,
  expectedRevision: revisionSchema.min(1),
});

export const ownerDraftPageRequestSchema = z.strictObject({
  page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export const ownerHistoryRequestSchema = z.strictObject({
  id: documentIdSchema,
  page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(1),
});

export type OwnerDraftSummary = {
  id: number;
  catalogId: string;
  title: string | null;
  revision: number;
  missingFields: string[];
  changedFields: string[];
  status: "draft" | "published";
};
export type OwnerDraftPage = {
  docs: OwnerDraftSummary[];
  page: number;
  totalPages: number;
  totalDocs: number;
  automationUsers: { id: number; label: string }[];
};
export type OwnerHistoryPage = {
  id: number;
  currentRevision: number;
  docs: {
    id: number;
    revision: number;
    title: string | null;
    status: "draft" | "published";
    createdAt: string;
  }[];
  page: number;
  totalPages: number;
};
export type OwnerDraftPageRequest = z.output<
  typeof ownerDraftPageRequestSchema
>;
export type OwnerHistoryRequest = z.output<typeof ownerHistoryRequestSchema>;

export type EditorialMutationResult = {
  id: number;
  revision: number;
  fingerprint: string;
  replayed?: boolean;
};
export type EditorialApprovalResult = {
  approvalId: number;
  itemCount: number;
  status?: "active" | "revoked" | null;
};

export type EditorialReadDraftRequest = z.output<
  typeof editorialReadDraftSchema
>;
export type EditorialSaveDraftRequest = z.output<
  typeof editorialSaveDraftSchema
>;
export type EditorialApproveBatchRequest = z.output<
  typeof editorialApproveBatchSchema
>;
export type EditorialPublishApprovedRequest = z.output<
  typeof editorialPublishApprovedSchema
>;
export type EditorialRestoreDraftRequest = z.output<
  typeof editorialRestoreDraftSchema
>;
