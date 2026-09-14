import { describe, expect, it } from "vitest";

import { avcHighCodecString, preprocessConcurrency } from "./capabilities";
import {
  acceptMotionOutput,
  meanRgbDifference,
  planMotionConversion,
  shouldRetainMotionInput,
} from "./live-motion";
import {
  STANDARD_MOTION,
  standardMotionBitrate,
  standardMotionTarget,
} from "./profiles";

import type { MotionPlan, MotionSourceFacts } from "./live-motion";

const iphoneMotion: MotionSourceFacts = {
  videoTracks: 1,
  audioTracks: 1,
  durationMs: 2900,
  videoCodec: "hevc",
  display: { width: 1440, height: 1920 },
  frameRate: 30,
  colorSpace: {
    primaries: null,
    transfer: null,
    matrix: null,
    fullRange: null,
  },
  highDynamicRange: false,
  videoDecodable: true,
  audio: { codec: "aac", channels: 1, sampleRate: 48_000, decodable: true },
};

const supported = { videoEncodable: true, aacEncodable: true };

describe("Standard Live motion plan", () => {
  it("copies compatible AAC, targets H.264 ≤ 1920 and tags untagged frames BT.709", () => {
    const plan = planMotionConversion(iphoneMotion, supported) as MotionPlan;
    expect(plan).toMatchObject({
      audio: "copy",
      target: { width: 1440, height: 1920 },
      frameRate: null,
      tagBt709: true,
      retainable: false,
    });
    expect(plan.videoBitrate).toBe(standardMotionBitrate(plan.target));
  });

  it("is UNSUPPORTED only when the browser says so for the file's configuration", () => {
    // Firefox: no HEVC decode for the file's real codec string.
    expect(
      planMotionConversion(
        { ...iphoneMotion, videoDecodable: false },
        supported,
      ),
    ).toEqual({ unsupported: "video_decode_unsupported" });
    // Encoding needed but no AAC encoder: never drop the audio.
    expect(
      planMotionConversion(
        {
          ...iphoneMotion,
          audio: {
            codec: "opus",
            channels: 2,
            sampleRate: 48_000,
            decodable: true,
          },
        },
        { videoEncodable: true, aacEncodable: false },
      ),
    ).toEqual({ unsupported: "audio_encode_unsupported" });
    expect(
      planMotionConversion(iphoneMotion, {
        videoEncodable: false,
        aacEncodable: true,
      }),
    ).toEqual({
      unsupported: "video_encode_unsupported",
    });
    expect(
      planMotionConversion(
        { ...iphoneMotion, highDynamicRange: true },
        supported,
      ),
    ).toEqual({ unsupported: "color_unsupported" });
    expect(
      planMotionConversion(
        {
          ...iphoneMotion,
          colorSpace: {
            primaries: "bt2020",
            transfer: "arib-std-b67",
            matrix: "bt2020-ncl",
          },
        },
        supported,
      ),
    ).toEqual({ unsupported: "color_unsupported" });
  });

  it("encodes non-AAC audio at 128 kbps, caps the frame rate at 60 and scales 4K down", () => {
    const plan = planMotionConversion(
      {
        ...iphoneMotion,
        display: { width: 3840, height: 2160 },
        frameRate: 120,
        colorSpace: { primaries: "bt709", transfer: "bt709", matrix: "bt709" },
        audio: {
          codec: "pcm-s16",
          channels: 2,
          sampleRate: 48_000,
          decodable: true,
        },
      },
      supported,
    ) as MotionPlan;
    expect(plan).toMatchObject({
      audio: "encode",
      frameRate: 60,
      target: { width: 1920, height: 1080 },
      tagBt709: false,
    });
    expect(standardMotionTarget({ width: 1441, height: 1921 }).width % 2).toBe(
      0,
    );
  });

  it("refuses layouts and durations that Original cannot fix either", () => {
    expect(
      planMotionConversion({ ...iphoneMotion, videoTracks: 2 }, supported),
    ).toEqual({
      unsupported: "stream_layout_unsupported",
    });
    expect(
      planMotionConversion({ ...iphoneMotion, durationMs: 31_000 }, supported),
    ).toEqual({
      unsupported: "duration_exceeded",
    });
  });
});

describe("Standard Live output checks", () => {
  const plan = planMotionConversion(iphoneMotion, supported) as MotionPlan;
  const good = {
    durationMs: 2965,
    videoTracks: 1,
    audioTracks: 1,
    audioBitrate: null,
    meanFrameDifference: 3,
  };

  it("accepts output within duration tolerance, with audio and faithful pictures", () => {
    expect(acceptMotionOutput(iphoneMotion, plan, good)).toBe(true);
    expect(
      acceptMotionOutput(iphoneMotion, plan, { ...good, audioTracks: 0 }),
    ).toBe(false);
    expect(
      acceptMotionOutput(iphoneMotion, plan, { ...good, durationMs: 3100 }),
    ).toBe(false);
    // Chromium's colour-matrix mismatch shows up as a large frame difference.
    expect(
      acceptMotionOutput(iphoneMotion, plan, {
        ...good,
        meanFrameDifference: 30,
      }),
    ).toBe(false);
    expect(
      acceptMotionOutput(iphoneMotion, plan, {
        ...good,
        meanFrameDifference: null,
      }),
    ).toBe(false);
  });

  it("verifies the measured AAC bitrate when audio was encoded (WebKit produced 28 kbps)", () => {
    const encoded = { ...plan, audio: "encode" as const };
    expect(
      acceptMotionOutput(iphoneMotion, encoded, {
        ...good,
        audioBitrate: 28_000,
      }),
    ).toBe(false);
    expect(
      acceptMotionOutput(iphoneMotion, encoded, {
        ...good,
        audioBitrate: 121_000,
      }),
    ).toBe(true);
  });

  it("retains an already compatible H.264 source only when re-encoding saves < 5 %", () => {
    const avc = planMotionConversion(
      {
        ...iphoneMotion,
        videoCodec: "avc",
        display: { width: 1080, height: 1920 },
      },
      supported,
    ) as MotionPlan;
    expect(avc.retainable).toBe(true);
    expect(shouldRetainMotionInput(avc, 1_000_000, 990_000)).toBe(true);
    expect(shouldRetainMotionInput(avc, 1_000_000, 800_000)).toBe(false);
    expect(shouldRetainMotionInput(plan, 1_000_000, 990_000)).toBe(false);
  });

  it("measures picture difference over RGB channels only", () => {
    const left = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 255]);
    const right = new Uint8ClampedArray([13, 20, 30, 0, 0, 3, 0, 0]);
    expect(meanRgbDifference(left, right)).toBe(1);
    expect(meanRgbDifference(left, new Uint8ClampedArray(4))).toBeNull();
  });
});

describe("capability helpers", () => {
  it("runs preprocessing one at a time on phones and two otherwise", () => {
    expect(preprocessConcurrency("phone")).toBe(1);
    expect(preprocessConcurrency("tablet")).toBe(2);
    expect(preprocessConcurrency("pc")).toBe(2);
  });

  it("builds H.264 High codec strings with a fitting level", () => {
    expect(avcHighCodecString(1920, 1080, 30)).toBe("avc1.640028");
    expect(avcHighCodecString(1920, 1080, 60)).toBe("avc1.64002a");
    expect(STANDARD_MOTION.audioBitrate).toBe(128_000);
  });
});
