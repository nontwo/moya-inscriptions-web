import { createHash } from "node:crypto";

import {
  editorialContentFromDocument,
  EDITORIAL_STATEFUL_FIELDS,
  editorialDraftSchema,
  editorialPublishSchema,
} from "@moya/contracts/internal/editorial";

import type { Catalog } from "../payload-types";

import { validationError } from "./errors";

export const draftContent = (document: object) => {
  const result = editorialDraftSchema.safeParse(
    editorialContentFromDocument(document as Record<string, unknown>),
  );
  if (!result.success) throw validationError(result.error.issues);
  return result.data;
};

export const publishedContent = (document: object) => {
  const result = editorialPublishSchema.safeParse(
    editorialContentFromDocument(document as Record<string, unknown>),
  );
  if (!result.success) throw validationError(result.error.issues);
  return result.data;
};

/** Schema parsing orders object keys; embedded array order is kept exactly. */
export const contentFingerprint = (document: object): string =>
  createHash("sha256")
    .update(JSON.stringify(draftContent(document)))
    .digest("hex");

export const requestFingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Materialize a complete validated snapshot, including SQL clearing intent.
 * Patch omissions are merged with the current draft before this adapter runs.
 * Optional scalars and non-VALUE payloads must be null: PostgreSQL updates skip
 * undefined columns, which would otherwise retain the old published text.
 */
export const payloadContentData = (document: object): Partial<Catalog> => {
  const content = draftContent(document);
  const snapshot: Record<string, unknown> = JSON.parse(JSON.stringify(content));
  for (const key of ["title", "summary", "periodLabel", "ownerNote"] as const) {
    snapshot[key] = content[key] ?? null;
  }
  for (const key of EDITORIAL_STATEFUL_FIELDS) {
    const value = content[key];
    if (value)
      snapshot[key] = {
        ...value,
        value: value.state === "VALUE" ? value.value : null,
      };
  }
  return snapshot as Partial<Catalog>;
};
