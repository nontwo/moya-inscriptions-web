import type { PublicMedia } from "@moya/contracts";

export type CatalogMediaDimensions = Pick<PublicMedia, "height" | "width">;

export const CATALOG_ULTRA_WIDE_ASPECT_RATIO = 2.4;

export const isUltraWideCatalogMedia = (
  media: CatalogMediaDimensions | undefined,
): boolean => {
  if (media === undefined) return false;

  const { height, width } = media;
  return (
    Number.isFinite(height) &&
    Number.isFinite(width) &&
    height > 0 &&
    width > 0 &&
    width / height >= CATALOG_ULTRA_WIDE_ASPECT_RATIO
  );
};
