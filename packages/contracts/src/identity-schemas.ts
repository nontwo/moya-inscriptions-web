import { z } from "zod";

const opaqueIdSchema = z.string().min(1);

/** Provenance/source record identity. Its wire format is intentionally opaque. */
export const sourceIdSchema = opaqueIdSchema.brand<"SourceId">();

/** Platform entity identity. Its concrete generation/storage format is not frozen. */
export const siteIdSchema = opaqueIdSchema.brand<"SiteId">();

/** T01-only source identity; this pattern is not imposed on future sources. */
export const firstBatchSourceIdSchema = z
  .string()
  .regex(/^first-batch-[0-9]{4}$/)
  .brand<"SourceId">()
  .brand<"FirstBatchSourceId">();
