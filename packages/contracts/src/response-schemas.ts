import { z } from "zod";

export const invalidQueryIssueSchema = z.strictObject({
  field: z.string().min(1),
  message: z.string().min(1),
});

export const invalidQueryDetailsSchema = z.strictObject({
  issues: z.array(invalidQueryIssueSchema),
});

export const apiErrorCodeSchema = z.enum([
  "INVALID_QUERY",
  "SITE_NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z
  .strictObject({
    success: z.literal(false),
    error: z.strictObject({
      code: apiErrorCodeSchema,
      message: z.string().min(1),
      requestId: z.string().min(1),
      details: invalidQueryDetailsSchema.optional(),
    }),
  })
  .superRefine((value, context) => {
    if (
      value.error.code !== "INVALID_QUERY" &&
      value.error.details !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "details are only allowed for INVALID_QUERY",
        path: ["error", "details"],
      });
    }
  });

export const apiSuccessMetaSchema = z.strictObject({
  timestamp: z.string(),
  version: z.string(),
});

export const createApiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.strictObject({
    success: z.literal(true),
    data: dataSchema,
    meta: apiSuccessMetaSchema.optional(),
  });

export const createPaginatedResponseSchema = <T extends z.ZodType>(
  itemSchema: T,
) =>
  z
    .strictObject({
      total: z.number().int().min(0),
      page: z.number().int().min(1),
      pageSize: z.number().int().min(1).max(100),
      totalPages: z.number().int().min(0),
      items: z.array(itemSchema),
    })
    .superRefine((value, context) => {
      const expectedTotalPages =
        value.total === 0 ? 0 : Math.ceil(value.total / value.pageSize);
      if (value.totalPages !== expectedTotalPages) {
        context.addIssue({
          code: "custom",
          message: "totalPages must match total and pageSize",
          path: ["totalPages"],
        });
      }
      if (value.items.length > value.pageSize) {
        context.addIssue({
          code: "custom",
          message: "items cannot exceed pageSize",
          path: ["items"],
        });
      }
    });

export const paginatedResponseSchema = createPaginatedResponseSchema(
  z.unknown(),
);
