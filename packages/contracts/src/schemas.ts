import { z } from "zod";

export const archiveItemIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^\S+$/)
  .brand<"ArchiveItemId">();

export const archiveItemLifecycleStatusSchema = z.enum([
  "draft",
  "published",
  "unpublished",
  "trashed",
]);

export const historicalPeriodSchema = z.strictObject({
  label: z.string().trim().min(1),
  sortKey: z.number().int().optional(),
});

export const coordinatesSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const publicLocationSchema = z.strictObject({
  displayName: z.string().trim().min(1),
  province: z.string().trim().min(1).optional(),
  locality: z.string().trim().min(1).optional(),
});

export const objectKeySchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^(?![a-z][a-z0-9+.-]*:)(?!\/)\S+$/i, {
    message: "Expected an object key, not a URL or absolute path",
  });

export const imageAssetSchema = z.strictObject({
  id: z.string().trim().min(1),
  objectKey: objectKeySchema,
  thumbnailObjectKey: objectKeySchema.optional(),
  alt: z.string().trim().min(1),
  caption: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().min(0),
});

export const referenceSchema = z.strictObject({
  id: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1),
  citation: z.string().trim().min(1).optional(),
  url: z.url().optional(),
});

const titleSchema = z.string().trim().min(1).max(500);
const aliasSchema = z.string().trim().min(1).max(500);
const categoryIdSchema = z.string().trim().min(1).max(128);
const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const archiveItemRecordSchema = z
  .strictObject({
    id: archiveItemIdSchema,
    title: titleSchema,
    aliases: z.array(aliasSchema),
    lifecycleStatus: archiveItemLifecycleStatusSchema,
    location: publicLocationSchema.optional(),
    historicalPeriod: historicalPeriodSchema.optional(),
    coordinates: coordinatesSchema.optional(),
    categoryIds: z.array(categoryIdSchema),
    imageIds: z.array(z.string().trim().min(1).max(128)),
    summary: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    trashedAt: isoDateTimeSchema.optional(),
  })
  .superRefine((record, context) => {
    const isTrashed = record.lifecycleStatus === "trashed";
    if (isTrashed && record.trashedAt === undefined) {
      context.addIssue({
        code: "custom",
        path: ["trashedAt"],
        message: "trashedAt is required when lifecycleStatus is trashed",
      });
    }
    if (!isTrashed && record.trashedAt !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["trashedAt"],
        message: "trashedAt is only allowed when lifecycleStatus is trashed",
      });
    }
  });

export const archiveItemSummarySchema = z.strictObject({
  id: archiveItemIdSchema,
  title: titleSchema,
  aliases: z.array(aliasSchema),
  location: publicLocationSchema.optional(),
  historicalPeriod: historicalPeriodSchema.optional(),
  categoryIds: z.array(categoryIdSchema),
  summary: z.string().trim().min(1).optional(),
  coverImageKey: objectKeySchema.optional(),
});

export const archiveItemDetailSchema = z.strictObject({
  ...archiveItemSummarySchema.shape,
  coordinates: coordinatesSchema.optional(),
  description: z.string().trim().min(1).optional(),
  images: z.array(imageAssetSchema),
  references: z.array(referenceSchema),
  relatedItemIds: z.array(archiveItemIdSchema),
});
