import type { EditorialMedia } from "@moya/contracts/internal/editorial";

/** Client convenience only; validateCatalogMedia remains the server authority. */
export function selectedMediaSnapshot(
  document: Record<string, unknown>,
  catalogId: string,
  existing: readonly Partial<EditorialMedia>[],
): EditorialMedia | null {
  if (document.catalogId !== catalogId) throw new Error("MEDIA_SCOPE_MISMATCH");
  if (existing.some((item) => item.mediaId === document.mediaId)) return null;
  const maximum = existing.reduce(
    (result, item) =>
      Number.isSafeInteger(item.position)
        ? Math.max(result, Number(item.position))
        : result,
    -1,
  );
  if (maximum >= 2_147_483_647) throw new Error("MEDIA_POSITION_LIMIT");
  // Only narrow an authenticated native response for form convenience. Full
  // shared-schema and registered-media validation runs on every server save.
  if (
    typeof document.mediaId !== "string" ||
    !document.mediaId.length ||
    document.mediaId.length > 128 ||
    document.mediaId !== document.mediaId.trim() ||
    typeof document.objectKey !== "string" ||
    !document.objectKey.length ||
    typeof document.alt !== "string" ||
    !document.alt.length ||
    typeof document.width !== "number" ||
    !Number.isSafeInteger(document.width) ||
    document.width <= 0 ||
    typeof document.height !== "number" ||
    !Number.isSafeInteger(document.height) ||
    document.height <= 0 ||
    (document.rights != null && typeof document.rights !== "string") ||
    (document.orderConfidence != null &&
      document.orderConfidence !== "HIGH" &&
      document.orderConfidence !== "LOW")
  )
    throw new Error("MEDIA_SNAPSHOT_INVALID");
  return {
    mediaId: document.mediaId as EditorialMedia["mediaId"],
    objectKey: document.objectKey,
    width: document.width,
    height: document.height,
    alt: document.alt,
    position: maximum + 1,
    isRepresentative: existing.length === 0,
    ...(document.rights == null ? {} : { rights: document.rights }),
    ...(document.orderConfidence == null
      ? {}
      : { orderConfidence: document.orderConfidence }),
  };
}
