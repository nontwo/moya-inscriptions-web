import {
  STANDARD_MOTION,
  meaningfulSaving,
  standardMotionBitrate,
  standardMotionTarget,
} from "./profiles";

import type { Dimensions } from "./profiles";

/**
 * Standard Live motion decisions (`standard-live-v1`, §3.6 and §8.5) kept
 * apart from mediabunny so they are testable: which facts make the browser
 * path UNSUPPORTED (always backed by an `isConfigSupported` answer for the
 * file's real configuration), how audio is handled (copy compatible AAC,
 * otherwise AAC-LC ≥ 128 kbps with a measured-bitrate check), and whether an
 * output is acceptable (duration, audio presence, picture fidelity).
 */

export type MotionUnsupportedReason =
  | "webcodecs_unavailable"
  | "stream_layout_unsupported"
  | "duration_exceeded"
  | "video_decode_unsupported"
  | "video_encode_unsupported"
  | "audio_decode_unsupported"
  | "audio_encode_unsupported"
  | "color_unsupported"
  | "output_rejected";

export interface MotionColorSpace {
  readonly primaries?: string | null;
  readonly transfer?: string | null;
  readonly matrix?: string | null;
  readonly fullRange?: boolean | null;
}

export interface MotionSourceFacts {
  /** Container the bytes were demuxed from; only `mp4` may ever be retained. */
  readonly container: "mp4" | "quicktime" | "other";
  readonly videoTracks: number;
  readonly audioTracks: number;
  readonly durationMs: number;
  readonly videoCodec: string | null;
  readonly display: Dimensions;
  readonly frameRate: number;
  readonly colorSpace: MotionColorSpace;
  readonly highDynamicRange: boolean;
  /** `VideoDecoder.isConfigSupported(track decoder config)`. */
  readonly videoDecodable: boolean;
  readonly audio: {
    readonly codec: string | null;
    readonly channels: number;
    readonly sampleRate: number;
    /** `AudioDecoder.isConfigSupported(track decoder config)`. */
    readonly decodable: boolean;
  } | null;
}

export interface MotionEncoderSupport {
  /** `VideoEncoder.isConfigSupported` for the planned H.264 High output. */
  readonly videoEncodable: boolean;
  /** `AudioEncoder.isConfigSupported` for AAC-LC at 128 kbps (only asked when needed). */
  readonly aacEncodable: boolean;
}

export interface MotionPlan {
  readonly target: Dimensions;
  readonly frameRate: number | null;
  readonly videoBitrate: number;
  /** `copy` keeps compatible AAC packets; `encode` produces AAC-LC at 128 kbps. */
  readonly audio: "none" | "copy" | "encode";
  /** Frames are tagged BT.709 explicitly when the source is untagged. */
  readonly tagBt709: boolean;
  /**
   * Whether an unchanged source may be kept when re-encoding saves too
   * little: an MP4 that already fits the profile. QuickTime is never
   * retained as Standard; its transcoded MP4 is sent instead.
   */
  readonly retainable: boolean;
}

const BT709_OR_UNTAGGED = new Set<string | null | undefined>([
  null,
  undefined,
  "bt709",
]);
const SDR_TRANSFERS = new Set<string | null | undefined>([
  null,
  undefined,
  "bt709",
  "iec61966-2-1",
]);

export const colorIsBt709OrUntagged = (color: MotionColorSpace): boolean =>
  BT709_OR_UNTAGGED.has(color.primaries) &&
  BT709_OR_UNTAGGED.has(color.matrix) &&
  SDR_TRANSFERS.has(color.transfer);

const colorUntagged = (color: MotionColorSpace): boolean =>
  !color.primaries || !color.matrix || !color.transfer;

/** Decisions that need no encoder answer yet. */
export const precheckMotion = (
  facts: MotionSourceFacts,
): MotionUnsupportedReason | null => {
  if (facts.videoTracks !== 1 || facts.audioTracks > 1)
    return "stream_layout_unsupported";
  if (facts.durationMs > STANDARD_MOTION.maxDurationMs)
    return "duration_exceeded";
  if (!facts.videoDecodable) return "video_decode_unsupported";
  if (facts.highDynamicRange || !colorIsBt709OrUntagged(facts.colorSpace))
    return "color_unsupported";
  return null;
};

/** Whether the source audio would be copied rather than encoded. */
export const audioIsCopyable = (facts: MotionSourceFacts): boolean =>
  facts.audio !== null && facts.audio.codec === "aac";

/** The complete plan, or the reason the Standard browser path is unsupported. */
export const planMotionConversion = (
  facts: MotionSourceFacts,
  support: MotionEncoderSupport,
): MotionPlan | { readonly unsupported: MotionUnsupportedReason } => {
  const precheck = precheckMotion(facts);
  if (precheck !== null) return { unsupported: precheck };
  if (!support.videoEncodable)
    return { unsupported: "video_encode_unsupported" };
  let audio: MotionPlan["audio"] = "none";
  if (facts.audio !== null) {
    if (audioIsCopyable(facts)) {
      audio = "copy";
    } else {
      // Never drop audio: encoding needs both a decoder and an AAC encoder.
      if (!facts.audio.decodable)
        return { unsupported: "audio_decode_unsupported" };
      if (!support.aacEncodable)
        return { unsupported: "audio_encode_unsupported" };
      audio = "encode";
    }
  }
  const target = standardMotionTarget(facts.display);
  const long = Math.max(facts.display.width, facts.display.height);
  return {
    target,
    frameRate:
      facts.frameRate > STANDARD_MOTION.maxFrameRate
        ? STANDARD_MOTION.maxFrameRate
        : null,
    videoBitrate: standardMotionBitrate(target),
    audio,
    tagBt709: colorUntagged(facts.colorSpace),
    retainable:
      facts.container === "mp4" &&
      facts.videoCodec === "avc" &&
      long <= STANDARD_MOTION.maxLongEdge &&
      facts.frameRate <= STANDARD_MOTION.maxFrameRate &&
      (facts.audio === null || audioIsCopyable(facts)),
  };
};

export interface MotionOutputFacts {
  readonly durationMs: number;
  readonly videoTracks: number;
  readonly audioTracks: number;
  /** Measured average audio bitrate of the output, when it has audio. */
  readonly audioBitrate: number | null;
  /** Mean absolute channel difference of a sampled frame versus the source. */
  readonly meanFrameDifference: number | null;
}

/** Output checks: duration, audio kept, measured AAC bitrate, picture fidelity. */
export const acceptMotionOutput = (
  source: MotionSourceFacts,
  plan: MotionPlan,
  output: MotionOutputFacts,
): boolean =>
  output.videoTracks === 1 &&
  output.audioTracks === (source.audio === null ? 0 : 1) &&
  Math.abs(output.durationMs - source.durationMs) <=
    STANDARD_MOTION.durationToleranceMs &&
  (plan.audio !== "encode" ||
    (output.audioBitrate !== null &&
      output.audioBitrate >= STANDARD_MOTION.minimumMeasuredAudioBitrate)) &&
  output.meanFrameDifference !== null &&
  output.meanFrameDifference <= STANDARD_MOTION.fidelityMaxMeanDifference;

/** Keep the unchanged MP4 source only when it already fits and re-encoding saved < 5 %. */
export const shouldRetainMotionInput = (
  plan: MotionPlan,
  inputBytes: number,
  outputBytes: number,
): boolean =>
  plan.retainable &&
  !meaningfulSaving(inputBytes, outputBytes, STANDARD_MOTION.minimumSaving);

/** Mean absolute difference over RGB channels of two equally sized RGBA buffers. */
export const meanRgbDifference = (
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
): number | null => {
  if (left.length !== right.length || left.length === 0) return null;
  let sum = 0;
  let samples = 0;
  for (let index = 0; index < left.length; index += 4) {
    sum +=
      Math.abs(left[index]! - right[index]!) +
      Math.abs(left[index + 1]! - right[index + 1]!) +
      Math.abs(left[index + 2]! - right[index + 2]!);
    samples += 3;
  }
  return sum / samples;
};

export type MotionPreprocessResult =
  | {
      readonly status: "optimized";
      readonly blob: Blob;
      readonly contentType: "video/mp4";
      readonly width: number;
      readonly height: number;
      readonly durationMs: number;
      readonly hasAudio: boolean;
    }
  | {
      readonly status: "retained";
      readonly durationMs: number;
      readonly hasAudio: boolean;
    }
  | { readonly status: "unsupported"; readonly reason: MotionUnsupportedReason }
  | {
      readonly status: "failed";
      readonly reason: "decode_failed" | "processing_failed";
    };
