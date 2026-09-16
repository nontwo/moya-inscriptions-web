import {
  STANDARD_STATIC,
  STANDARD_STATIC_INPUT,
  meaningfulSaving,
  standardStaticTarget,
  withinStandardStatic,
} from "./profiles";

import type { Dimensions } from "./profiles";

/**
 * Standard static preprocessing (`standard-image-v1`), independent of the
 * worker transport so the decisions are testable: decode with EXIF
 * orientation applied, fit the profile, encode (WebP q0.92 or JPEG q0.92;
 * alpha as WebP q1 or PNG), then keep the unchanged input when re-encoding
 * saves less than 5 % and the input is an already-small JPEG, PNG or WebP
 * (§8.2). A retained input keeps its EXIF orientation; the server derivatives
 * apply it (autoOrient / irot), so it is never applied twice. A HEIC/HEIF
 * source is never retained: when the browser cannot decode it, or its
 * Standard output is not at least 5 % smaller, the item becomes an explicit
 * choice (Original or remove) — never a silent fallback to the source bytes.
 */

export type StandardStillSourceType =
  "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";

export type StandardStillOutputType = "image/webp" | "image/jpeg" | "image/png";

/** The only source types the unchanged input may be kept as a Standard master. */
export type RetainedStandardStillType =
  "image/jpeg" | "image/png" | "image/webp";

export const isRetainableStandardStillType = (
  type: StandardStillSourceType,
): type is RetainedStandardStillType =>
  type === "image/jpeg" || type === "image/png" || type === "image/webp";

export interface StaticPreprocessRequest {
  readonly file: Blob;
  readonly sourceType: StandardStillSourceType;
  /** EXIF orientation read by the client parser, or null when absent. */
  readonly exifOrientation: number | null;
  /** Source dimensions from the header when known (before orientation). */
  readonly headerDimensions: Dimensions | null;
  /** Whether the header says the source may carry transparency. */
  readonly mayHaveAlpha: boolean;
}

/**
 * `standard_not_smaller`: a HEIC/HEIF source whose Standard output would not
 * be at least 5 % smaller; the author chooses Original or remove.
 */
export type StaticUnsupportedReason =
  | "decode_unsupported"
  | "encode_unsupported"
  | "input_too_large"
  | "standard_not_smaller";

export type StaticPreprocessResult =
  | {
      readonly status: "optimized";
      readonly blob: Blob;
      readonly contentType: StandardStillOutputType;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly status: "retained";
      readonly contentType: RetainedStandardStillType;
      readonly width: number;
      readonly height: number;
    }
  | { readonly status: "unsupported"; readonly reason: StaticUnsupportedReason }
  | {
      readonly status: "failed";
      readonly reason: "decode_failed" | "encode_failed";
    };

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface Drawable2dContext {
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: "low" | "medium" | "high";
  drawImage(
    image: unknown,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  getImageData(
    sx: number,
    sy: number,
    sw: number,
    sh: number,
  ): { readonly data: Uint8ClampedArray };
}

export interface EncodableCanvas {
  readonly width: number;
  readonly height: number;
  getContext(type: "2d", options?: { alpha?: boolean }): unknown;
  convertToBlob(options: { type: string; quality?: number }): Promise<Blob>;
}

export interface StaticImageDeps {
  /** `createImageBitmap(file, { imageOrientation: "from-image" })`. */
  decode(file: Blob): Promise<DecodedImage>;
  createCanvas(width: number, height: number): EncodableCanvas | null;
  /** Whether the canvas encoder really produces WebP (cached by the caller). */
  webpEncodes(): Promise<boolean>;
}

/**
 * The mandatory retention rule (§8.2, §9.1): the unchanged input becomes the
 * Standard master only when it is a JPEG, PNG or WebP the browser decoded,
 * already within the profile, and re-encoding did not save at least 5 %.
 * HEIC/HEIF is never retained (D3). EXIF orientation does not prevent
 * retention: the server derivatives apply it.
 */
export const shouldRetainStaticInput = (facts: {
  readonly sourceType: StandardStillSourceType;
  readonly decodedInBrowser: boolean;
  /** Decoded (orientation-applied) size; the profile bounds are orientation-independent. */
  readonly decoded: Dimensions;
  readonly inputBytes: number;
  readonly outputBytes: number | null;
}): boolean =>
  isRetainableStandardStillType(facts.sourceType) &&
  facts.decodedInBrowser &&
  withinStandardStatic(facts.decoded) &&
  (facts.outputBytes === null ||
    !meaningfulSaving(
      facts.inputBytes,
      facts.outputBytes,
      STANDARD_STATIC.minimumSaving,
    ));

const ALPHA_SCAN_ROWS = 256;

/** Scans the canvas for any pixel with alpha below 255, in bounded strips. */
export const canvasHasTransparency = (
  context: Drawable2dContext,
  size: Dimensions,
): boolean => {
  for (let y = 0; y < size.height; y += ALPHA_SCAN_ROWS) {
    const rows = Math.min(ALPHA_SCAN_ROWS, size.height - y);
    const { data } = context.getImageData(0, y, size.width, rows);
    for (let index = 3; index < data.length; index += 4)
      if (data[index] !== 255) return true;
  }
  return false;
};

const BLANK_SAMPLE_ROWS = 5;

/**
 * Whether a canvas that should hold an opaque picture is still fully
 * transparent in evenly spaced sample rows: WebKit may hand out a canvas
 * above its memory ceiling that silently draws nothing.
 */
export const canvasLooksBlank = (
  context: Drawable2dContext,
  size: Dimensions,
): boolean => {
  for (let sample = 0; sample < BLANK_SAMPLE_ROWS; sample += 1) {
    const y = Math.min(
      size.height - 1,
      Math.floor(((sample + 0.5) * size.height) / BLANK_SAMPLE_ROWS),
    );
    const { data } = context.getImageData(0, y, size.width, 1);
    for (let index = 3; index < data.length; index += 4)
      if (data[index] !== 0) return false;
  }
  return true;
};

const isHeif = (type: StandardStillSourceType) =>
  type === "image/heic" || type === "image/heif";

interface Rendered {
  readonly canvas: EncodableCanvas;
  readonly context: Drawable2dContext;
  readonly target: Dimensions;
}

const render = (
  deps: StaticImageDeps,
  image: DecodedImage,
  ceiling: number,
  opaque: boolean,
): Rendered | null => {
  const target = standardStaticTarget(image, ceiling);
  const canvas = deps.createCanvas(target.width, target.height);
  const context = canvas?.getContext("2d", { alpha: true }) as
    Drawable2dContext | null | undefined;
  if (!canvas || !context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, target.width, target.height);
  // An opaque source that left the canvas transparent was not drawn at all.
  if (opaque && canvasLooksBlank(context, target)) return null;
  return { canvas, context, target };
};

const encode = async (
  rendered: Rendered,
  alpha: boolean,
  webp: boolean,
): Promise<{ blob: Blob; contentType: StandardStillOutputType } | null> => {
  const contentType: StandardStillOutputType = webp
    ? "image/webp"
    : alpha
      ? "image/png"
      : "image/jpeg";
  const blob = await rendered.canvas.convertToBlob(
    contentType === "image/png"
      ? { type: contentType }
      : {
          type: contentType,
          quality: alpha
            ? STANDARD_STATIC.alphaQuality
            : STANDARD_STATIC.opaqueQuality,
        },
  );
  // An encoder that silently substituted another type is not the profile.
  return blob.type === contentType && blob.size > 0
    ? { blob, contentType }
    : null;
};

export async function preprocessStaticImage(
  request: StaticPreprocessRequest,
  deps: StaticImageDeps,
): Promise<StaticPreprocessResult> {
  const header = request.headerDimensions;
  if (
    header !== null &&
    header.width * header.height > STANDARD_STATIC_INPUT.maxSourcePixels
  )
    return { status: "unsupported", reason: "input_too_large" };
  let image: DecodedImage;
  try {
    image = await deps.decode(request.file);
  } catch {
    // Only WebKit decodes HEIC; elsewhere the explicit Original choice applies.
    return isHeif(request.sourceType)
      ? { status: "unsupported", reason: "decode_unsupported" }
      : { status: "failed", reason: "decode_failed" };
  }
  try {
    const decoded = { width: image.width, height: image.height };
    if (decoded.width * decoded.height > STANDARD_STATIC_INPUT.maxSourcePixels)
      return { status: "unsupported", reason: "input_too_large" };
    let rendered: Rendered | null = null;
    try {
      rendered = render(
        deps,
        image,
        STANDARD_STATIC.maxPixels,
        !request.mayHaveAlpha,
      );
    } catch {
      rendered = null;
    }
    if (
      rendered === null &&
      decoded.width * decoded.height > STANDARD_STATIC.constrainedCanvasPixels
    ) {
      try {
        rendered = render(
          deps,
          image,
          STANDARD_STATIC.constrainedCanvasPixels,
          !request.mayHaveAlpha,
        );
      } catch {
        rendered = null;
      }
    }
    if (rendered === null)
      return { status: "unsupported", reason: "encode_unsupported" };
    const alpha =
      request.mayHaveAlpha &&
      canvasHasTransparency(rendered.context, rendered.target);
    let output: Awaited<ReturnType<typeof encode>>;
    try {
      output = await encode(rendered, alpha, await deps.webpEncodes());
    } catch {
      output = null;
    }
    if (output === null)
      return { status: "unsupported", reason: "encode_unsupported" };
    if (
      isRetainableStandardStillType(request.sourceType) &&
      shouldRetainStaticInput({
        sourceType: request.sourceType,
        decodedInBrowser: true,
        decoded,
        inputBytes: request.file.size,
        outputBytes: output.blob.size,
      })
    )
      return {
        status: "retained",
        contentType: request.sourceType,
        width: decoded.width,
        height: decoded.height,
      };
    // A HEIC/HEIF whose Standard output saves < 5 % is neither kept nor grown silently.
    if (
      isHeif(request.sourceType) &&
      !meaningfulSaving(
        request.file.size,
        output.blob.size,
        STANDARD_STATIC.minimumSaving,
      )
    )
      return { status: "unsupported", reason: "standard_not_smaller" };
    return {
      status: "optimized",
      blob: output.blob,
      contentType: output.contentType,
      width: rendered.target.width,
      height: rendered.target.height,
    };
  } finally {
    image.close();
  }
}
