/**
 * Documented browser Standard profiles (Q04, Q06, L09; design §3.6 and the
 * verified feasibility decisions in §8). These numbers are the single client
 * source; the Backend records the profile name, never these values.
 */

export const STANDARD_IMAGE_PROFILE = "standard-image-v1" as const;
export const STANDARD_LIVE_PROFILE = "standard-live-v1" as const;

/** Standard static output bounds (§8.3). No upscaling, cropping or filters. */
export const STANDARD_STATIC = {
  maxPixels: 25_000_000,
  /** Ordinary aspect ratios: long edge. */
  maxLongEdge: 8192,
  /** Tall or wide images (long edge more than 2.5 × short edge). */
  longScrollAspect: 2.5,
  longScrollMaxShortEdge: 2048,
  longScrollMaxLongEdge: 16_384,
  /** Canvas ceiling applied only when a larger canvas cannot be created (mobile WebKit). */
  constrainedCanvasPixels: 16_777_216,
  opaqueQuality: 0.92,
  /** Alpha output: WebP at quality 1 (lossless where the encoder honours it) or PNG. */
  alphaQuality: 1,
  /** Re-encoding must save at least this fraction, otherwise an acceptable input is retained. */
  minimumSaving: 0.05,
} as const;

/**
 * Input safety limits, separate from the output profile (Q06): decoding is
 * refused above this many source pixels. There is no byte-size rule.
 */
export const STANDARD_STATIC_INPUT = {
  maxSourcePixels: 120_000_000,
} as const;

/** Standard Live motion output (§3.6, §8.5). */
export const STANDARD_MOTION = {
  videoCodec: "avc" as const,
  maxLongEdge: 1920,
  maxFrameRate: 60,
  /** Target bitrate at 1920×1080, scaled by output area. */
  referenceBitrate: 6_000_000,
  referencePixels: 1920 * 1080,
  minimumBitrate: 1_000_000,
  maximumBitrate: 8_000_000,
  audioCodec: "aac" as const,
  /** AAC-LC bitrate when audio must be encoded; copied compatible audio keeps its own. */
  audioBitrate: 128_000,
  /** Encoded audio below this measured bitrate is not accepted (WebKit ignored 128 kbps). */
  minimumMeasuredAudioBitrate: 110_000,
  maxDurationMs: 30_000,
  /** Encoder priming plus one audio frame. */
  durationToleranceMs: 100,
  /** Mean absolute channel difference (0–255) above which the output is refused. */
  fidelityMaxMeanDifference: 12,
  minimumSaving: 0.05,
} as const;

export interface Dimensions {
  readonly width: number;
  readonly height: number;
}

/** Output dimensions for a decoded (display-oriented) source. */
export const standardStaticTarget = (
  source: Dimensions,
  canvasPixelCeiling: number = STANDARD_STATIC.maxPixels,
): Dimensions => {
  const { width, height } = source;
  const long = Math.max(width, height);
  const short = Math.max(1, Math.min(width, height));
  const tall = long / short > STANDARD_STATIC.longScrollAspect;
  const pixelCeiling = Math.min(STANDARD_STATIC.maxPixels, canvasPixelCeiling);
  const scale = Math.min(
    1,
    (tall
      ? STANDARD_STATIC.longScrollMaxLongEdge
      : STANDARD_STATIC.maxLongEdge) / long,
    Math.sqrt(pixelCeiling / (width * height)),
    tall ? STANDARD_STATIC.longScrollMaxShortEdge / short : 1,
  );
  if (scale >= 1) return { width, height };
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
};

/** Whether a decoded source already satisfies the Standard static bounds. */
export const withinStandardStatic = (source: Dimensions): boolean => {
  const target = standardStaticTarget(source);
  return target.width === source.width && target.height === source.height;
};

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

/** Motion output dimensions (even, long edge ≤ 1920, never upscaled). */
export const standardMotionTarget = (display: Dimensions): Dimensions => {
  const long = Math.max(display.width, display.height);
  const scale = Math.min(1, STANDARD_MOTION.maxLongEdge / long);
  return {
    width: even(display.width * scale),
    height: even(display.height * scale),
  };
};

/** ~6 Mbps at 1080p, scaled by area and clamped. */
export const standardMotionBitrate = (target: Dimensions): number =>
  Math.round(
    Math.min(
      STANDARD_MOTION.maximumBitrate,
      Math.max(
        STANDARD_MOTION.minimumBitrate,
        (STANDARD_MOTION.referenceBitrate * target.width * target.height) /
          STANDARD_MOTION.referencePixels,
      ),
    ),
  );

/** Whether re-encoded bytes saved enough over the input to be worth keeping. */
export const meaningfulSaving = (
  inputBytes: number,
  outputBytes: number,
  minimumSaving: number,
): boolean => outputBytes <= inputBytes * (1 - minimumSaving);
