import { describe, expect, it, vi } from "vitest";

import {
  STANDARD_STATIC,
  standardStaticTarget,
  withinStandardStatic,
} from "./profiles";
import { preprocessStaticImage, shouldRetainStaticInput } from "./static-image";

import type {
  DecodedImage,
  EncodableCanvas,
  StandardStillSourceType,
  StaticImageDeps,
  StaticPreprocessRequest,
} from "./static-image";

describe("Standard static profile bounds", () => {
  it("keeps ordinary images within 8192 long edge and 25 MP without upscaling", () => {
    expect(standardStaticTarget({ width: 4032, height: 3024 })).toEqual({
      width: 4032,
      height: 3024,
    });
    expect(withinStandardStatic({ width: 5712, height: 4284 })).toBe(true); // 24.47 MP
    const huge = standardStaticTarget({ width: 12_000, height: 9000 });
    expect(Math.max(huge.width, huge.height)).toBeLessThanOrEqual(8192);
    expect(huge.width * huge.height).toBeLessThanOrEqual(
      STANDARD_STATIC.maxPixels,
    );
    expect(standardStaticTarget({ width: 10, height: 10 })).toEqual({
      width: 10,
      height: 10,
    });
  });

  it("bounds tall images by the short edge (≤ 2048) and long edge (≤ 16384)", () => {
    expect(standardStaticTarget({ width: 1200, height: 16_000 })).toEqual({
      width: 1200,
      height: 16_000,
    });
    const tall = standardStaticTarget({ width: 3000, height: 20_000 });
    expect(tall.width).toBeLessThanOrEqual(2048);
    expect(tall.height).toBeLessThanOrEqual(16_384);
    expect(tall.width * tall.height).toBeLessThanOrEqual(
      STANDARD_STATIC.maxPixels,
    );
  });
});

describe("retention rule", () => {
  const base = {
    sourceType: "image/jpeg" as StandardStillSourceType,
    decodedInBrowser: true,
    decoded: { width: 4032, height: 3024 },
    inputBytes: 1000,
  };

  it("retains an acceptable input when re-encoding saves less than 5 %", () => {
    expect(shouldRetainStaticInput({ ...base, outputBytes: 1220 })).toBe(true); // WebKit grew it
    expect(shouldRetainStaticInput({ ...base, outputBytes: 951 })).toBe(true);
    expect(shouldRetainStaticInput({ ...base, outputBytes: 950 })).toBe(false);
    expect(shouldRetainStaticInput({ ...base, outputBytes: 560 })).toBe(false);
  });

  it("never retains when limits are exceeded or HEIC was not decoded", () => {
    expect(
      shouldRetainStaticInput({
        ...base,
        decoded: { width: 9000, height: 6000 },
        outputBytes: 1200,
      }),
    ).toBe(false);
    expect(
      shouldRetainStaticInput({
        ...base,
        sourceType: "image/heic",
        decodedInBrowser: false,
        outputBytes: null,
      }),
    ).toBe(false);
  });
});

interface FakeOptions {
  readonly decoded?: { width: number; height: number } | "throw";
  readonly webp?: boolean;
  readonly outputBytes?: number;
  readonly canvas?: "ok" | "null" | "throw-large";
  readonly alpha?: boolean;
  readonly substituteType?: string;
  /** Canvases stay transparent (all, or only above the constrained ceiling). */
  readonly blank?: boolean | "large";
}

const fakeDeps = (options: FakeOptions = {}) => {
  const close = vi.fn();
  const encodes: { type: string; quality?: number | undefined }[] = [];
  const canvases: { width: number; height: number }[] = [];
  const deps: StaticImageDeps = {
    decode: async () => {
      if (options.decoded === "throw")
        throw new DOMException("could not decode", "InvalidStateError");
      const size = options.decoded ?? { width: 400, height: 300 };
      return { ...size, close } satisfies DecodedImage;
    },
    createCanvas: (width, height) => {
      if (options.canvas === "null") return null;
      if (
        options.canvas === "throw-large" &&
        width * height > STANDARD_STATIC.constrainedCanvasPixels
      )
        throw new RangeError("canvas too large");
      canvases.push({ width, height });
      const canvas: EncodableCanvas = {
        width,
        height,
        getContext: () => ({
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage: () => undefined,
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            const blank =
              options.blank === true ||
              (options.blank === "large" &&
                width * height > STANDARD_STATIC.constrainedCanvasPixels);
            const data = new Uint8ClampedArray(w * h * 4).fill(blank ? 0 : 255);
            if (options.alpha) data[3] = 128;
            return { data };
          },
        }),
        convertToBlob: async ({ type, quality }) => {
          encodes.push({ type, quality });
          return new Blob([new Uint8Array(options.outputBytes ?? 100)], {
            type: options.substituteType ?? type,
          });
        },
      };
      return canvas;
    },
    webpEncodes: async () => options.webp ?? true,
  };
  return { deps, close, encodes, canvases };
};

const request = (
  overrides: Partial<StaticPreprocessRequest> = {},
): StaticPreprocessRequest => ({
  file: new Blob([new Uint8Array(1000)], { type: "image/jpeg" }),
  sourceType: "image/jpeg",
  exifOrientation: null,
  headerDimensions: null,
  mayHaveAlpha: false,
  ...overrides,
});

describe("Standard static preprocessing", () => {
  it("encodes opaque images as WebP q0.92 where supported and releases the bitmap", async () => {
    const fake = fakeDeps({ outputBytes: 400 });
    const result = await preprocessStaticImage(request(), fake.deps);
    expect(result).toMatchObject({
      status: "optimized",
      contentType: "image/webp",
      width: 400,
      height: 300,
    });
    expect(fake.encodes).toEqual([{ type: "image/webp", quality: 0.92 }]);
    expect(fake.close).toHaveBeenCalledOnce();
  });

  it("falls back to JPEG q0.92 without WebP and retains the input when that grows it", async () => {
    const fake = fakeDeps({ webp: false, outputBytes: 1220 });
    const result = await preprocessStaticImage(request(), fake.deps);
    expect(fake.encodes).toEqual([{ type: "image/jpeg", quality: 0.92 }]);
    expect(result).toEqual({
      status: "retained",
      contentType: "image/jpeg",
      width: 400,
      height: 300,
    });
  });

  it("retains an oriented input unchanged when re-encoding grows it (server derivatives orient it)", async () => {
    // WebKit's JPEG fallback grew the orientation-6 probe fixture by 21 %.
    for (const sourceType of ["image/jpeg", "image/heic"] as const) {
      const fake = fakeDeps({
        webp: false,
        outputBytes: 1210,
        decoded: { width: 300, height: 400 },
      });
      const result = await preprocessStaticImage(
        request({
          sourceType,
          exifOrientation: 6,
          headerDimensions: { width: 400, height: 300 },
        }),
        fake.deps,
      );
      expect(result).toEqual({
        status: "retained",
        contentType: sourceType,
        width: 300,
        height: 400,
      });
    }
    const smaller = await preprocessStaticImage(
      request({ exifOrientation: 6 }),
      fakeDeps({ webp: false, outputBytes: 900 }).deps,
    );
    expect(smaller.status).toBe("optimized");
  });

  it("treats a canvas that silently drew nothing as unsupported, after the constrained retry", async () => {
    const blank = fakeDeps({
      decoded: { width: 5712, height: 4284 },
      blank: true,
      outputBytes: 10,
    });
    expect(await preprocessStaticImage(request(), blank.deps)).toEqual({
      status: "unsupported",
      reason: "encode_unsupported",
    });
    expect(blank.canvases).toHaveLength(2);
    expect(
      blank.canvases[1]!.width * blank.canvases[1]!.height,
    ).toBeLessThanOrEqual(STANDARD_STATIC.constrainedCanvasPixels);
    expect(blank.encodes).toEqual([]);
    const largeOnly = fakeDeps({
      decoded: { width: 5712, height: 4284 },
      blank: "large",
      outputBytes: 10,
    });
    expect(
      (await preprocessStaticImage(request(), largeOnly.deps)).status,
    ).toBe("optimized");
  });

  it("uses lossless WebP or PNG for images with transparency", async () => {
    const withWebp = fakeDeps({ alpha: true, outputBytes: 10 });
    await preprocessStaticImage(
      request({ sourceType: "image/png", mayHaveAlpha: true }),
      withWebp.deps,
    );
    expect(withWebp.encodes).toEqual([{ type: "image/webp", quality: 1 }]);
    const withoutWebp = fakeDeps({ alpha: true, webp: false, outputBytes: 10 });
    const result = await preprocessStaticImage(
      request({ sourceType: "image/png", mayHaveAlpha: true }),
      withoutWebp.deps,
    );
    expect(withoutWebp.encodes).toEqual([
      { type: "image/png", quality: undefined },
    ]);
    expect(result).toMatchObject({
      status: "optimized",
      contentType: "image/png",
    });
  });

  it("offers a choice when HEIC cannot be decoded in this browser (never a silent fallback)", async () => {
    const heic = await preprocessStaticImage(
      request({ sourceType: "image/heic" }),
      fakeDeps({ decoded: "throw" }).deps,
    );
    expect(heic).toEqual({
      status: "unsupported",
      reason: "decode_unsupported",
    });
    const jpeg = await preprocessStaticImage(
      request(),
      fakeDeps({ decoded: "throw" }).deps,
    );
    expect(jpeg).toEqual({ status: "failed", reason: "decode_failed" });
  });

  it("offers a choice when the encoder is missing or substitutes another type", async () => {
    expect(
      await preprocessStaticImage(request(), fakeDeps({ canvas: "null" }).deps),
    ).toEqual({
      status: "unsupported",
      reason: "encode_unsupported",
    });
    expect(
      await preprocessStaticImage(
        request(),
        fakeDeps({ substituteType: "image/png" }).deps,
      ),
    ).toEqual({ status: "unsupported", reason: "encode_unsupported" });
  });

  it("retries once at the constrained canvas size and refuses oversized sources before decoding", async () => {
    const fake = fakeDeps({
      decoded: { width: 5712, height: 4284 },
      canvas: "throw-large",
      outputBytes: 10,
    });
    const result = await preprocessStaticImage(request(), fake.deps);
    expect(result.status).toBe("optimized");
    expect(
      fake.canvases[0]!.width * fake.canvases[0]!.height,
    ).toBeLessThanOrEqual(STANDARD_STATIC.constrainedCanvasPixels);
    const decode = vi.fn();
    const refused = await preprocessStaticImage(
      request({ headerDimensions: { width: 20_000, height: 10_000 } }),
      { ...fakeDeps().deps, decode },
    );
    expect(refused).toEqual({
      status: "unsupported",
      reason: "input_too_large",
    });
    expect(decode).not.toHaveBeenCalled();
  });
});
