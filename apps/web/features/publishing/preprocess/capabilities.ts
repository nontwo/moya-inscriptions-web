/**
 * Browser capability probes for Standard preprocessing. Each probe asks the
 * real API with the real configuration (never a user-agent guess) and caches
 * nothing across files where the answer depends on the file.
 */

import type { PresentationPlatform } from "../../shell/device-platform";

/** Preprocessing concurrency: 1 on phones, 2 otherwise (design §4). */
export const preprocessConcurrency = (
  platform: PresentationPlatform,
): number => (platform === "phone" ? 1 : 2);

/** Component transfers running at once. */
export const TRANSFER_CONCURRENCY = 2;

export interface CanvasLike {
  getContext(type: "2d"): unknown;
  convertToBlob(options: { type: string; quality?: number }): Promise<Blob>;
}

export type CanvasFactory = (width: number, height: number) => CanvasLike;

export const offscreenCanvasFactory = (): CanvasFactory | null =>
  typeof OffscreenCanvas === "undefined"
    ? null
    : (width, height) =>
        new OffscreenCanvas(width, height) as unknown as CanvasLike;

/**
 * Whether the canvas encoder really produces `type` (WebKit silently returns
 * PNG for a WebP request).
 */
export const canvasEncodes = async (
  createCanvas: CanvasFactory,
  type: string,
): Promise<boolean> => {
  try {
    const canvas = createCanvas(2, 2);
    const context = canvas.getContext("2d") as {
      fillStyle: string;
      fillRect(x: number, y: number, w: number, h: number): void;
    } | null;
    if (!context) return false;
    context.fillStyle = "rgba(10,20,30,0.5)";
    context.fillRect(0, 0, 2, 2);
    const blob = await canvas.convertToBlob({ type, quality: 0.9 });
    return blob.type === type;
  } catch {
    return false;
  }
};

export interface WebCodecsLike {
  readonly VideoDecoder?: {
    isConfigSupported(
      config: VideoDecoderConfig,
    ): Promise<{ supported?: boolean }>;
  };
  readonly VideoEncoder?: {
    isConfigSupported(
      config: VideoEncoderConfig,
    ): Promise<{ supported?: boolean }>;
  };
  readonly AudioEncoder?: {
    isConfigSupported(
      config: AudioEncoderConfig,
    ): Promise<{ supported?: boolean }>;
  };
  readonly AudioDecoder?: {
    isConfigSupported(
      config: AudioDecoderConfig,
    ): Promise<{ supported?: boolean }>;
  };
}

const supported = async (
  probe: (() => Promise<{ supported?: boolean }>) | null,
): Promise<boolean> => {
  if (probe === null) return false;
  try {
    return (await probe()).supported === true;
  } catch {
    return false;
  }
};

/** VideoDecoder support for the file's own decoder configuration (real codec string). */
export const videoDecoderSupports = (
  codecs: WebCodecsLike,
  config: VideoDecoderConfig,
) =>
  supported(
    codecs.VideoDecoder
      ? () => codecs.VideoDecoder!.isConfigSupported(config)
      : null,
  );

export const videoEncoderSupports = (
  codecs: WebCodecsLike,
  config: VideoEncoderConfig,
) =>
  supported(
    codecs.VideoEncoder
      ? () => codecs.VideoEncoder!.isConfigSupported(config)
      : null,
  );

export const audioEncoderSupports = (
  codecs: WebCodecsLike,
  config: AudioEncoderConfig,
) =>
  supported(
    codecs.AudioEncoder
      ? () => codecs.AudioEncoder!.isConfigSupported(config)
      : null,
  );

export const audioDecoderSupports = (
  codecs: WebCodecsLike,
  config: AudioDecoderConfig,
) =>
  supported(
    codecs.AudioDecoder
      ? () => codecs.AudioDecoder!.isConfigSupported(config)
      : null,
  );

/** H.264 High codec string with a level that fits the frame size and rate. */
export const avcHighCodecString = (
  width: number,
  height: number,
  frameRate: number,
): string => {
  const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const rate = macroblocks * Math.max(1, frameRate);
  const level =
    macroblocks <= 8_192 && rate <= 245_760
      ? 0x28 // 4.0
      : macroblocks <= 8_704 && rate <= 522_240
        ? 0x2a // 4.2
        : macroblocks <= 22_080 && rate <= 589_824
          ? 0x32 // 5.0
          : macroblocks <= 36_864 && rate <= 983_040
            ? 0x33 // 5.1
            : 0x34; // 5.2
  return `avc1.6400${level.toString(16)}`;
};

export const workersAvailable = (): boolean => typeof Worker !== "undefined";
