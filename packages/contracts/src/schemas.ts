import { z } from "zod";

const exactTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim(), {
      message: "Leading or trailing whitespace is not allowed",
    });

const platformContentIdSchema = () =>
  z.string().min(1).max(128).regex(/^\S+$/).brand<"CatalogId">();

export const catalogIdSchema = platformContentIdSchema();

/**
 * @deprecated T04.0-R compatibility name. Use catalogIdSchema for new work.
 * Removal belongs to the approved Phase 4 compatibility cleanup.
 */
export const archiveItemIdSchema = platformContentIdSchema();

export const catalogKindSchema = z.enum([
  "inscription",
  "cliff_inscription",
  "calligraphy",
]);

const titleSchema = exactTextSchema(500);
const aliasSchema = exactTextSchema(500);
const summarySchema = exactTextSchema(2_000);
const displayLabelSchema = exactTextSchema(500);

export const publicSourceCitationSchema = z.strictObject({
  label: displayLabelSchema,
  citation: exactTextSchema(2_000).optional(),
  url: z.url().optional(),
});

export const catalogSummarySchema = z.strictObject({
  id: catalogIdSchema,
  kind: catalogKindSchema,
  title: titleSchema,
  aliases: z.array(aliasSchema),
  summary: summarySchema.optional(),
  periodLabel: exactTextSchema(200).optional(),
});

export const catalogDetailSchema = z.strictObject({
  ...catalogSummarySchema.shape,
  description: exactTextSchema(20_000).optional(),
  sourceCitations: z.array(publicSourceCitationSchema),
});

/**
 * @deprecated T04.0-R /v1/items compatibility schema. New work uses Catalog.
 */
export const archiveItemSummarySchema = z.strictObject({
  id: archiveItemIdSchema,
  title: titleSchema,
  aliases: z.array(aliasSchema),
  summary: summarySchema.optional(),
  periodLabel: exactTextSchema(200).optional(),
  provinceLabel: exactTextSchema(200).optional(),
  protectionOrCollectionUnitLabel: displayLabelSchema.optional(),
});

/**
 * @deprecated T04.0-R /v1/items compatibility schema. New work uses Catalog.
 */
export const archiveItemDetailSchema = z.strictObject({
  ...archiveItemSummarySchema.shape,
  description: exactTextSchema(20_000).optional(),
  sources: z.array(publicSourceCitationSchema),
});

const positiveIntegerStringSchema = z
  .string()
  .max(16)
  .regex(/^[1-9]\d*$/);

const safePositiveIntegerStringSchema = positiveIntegerStringSchema.refine(
  (value) => Number.isSafeInteger(Number(value)),
  { message: "Value must be a safe positive integer" },
);

const catalogPageSizeStringSchema = safePositiveIntegerStringSchema.refine(
  (value) => Number(value) <= 100,
  { message: "pageSize must be less than or equal to 100" },
);

export const catalogListTransportQuerySchema = z.strictObject({
  page: safePositiveIntegerStringSchema.optional(),
  pageSize: catalogPageSizeStringSchema.optional(),
});

/** @deprecated T04.0-R /v1/items compatibility transport schema. */
export const archiveItemListTransportQuerySchema = z.strictObject({
  page: positiveIntegerStringSchema.optional(),
  pageSize: positiveIntegerStringSchema.optional(),
});

/** @deprecated T04.0-R Reader compatibility application schema. */
export const archiveItemListQuerySchema = z.strictObject({
  page: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

const normalizeArchiveItemListQuery = ({
  page,
  pageSize,
}: z.infer<typeof archiveItemListTransportQuerySchema>) => ({
  page: page === undefined ? 1 : Number(page),
  pageSize: pageSize === undefined ? 20 : Number(pageSize),
});

/** @deprecated T04.0-R Reader compatibility parser. */
export const archiveItemListQueryParserSchema =
  archiveItemListTransportQuerySchema
    .superRefine((query, context) => {
      const result = archiveItemListQuerySchema.safeParse(
        normalizeArchiveItemListQuery(query),
      );
      if (!result.success) {
        for (const issue of result.error.issues) {
          context.addIssue({
            code: "custom",
            path: issue.path,
            message: issue.message,
          });
        }
      }
    })
    .transform(normalizeArchiveItemListQuery);

/** @deprecated T04.0-R /v1/items compatibility page schema. */
export const archiveItemPageSchema = z
  .strictObject({
    items: z.array(archiveItemSummarySchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(0),
  })
  .superRefine((result, context) => {
    const expectedTotalPages =
      result.total === 0 ? 0 : Math.ceil(result.total / result.pageSize);

    if (result.totalPages !== expectedTotalPages) {
      context.addIssue({
        code: "custom",
        path: ["totalPages"],
        message:
          "totalPages must equal ceil(total / pageSize), or 0 when empty",
      });
    }
    if (result.items.length > result.pageSize) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "items cannot exceed pageSize",
      });
    }
    if (result.items.length > result.total) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "items cannot exceed total",
      });
    }
    if (result.page > expectedTotalPages && result.items.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "an out-of-range page must have no items",
      });
    }
  });

export const catalogPageSchema = z
  .strictObject({
    items: z.array(catalogSummarySchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(0),
  })
  .superRefine((result, context) => {
    const expectedTotalPages =
      result.total === 0 ? 0 : Math.ceil(result.total / result.pageSize);

    if (result.totalPages !== expectedTotalPages) {
      context.addIssue({
        code: "custom",
        path: ["totalPages"],
        message:
          "totalPages must equal ceil(total / pageSize), or 0 when empty",
      });
    }
    if (result.items.length > result.pageSize) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "items cannot exceed pageSize",
      });
    }
    if (result.items.length > result.total) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "items cannot exceed total",
      });
    }
    if (result.page > expectedTotalPages && result.items.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "an out-of-range page must have no items",
      });
    }
  });

export const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
});

export const apiErrorCodeSchema = z.enum([
  "INVALID_QUERY",
  "ITEM_NOT_FOUND",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
]);

export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: apiErrorCodeSchema,
    message: exactTextSchema(500),
    requestId: exactTextSchema(200),
  }),
});
