import sharp from "sharp";

import { composeRegion, pixelRegion, rotatedSize } from "./edits.js";
import { MediaRejectedError } from "./errors.js";
import {
  COVER_CROPPED_VARIANTS,
  LONG_SCROLL_ASPECT_RATIO,
  LONG_SCROLL_DISPLAY,
  LONG_SCROLL_FULL,
  STATIC_DERIVATIVES,
  STATIC_INPUT_LIMITS,
} from "./profiles.js";

import type { Metadata } from "sharp";
import type { MediaEdit, NormalizedCrop, PixelRegion } from "./edits.js";
import type { StaticDerivativeVariant } from "./profiles.js";

export type StaticDecodedFormat = "jpeg" | "png" | "webp";

/**
 * A decodable still: a job file path or bytes. `autoOrient` applies EXIF
 * orientation (JPEG/PNG/WebP sources); it is false for libheif output, whose
 * `irot`/`imir` transforms are already applied.
 */
export interface StaticSource {
  readonly input: string | Buffer;
  readonly autoOrient: boolean;
  /** Format the container sniffer detected; must match the decoder. */
  readonly expectedFormat: StaticDecodedFormat;
}

export interface StaticInspection {
  /** Dimensions after source orientation. */
  readonly width: number;
  readonly height: number;
  readonly hasAlpha: boolean;
  /** EXIF Orientation 1..8 reported by the decoder, or null. */
  readonly orientation: number | null;
}

export interface StaticDerivative {
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
  readonly contentType: "image/webp";
}

const open = (source: StaticSource) =>
  sharp(source.input, {
    limitInputPixels: STATIC_INPUT_LIMITS.limitInputPixels,
    failOn: STATIC_INPUT_LIMITS.failOn,
    pages: STATIC_INPUT_LIMITS.pages,
    autoOrient: source.autoOrient,
  });

const decodeFailure = (error: unknown): MediaRejectedError => {
  if (error instanceof MediaRejectedError) return error;
  const message = error instanceof Error ? error.message : "";
  return new MediaRejectedError(
    /pixel limit/i.test(message) ? "dimensions_exceeded" : "decode_failed",
  );
};

/** Header-level validation: format, single page, pixel ceiling. */
export async function inspectStaticSource(
  source: StaticSource,
): Promise<StaticInspection> {
  let metadata: Metadata;
  try {
    metadata = await open(source).metadata();
  } catch (error) {
    throw decodeFailure(error);
  }
  if (metadata.format !== source.expectedFormat) {
    throw new MediaRejectedError("unsupported_type");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new MediaRejectedError("animated_image_unsupported");
  }
  const width = source.autoOrient ? metadata.autoOrient.width : metadata.width;
  const height = source.autoOrient
    ? metadata.autoOrient.height
    : metadata.height;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new MediaRejectedError("decode_failed");
  }
  if (width * height > STATIC_INPUT_LIMITS.limitInputPixels) {
    throw new MediaRejectedError("dimensions_exceeded");
  }
  const reported = metadata.orientation;
  const orientation =
    reported !== undefined &&
    Number.isSafeInteger(reported) &&
    reported >= 1 &&
    reported <= 8
      ? reported
      : null;
  return { width, height, hasAlpha: metadata.hasAlpha, orientation };
}

/**
 * Output size for a variant, never upscaled. Long scrolls keep a readable
 * short-edge-bounded `display` and a taller `full`.
 */
export function staticDerivativeSize(
  variant: StaticDerivativeVariant,
  width: number,
  height: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const pixels = width * height;
  const longScroll = longEdge > LONG_SCROLL_ASPECT_RATIO * shortEdge;
  let scale = Math.min(1, STATIC_DERIVATIVES[variant].maxLongEdge / longEdge);
  if (longScroll && variant === "full") {
    scale = Math.min(
      1,
      LONG_SCROLL_FULL.maxLongEdge / longEdge,
      Math.sqrt(LONG_SCROLL_FULL.maxPixels / pixels),
    );
  } else if (longScroll && variant === "display") {
    scale = Math.min(
      1,
      LONG_SCROLL_DISPLAY.maxShortEdge / shortEdge,
      LONG_SCROLL_DISPLAY.maxLongEdge / longEdge,
      Math.sqrt(LONG_SCROLL_DISPLAY.maxPixels / pixels),
    );
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Pixel region of the edited (and optionally cover-cropped) frame. */
export function staticEditRegion(
  inspection: { readonly width: number; readonly height: number },
  edit: MediaEdit,
  coverCrop: NormalizedCrop | null,
): { frame: { width: number; height: number }; region: PixelRegion } {
  const frame = rotatedSize(inspection.width, inspection.height, edit.rotation);
  const edited = pixelRegion(edit.crop, frame.width, frame.height);
  const region = coverCrop
    ? composeRegion(edited, pixelRegion(coverCrop, edited.width, edited.height))
    : edited;
  return { frame, region };
}

/**
 * Renders one WebP derivative: orientation → rotation → crop (→ cover crop
 * for the card variants `thumb` and `cover`) → downscale. Output never
 * carries EXIF, XMP, ICC or GPS metadata.
 */
export async function renderStaticDerivative(
  source: StaticSource,
  inspection: StaticInspection,
  variant: StaticDerivativeVariant,
  edit: MediaEdit,
  coverCrop: NormalizedCrop | null = null,
): Promise<StaticDerivative> {
  const { frame, region } = staticEditRegion(
    inspection,
    edit,
    COVER_CROPPED_VARIANTS.has(variant) ? coverCrop : null,
  );
  const target = staticDerivativeSize(variant, region.width, region.height);
  let pipeline = open(source);
  if (edit.rotation !== 0) pipeline = pipeline.rotate(edit.rotation);
  if (region.width !== frame.width || region.height !== frame.height) {
    pipeline = pipeline.extract(region);
  }
  if (target.width !== region.width || target.height !== region.height) {
    pipeline = pipeline.resize(target.width, target.height, { fit: "fill" });
  }
  try {
    const { data, info } = await pipeline
      .webp({ quality: STATIC_DERIVATIVES[variant].quality })
      .toBuffer({ resolveWithObject: true });
    return {
      buffer: data,
      width: info.width,
      height: info.height,
      contentType: "image/webp",
    };
  } catch (error) {
    throw decodeFailure(error);
  }
}
