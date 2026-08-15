import { z } from "zod";

const exactTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim(), {
      message: "Leading or trailing whitespace is not allowed",
    });

const platformIdentitySchema = () => z.string().min(1).max(128).regex(/^\S+$/);

export const catalogIdSchema = platformIdentitySchema().brand<"CatalogId">();
export const mediaIdSchema = platformIdentitySchema().brand<"MediaId">();

export const catalogKindSchema = z.enum(["inscription", "calligraphy"]);

const titleSchema = exactTextSchema(500);
const aliasSchema = exactTextSchema(500);
const summarySchema = exactTextSchema(2_000);
const displayLabelSchema = exactTextSchema(500);
const mediaAltSchema = exactTextSchema(2_000);
const httpOrHttpsUrlSchema = z
  .url({ protocol: /^https?$/ })
  .and(z.string().regex(/^[Hh][Tt][Tt][Pp][Ss]?:\/\//));

export const publicMediaSchema = z.strictObject({
  id: mediaIdSchema,
  kind: z.literal("image"),
  src: httpOrHttpsUrlSchema,
  alt: mediaAltSchema,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

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
  representativeMedia: publicMediaSchema.optional(),
});

export const catalogDetailSchema = z.strictObject({
  ...catalogSummarySchema.shape,
  description: exactTextSchema(20_000).optional(),
  sourceCitations: z.array(publicSourceCitationSchema),
  media: z.array(publicMediaSchema),
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
  kind: catalogKindSchema.optional(),
  page: safePositiveIntegerStringSchema.optional(),
  pageSize: catalogPageSizeStringSchema.optional(),
});

/** Strict transport boundary for endpoints that declare no query parameters. */
export const noQueryTransportSchema = z.strictObject({});

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
