/**
 * Dedicated worker: Standard Live motion via mediabunny (WebCodecs). Asks
 * `isConfigSupported` with the file's own decoder configuration, copies
 * compatible AAC, encodes AAC-LC at 128 kbps otherwise (then measures it),
 * encodes H.264 High (long edge ≤ 1920, source rate ≤ 60 fps), tags untagged
 * BT.709 frames explicitly, keeps timestamps, carries no source tags, and
 * checks duration, audio and picture fidelity before answering. Samples and
 * inputs are closed after use; answers carry content-free reasons only.
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  MP4,
  Mp4OutputFormat,
  QTFF,
  Output,
  VideoSample,
} from "mediabunny";

import {
  audioDecoderSupports,
  audioEncoderSupports,
  avcHighCodecString,
  videoDecoderSupports,
  videoEncoderSupports,
} from "./capabilities";
import {
  acceptMotionOutput,
  audioIsCopyable,
  meanRgbDifference,
  planMotionConversion,
  precheckMotion,
  shouldRetainMotionInput,
} from "./live-motion";
import {
  STANDARD_MOTION,
  standardMotionBitrate,
  standardMotionTarget,
} from "./profiles";

import type { WebCodecsLike } from "./capabilities";
import type {
  MotionPlan,
  MotionPreprocessResult,
  MotionSourceFacts,
} from "./live-motion";

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;
const codecs = globalThis as unknown as WebCodecsLike;

const BT709_YUV = {
  primaries: "bt709",
  transfer: "bt709",
  matrix: "bt709",
  fullRange: false,
} as const;
const SRGB_RGB = {
  primaries: "bt709",
  transfer: "iec61966-2-1",
  matrix: "rgb",
  fullRange: true,
} as const;
const RGB_FORMATS = new Set(["RGBA", "RGBX", "BGRA", "BGRX"]);
const FIDELITY_WIDTH = 64;

let active: Conversion | null = null;

const describeContainer = async (
  input: Input,
): Promise<MotionSourceFacts["container"]> => {
  const format = await input.getFormat();
  return format === MP4 ? "mp4" : format === QTFF ? "quicktime" : "other";
};

const describeSource = async (input: Input): Promise<MotionSourceFacts> => {
  const container = await describeContainer(input);
  const videos = await input.getVideoTracks();
  const audios = await input.getAudioTracks();
  const video = videos[0];
  if (video === undefined)
    return {
      container,
      videoTracks: 0,
      audioTracks: audios.length,
      durationMs: 0,
      videoCodec: null,
      display: { width: 0, height: 0 },
      frameRate: 0,
      colorSpace: {},
      highDynamicRange: false,
      videoDecodable: false,
      audio: null,
    };
  const decoderConfig = await video.getDecoderConfig();
  const audio = audios[0];
  const audioConfig = audio ? await audio.getDecoderConfig() : null;
  const stats = await video.computePacketStats(120);
  return {
    container,
    videoTracks: videos.length,
    audioTracks: audios.length,
    durationMs: Math.round((await input.computeDuration()) * 1000),
    videoCodec: await video.getCodec(),
    display: {
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
    },
    frameRate: stats.averagePacketRate,
    colorSpace: await video.getColorSpace(),
    highDynamicRange: await video.hasHighDynamicRange(),
    videoDecodable:
      decoderConfig !== null &&
      (await videoDecoderSupports(codecs, decoderConfig)),
    audio: audio
      ? {
          codec: await audio.getCodec(),
          channels: await audio.getNumberOfChannels(),
          sampleRate: await audio.getSampleRate(),
          decodable:
            audioConfig !== null &&
            (await audioDecoderSupports(codecs, audioConfig)),
        }
      : null,
  };
};

/** Rebuilds an untagged frame with an explicit colour space (BT.709 / sRGB). */
const tagFrame = async (sample: VideoSample): Promise<VideoSample> => {
  const space = sample.colorSpace;
  if (
    sample.format === null ||
    (space.primaries && space.transfer && space.matrix)
  )
    return sample;
  const buffer = new Uint8Array(sample.allocationSize());
  await sample.copyTo(buffer);
  return new VideoSample(buffer, {
    format: sample.format,
    codedWidth: sample.visibleRect.width,
    codedHeight: sample.visibleRect.height,
    timestamp: sample.timestamp,
    duration: sample.duration,
    rotation: sample.rotation,
    colorSpace: RGB_FORMATS.has(sample.format) ? SRGB_RGB : BT709_YUV,
  });
};

const firstFramePixels = async (
  input: Input,
  size: { width: number; height: number },
): Promise<Uint8ClampedArray | null> => {
  const video = await input.getPrimaryVideoTrack();
  if (!video) return null;
  const sink = new CanvasSink(video, {
    width: size.width,
    height: size.height,
    fit: "fill",
  });
  const wrapped = await sink.getCanvas(await video.getFirstTimestamp());
  if (!wrapped) return null;
  const context = (wrapped.canvas as OffscreenCanvas).getContext("2d");
  return context?.getImageData(0, 0, size.width, size.height).data ?? null;
};

const audioBitrateOf = async (input: Input): Promise<number | null> => {
  const audio = await input.getPrimaryAudioTrack();
  if (!audio) return null;
  return (await audio.computePacketStats()).averageBitrate;
};

const measureOutput = async (
  input: Input,
  bytes: ArrayBuffer,
  facts: MotionSourceFacts,
  plan: MotionPlan,
): Promise<boolean> => {
  const result = new Input({
    formats: ALL_FORMATS,
    source: new BufferSource(bytes),
  });
  try {
    const size = {
      width: FIDELITY_WIDTH,
      height: Math.max(
        2,
        Math.round((FIDELITY_WIDTH * plan.target.height) / plan.target.width),
      ),
    };
    const sourcePixels = await firstFramePixels(input, size);
    const outputPixels = await firstFramePixels(result, size);
    return acceptMotionOutput(facts, plan, {
      durationMs: Math.round((await result.computeDuration()) * 1000),
      videoTracks: (await result.getVideoTracks()).length,
      audioTracks: (await result.getAudioTracks()).length,
      audioBitrate:
        plan.audio === "encode" ? await audioBitrateOf(result) : null,
      meanFrameDifference:
        sourcePixels && outputPixels
          ? meanRgbDifference(sourcePixels, outputPixels)
          : null,
    });
  } catch {
    return false;
  } finally {
    result.dispose();
  }
};

const planFor = async (facts: MotionSourceFacts) => {
  const precheck = precheckMotion(facts);
  if (precheck !== null) return { unsupported: precheck } as const;
  const target = standardMotionTarget(facts.display);
  const rate = Math.min(facts.frameRate || 30, STANDARD_MOTION.maxFrameRate);
  const videoEncodable = await videoEncoderSupports(codecs, {
    codec: avcHighCodecString(target.width, target.height, rate),
    width: target.width,
    height: target.height,
    bitrate: standardMotionBitrate(target),
    framerate: rate,
  });
  const aacEncodable =
    facts.audio !== null && !audioIsCopyable(facts)
      ? await audioEncoderSupports(codecs, {
          codec: "mp4a.40.2",
          numberOfChannels: facts.audio.channels,
          sampleRate: facts.audio.sampleRate,
          bitrate: STANDARD_MOTION.audioBitrate,
        })
      : false;
  return planMotionConversion(facts, { videoEncodable, aacEncodable });
};

const transcode = async (
  input: Input,
  plan: MotionPlan,
): Promise<ArrayBuffer | "unsupported" | "failed"> => {
  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  });
  let conversion: Conversion;
  try {
    conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      showWarnings: false,
      // Source tags (content identifier, location, device) never reach the master.
      tags: () => ({}),
      video: videoOptions(plan),
      audio:
        plan.audio === "encode"
          ? {
              codec: "aac",
              bitrate: STANDARD_MOTION.audioBitrate,
              forceTranscode: true,
            }
          : { codec: "aac" },
    });
  } catch {
    return "failed";
  }
  const droppedMedia = conversion.discardedTracks.some(
    (discarded) =>
      discarded.track.isVideoTrack() || discarded.track.isAudioTrack(),
  );
  if (!conversion.isValid || droppedMedia) {
    await output.cancel().catch(() => undefined);
    return "unsupported";
  }
  active = conversion;
  try {
    await conversion.execute();
  } catch {
    return "failed";
  } finally {
    active = null;
  }
  return target.buffer ?? "failed";
};

const convert = async (blob: Blob): Promise<MotionPreprocessResult> => {
  if (
    typeof codecs.VideoDecoder === "undefined" ||
    typeof codecs.VideoEncoder === "undefined"
  )
    return { status: "unsupported", reason: "webcodecs_unavailable" };
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });
  try {
    let facts: MotionSourceFacts;
    try {
      facts = await describeSource(input);
    } catch {
      return { status: "failed", reason: "decode_failed" };
    }
    const plan = await planFor(facts);
    if ("unsupported" in plan)
      return { status: "unsupported", reason: plan.unsupported };
    const bytes = await transcode(input, plan);
    if (bytes === "failed")
      return { status: "failed", reason: "processing_failed" };
    if (bytes === "unsupported")
      return {
        status: "unsupported",
        reason:
          plan.audio === "none"
            ? "video_encode_unsupported"
            : "audio_encode_unsupported",
      };
    if (!(await measureOutput(input, bytes, facts, plan)))
      return { status: "unsupported", reason: "output_rejected" };
    const hasAudio = facts.audio !== null;
    if (shouldRetainMotionInput(plan, blob.size, bytes.byteLength))
      return { status: "retained", durationMs: facts.durationMs, hasAudio };
    return {
      status: "optimized",
      blob: new Blob([bytes], { type: "video/mp4" }),
      contentType: "video/mp4",
      width: plan.target.width,
      height: plan.target.height,
      durationMs: facts.durationMs,
      hasAudio,
    };
  } finally {
    input.dispose();
  }
};

const videoOptions = (plan: MotionPlan) => ({
  codec: "avc" as const,
  width: plan.target.width,
  height: plan.target.height,
  fit: "contain" as const,
  bitrate: plan.videoBitrate,
  forceTranscode: true,
  allowRotationMetadata: true,
  ...(plan.frameRate === null ? {} : { frameRate: plan.frameRate }),
  ...(plan.tagBt709
    ? {
        process: (sample: VideoSample) => tagFrame(sample),
        processedWidth: plan.target.width,
        processedHeight: plan.target.height,
      }
    : {}),
});

scope.onmessage = (event) => {
  const data = event.data as { type?: unknown; blob?: unknown };
  if (data.type === "cancel") {
    void active?.cancel();
    return;
  }
  if (!(data.blob instanceof Blob)) {
    scope.postMessage({ ok: false });
    return;
  }
  convert(data.blob).then(
    (result) => scope.postMessage({ ok: true, result }),
    () => scope.postMessage({ ok: false }),
  );
};
