/**
 * Server derivative profiles for work publishing (design §3.5–3.6, §8). Numbers
 * here are the single documented source. `media_items.processing_profile`
 * records the browser Standard profile, never these.
 */

/** sharp input safety: pixel ceiling, strict decoding, first page only. */
export const STATIC_INPUT_LIMITS = {
  limitInputPixels: 120_000_000,
  failOn: "error",
  pages: 1,
} as const;

export type StaticDerivativeVariant = "thumb" | "display" | "full" | "cover";

/** Card derivatives shaped by the independent cover crop (design §8.3, L10). */
export const COVER_CROPPED_VARIANTS: ReadonlySet<StaticDerivativeVariant> =
  new Set(["thumb", "cover"]);

export interface StaticDerivativeProfile {
  /** WebP quality 1..100. */
  readonly quality: number;
  /** Maximum long edge in pixels; never upscaled. */
  readonly maxLongEdge: number;
}

/** WebP derivatives; all metadata stripped, sRGB output, no upscaling. */
export const STATIC_DERIVATIVES: Readonly<
  Record<StaticDerivativeVariant, StaticDerivativeProfile>
> = {
  thumb: { quality: 80, maxLongEdge: 480 },
  display: { quality: 86, maxLongEdge: 2048 },
  full: { quality: 90, maxLongEdge: 8192 },
  cover: { quality: 86, maxLongEdge: 1080 },
};

/**
 * Tall or wide images (long edge more than 2.5 × the short edge, the same
 * threshold as the browser Standard profile) are treated as long scrolls.
 */
export const LONG_SCROLL_ASPECT_RATIO = 2.5;

/** Long scroll `full`: long edge ≤ 16,000 and ≤ 40 MP (design §3.6). */
export const LONG_SCROLL_FULL = {
  maxLongEdge: 16_000,
  maxPixels: 40_000_000,
} as const;

/**
 * Long scroll `display` is bounded by its short edge so text stays readable:
 * fits 1280 × 16,000 and ≤ 20 MP (feasibility decision 3).
 */
export const LONG_SCROLL_DISPLAY = {
  maxShortEdge: 1280,
  maxLongEdge: 16_000,
  maxPixels: 20_000_000,
} as const;

/**
 * ffprobe validation bounds for motion components: one video stream, at most
 * one audio stream, ≤ 30 s, each dimension ≤ 8192. Timed metadata tracks
 * (`codec_type` data, e.g. the Live Photo still-image-time track) are allowed
 * up to `maxDataStreams`; they are never mapped into the derivative.
 */
export const MOTION_INPUT_LIMITS = {
  maxVideoStreams: 1,
  maxAudioStreams: 1,
  maxDataStreams: 8,
  maxStreams: 16,
  maxDurationMs: 30_000,
  maxDimension: 8192,
} as const;

/**
 * Motion derivative: H.264 High, CRF 21, preset veryfast, 8-bit yuv420p,
 * AAC-LC 128 kbps (source channels), fast start, all container metadata
 * dropped and display rotation baked into pixels. The long edge is capped at
 * 1920 to match the browser Standard Live profile.
 */
export const MOTION_DERIVATIVE = {
  videoCodec: "libx264",
  outputVideoCodecName: "h264",
  videoProfile: "high",
  preset: "veryfast",
  crf: 21,
  pixelFormat: "yuv420p",
  audioCodec: "aac",
  outputAudioCodecName: "aac",
  audioBitrate: "128k",
  maxLongEdge: 1920,
} as const;

/**
 * Output duration may differ from the source by encoder priming and one audio
 * frame (AAC frames are ≤ 64 ms at ≥ 16 kHz).
 */
export const MOTION_DURATION_TOLERANCE_MS = 100;

/**
 * Motion colour handling (M05). Every derivative is SDR BT.709 limited range
 * and says so in its stream tags. Untagged sources are treated as BT.709.
 * Other SDR colour spaces are converted with zscale. HLG and PQ sources are
 * tone-mapped to SDR (linearize at `nominalPeakNits`, convert primaries,
 * `tonemap` operator, BT.709 transfer). Originals keep their HDR; derivatives
 * never claim it.
 */
export const MOTION_COLOR = {
  outputPrimaries: "bt709",
  outputTransfer: "bt709",
  outputMatrix: "bt709",
  outputRange: "tv",
  nominalPeakNits: 100,
  toneMapOperator: "hable",
  /** ffprobe primaries accepted (after `unknown` → bt709). */
  primaries: [
    "bt709",
    "smpte170m",
    "bt470bg",
    "bt470m",
    "smpte240m",
    "bt2020",
    "smpte431",
    "smpte432",
  ],
  /** SDR transfers accepted (after `unknown` → bt709). */
  sdrTransfers: [
    "bt709",
    "smpte170m",
    "bt470bg",
    "bt470m",
    "smpte240m",
    "iec61966-2-1",
    "bt2020-10",
    "bt2020-12",
  ],
  /** HDR transfers that are tone-mapped. */
  hdrTransfers: ["arib-std-b67", "smpte2084"],
  /** Matrices accepted (after `unknown` → bt709). */
  matrices: ["bt709", "smpte170m", "bt470bg", "smpte240m", "bt2020nc"],
  ranges: ["tv", "pc"],
} as const;

/** Hard wall-clock limits per tool invocation (container killed after). */
export const MEDIA_TOOL_TIMEOUTS_MS = {
  heifDecode: 60_000,
  ffprobe: 20_000,
  ffmpegMotion: 180_000,
} as const;

/**
 * The container also runs its tool under `timeout --signal=KILL` for the host
 * limit plus this grace, so it ends even if the host lost track of it.
 */
export const MEDIA_TOOL_CONTAINER_TIMEOUT_GRACE_MS = 10_000;

/** Captured tool output ceilings (stdout parsed, stderr discarded). */
export const MEDIA_TOOL_OUTPUT_LIMITS = {
  ffprobeStdoutBytes: 1024 * 1024,
  defaultStdoutBytes: 64 * 1024,
  stderrBytes: 64 * 1024,
} as const;

/** Largest tool output file accepted back from the sandbox. */
export const MEDIA_TOOL_MAX_OUTPUT_FILE_BYTES = 1024 * 1024 * 1024;

/** Docker sandbox resource flags for the media tools container. */
export const MEDIA_TOOL_SANDBOX = {
  tmpfs: "/tmp:rw,size=512m",
  memory: "1536m",
  cpus: "2",
  pidsLimit: "256",
  user: "10001:10001",
} as const;

/** Leading bytes read for Exif/XMP scanning of JPEG stills and packages. */
export const METADATA_HEAD_BYTES = 4 * 1024 * 1024;

/**
 * Largest legacy user media still (a Phase 4 work PNG kept in PostgreSQL) the
 * worker reads into a job for edit derivatives; the same bound as user media.
 */
export const LEGACY_USER_MEDIA_MAX_BYTES = 4 * 1024 * 1024;
