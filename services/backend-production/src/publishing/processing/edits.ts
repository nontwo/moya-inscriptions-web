import { MediaProcessingInputError } from "./errors.js";

export type EditRotation = 0 | 90 | 180 | 270;

export interface NormalizedCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Item edit. Order: source orientation (EXIF/`irot`/matrix) → clockwise
 * `rotation` → `crop` normalized against the rotated frame. A cover crop is
 * normalized against the edited frame.
 */
export interface MediaEdit {
  readonly rotation: EditRotation;
  readonly crop: NormalizedCrop | null;
}

export interface PixelRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const TOLERANCE = 1e-6;
const MIN_CROP_EXTENT = 1e-4;
const EDIT_KEY_PATTERN = /^(?:base|[0-9a-f]{32})$/;

/**
 * Validates a normalized crop. Edits are validated by the contracts before
 * they reach the processor, so a bad value is an input error, not content.
 */
export function parseCrop(value: unknown): NormalizedCrop | null {
  if (value === null) return null;
  if (typeof value !== "object" || value === undefined) {
    throw new MediaProcessingInputError();
  }
  const { x, y, width, height } = value as Record<string, unknown>;
  const numbers = [x, y, width, height];
  if (
    Object.keys(value).length !== 4 ||
    numbers.some((n) => typeof n !== "number" || !Number.isFinite(n))
  ) {
    throw new MediaProcessingInputError();
  }
  const crop = { x, y, width, height } as NormalizedCrop;
  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width < MIN_CROP_EXTENT ||
    crop.height < MIN_CROP_EXTENT ||
    crop.x + crop.width > 1 + TOLERANCE ||
    crop.y + crop.height > 1 + TOLERANCE
  ) {
    throw new MediaProcessingInputError();
  }
  return crop;
}

export function parseEdit(value: unknown): MediaEdit {
  if (typeof value !== "object" || value === null) {
    throw new MediaProcessingInputError();
  }
  const { rotation, crop } = value as Record<string, unknown>;
  if (
    Object.keys(value).length !== 2 ||
    (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
  ) {
    throw new MediaProcessingInputError();
  }
  return { rotation, crop: parseCrop(crop) };
}

/** Edit keys are opaque here: `base` or 32 lowercase hex computed upstream. */
export const isEditKey = (value: unknown): value is string =>
  typeof value === "string" && EDIT_KEY_PATTERN.test(value);

export const isIdentityEdit = (edit: MediaEdit): boolean =>
  edit.rotation === 0 && edit.crop === null;

export const rotatedSize = (
  width: number,
  height: number,
  rotation: EditRotation,
): { width: number; height: number } =>
  rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };

/**
 * Integer pixel region of a normalized crop within a `width`×`height` frame.
 * Every edge rounds to the nearest pixel; still and motion derivatives share
 * this rule (L10).
 */
export function pixelRegion(
  crop: NormalizedCrop | null,
  width: number,
  height: number,
): PixelRegion {
  if (!crop) return { left: 0, top: 0, width, height };
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const left = clamp(Math.round(crop.x * width), 0, width - 1);
  const top = clamp(Math.round(crop.y * height), 0, height - 1);
  const right = clamp(
    Math.round((crop.x + crop.width) * width),
    left + 1,
    width,
  );
  const bottom = clamp(
    Math.round((crop.y + crop.height) * height),
    top + 1,
    height,
  );
  return { left, top, width: right - left, height: bottom - top };
}

/** Composes an inner region (relative to `outer`) into absolute pixels. */
export const composeRegion = (
  outer: PixelRegion,
  inner: PixelRegion,
): PixelRegion => ({
  left: outer.left + inner.left,
  top: outer.top + inner.top,
  width: inner.width,
  height: inner.height,
});

/**
 * FFmpeg geometry filters applied after autorotation to a motion whose
 * upright frame is `frame`: clockwise rotation (transpose), the crop in exact
 * pixels from {@link pixelRegion}, then a no-upscale scale to `maxLongEdge`
 * with even dimensions. Commas inside expressions are escaped for the
 * filtergraph parser; the chain is passed as one argument (no shell).
 */
export function ffmpegEditFilters(
  edit: MediaEdit,
  frame: { readonly width: number; readonly height: number },
  maxLongEdge: number,
): string[] {
  if (
    !Number.isSafeInteger(maxLongEdge) ||
    maxLongEdge < 2 ||
    !Number.isSafeInteger(frame.width) ||
    !Number.isSafeInteger(frame.height) ||
    frame.width < 1 ||
    frame.height < 1
  ) {
    throw new MediaProcessingInputError();
  }
  const filters: string[] = [];
  if (edit.rotation === 90) filters.push("transpose=clock");
  if (edit.rotation === 180) filters.push("hflip", "vflip");
  if (edit.rotation === 270) filters.push("transpose=cclock");
  if (edit.crop) {
    const rotated = rotatedSize(frame.width, frame.height, edit.rotation);
    const region = pixelRegion(edit.crop, rotated.width, rotated.height);
    // H.264 needs at least 2×2; only a degenerate crop grows, inside the frame.
    const width = Math.min(rotated.width, Math.max(2, region.width));
    const height = Math.min(rotated.height, Math.max(2, region.height));
    const left = Math.min(region.left, rotated.width - width);
    const top = Math.min(region.top, rotated.height - height);
    filters.push(`crop=w=${width}:h=${height}:x=${left}:y=${top}:exact=1`);
  }
  filters.push(
    `scale=w=min(${maxLongEdge}\\,iw):h=min(${maxLongEdge}\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2`,
  );
  return filters;
}
