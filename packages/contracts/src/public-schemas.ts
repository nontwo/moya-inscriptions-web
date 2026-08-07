import { z } from "zod";

import {
  coordinatesSchema,
  dataStatusSchema,
  historicalPeriodSchema,
  imageAssetSchema,
  referenceSchema,
} from "./catalog-schemas.js";
import { siteIdSchema } from "./identity-schemas.js";

/** Provisional v1 safety projection, not a long-term administrative model. */
export const publicRegionSchema = z.strictObject({
  province: z.string().min(1),
});

export const siteSummarySchema = z.strictObject({
  id: siteIdSchema,
  title: z.string().min(1),
  aliases: z.array(z.string()),
  region: publicRegionSchema,
  historicalPeriod: historicalPeriodSchema,
  dataStatus: dataStatusSchema,
  categoryIds: z.array(z.string()),
  imageIds: z.array(z.string()),
  siteCode: z.string().optional(),
  slug: z.string().optional(),
  summary: z.string().optional(),
  coverImageKey: z.string().optional(),
  coverThumbnailKey: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const siteDetailSchema = z.strictObject({
  ...siteSummarySchema.shape,
  fullTitle: z.string().optional(),
  coordinates: coordinatesSchema.optional(),
  address: z.string().optional(),
  dimensions: z.string().optional(),
  wordCount: z.number().int().min(0).optional(),
  calligrapher: z.string().optional(),
  engraver: z.string().optional(),
  inscriber: z.string().optional(),
  preservationStatus: z.string().optional(),
  description: z.string().optional(),
  researchNotes: z.string().optional(),
  images: z.array(imageAssetSchema),
  references: z.array(referenceSchema),
  relatedSites: z.array(siteSummarySchema),
});

/** Empty category facet arrays remain valid until taxonomy is approved. */
export const categoryFacetSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  count: z.number().int().min(0),
});
