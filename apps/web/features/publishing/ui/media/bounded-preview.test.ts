import { describe, expect, it, vi } from "vitest";

import { createPreviewCache, renderBounded } from "./bounded-preview";

import type { PreviewEnvironment } from "./bounded-preview";

const flush = async () => {
  for (let round = 0; round < 6; round += 1) await Promise.resolve();
};

const bitmap = (width: number, height: number) => ({
  width,
  height,
  close: vi.fn(),
});

const setup = (
  decode: (blob: Blob, options?: ImageBitmapOptions) => Promise<unknown>,
) => {
  let sequence = 0;
  const canvases: { width: number; height: number; drawn: unknown[] }[] = [];
  const timers: (() => void)[] = [];
  const environment = {
    decoder: () => decode,
    createCanvas: () => {
      const canvas = {
        width: 0,
        height: 0,
        drawn: [] as unknown[],
        getContext: () => ({
          drawImage: (...args: unknown[]) => canvas.drawn.push(args),
        }),
        toBlob: (
          callback: (blob: Blob | null) => void,
          type: string,
          quality?: number,
        ) => callback(new Blob(["small"], { type: `${type};q=${quality}` })),
      };
      canvases.push(canvas);
      return canvas;
    },
    createObjectURL: vi.fn(
      (blob: Blob) => `blob:${(sequence += 1)}:${blob.size}`,
    ),
    revokeObjectURL: vi.fn(),
    setTimeout: (callback: () => void) => timers.push(callback),
    clearTimeout: vi.fn(),
  } as unknown as PreviewEnvironment & {
    createObjectURL: ReturnType<typeof vi.fn>;
    revokeObjectURL: ReturnType<typeof vi.fn>;
  };
  return { environment, canvases, timers };
};

describe("bounded previews", () => {
  it("decodes at a bounded size, frees the bitmap and canvas, and keeps the display size", async () => {
    const decoded = bitmap(384, 512);
    const decode = vi.fn(async () => decoded);
    const test = setup(decode);
    const source = new Blob([new Uint8Array(4000)], { type: "image/jpeg" });
    const result = await renderBounded(test.environment, source, 384);
    expect(decode).toHaveBeenCalledWith(source, {
      imageOrientation: "from-image",
      resizeWidth: 384,
      resizeQuality: "medium",
    });
    // Portrait: the long edge is bounded too.
    expect(result.size).toEqual({ width: 288, height: 384 });
    expect(result.blob.type).toBe("image/jpeg;q=0.85");
    expect(decoded.close).toHaveBeenCalled();
    expect(test.canvases[0]).toMatchObject({ width: 0, height: 0 });
    expect(test.canvases[0]!.drawn).toEqual([[decoded, 0, 0, 288, 384]]);
  });

  it("decodes once without options where the engine refuses them", async () => {
    const decode = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("unknown option"))
      .mockResolvedValueOnce(bitmap(4000, 3000));
    const test = setup(decode);
    const png = new Blob(["png"], { type: "image/png" });
    const result = await renderBounded(test.environment, png, 400);
    expect(decode).toHaveBeenLastCalledWith(png);
    expect(result.size).toEqual({ width: 400, height: 300 });
    // Transparency survives.
    expect(result.blob.type).toBe("image/png;q=undefined");
  });

  it("shares one decode per Blob, runs two at a time and revokes a moment after the last release", async () => {
    const pending: ((value: unknown) => void)[] = [];
    const decode = vi.fn(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    const test = setup(decode);
    const cache = createPreviewCache(test.environment, {
      concurrency: 2,
      releaseDelayMs: 1000,
    });
    const [a, b, c] = [new Blob(["a"]), new Blob(["b"]), new Blob(["c"])];
    const firstA = cache.acquire(a, 384);
    const secondA = cache.acquire(a, 384);
    cache.acquire(b, 384);
    const handleC = cache.acquire(c, 384);
    await flush();
    expect(decode).toHaveBeenCalledTimes(2);
    pending[0]!(bitmap(384, 288));
    await flush();
    // The freed slot goes to the waiting decode.
    expect(decode).toHaveBeenCalledTimes(3);
    const image = await firstA.result;
    expect(image?.url).toMatch(/^blob:1:/u);
    expect(await secondA.result).toBe(image);

    firstA.release();
    firstA.release();
    expect(test.timers).toHaveLength(0);
    secondA.release();
    expect(test.timers).toHaveLength(1);
    // Taken again before the moment passed: nothing is revoked or decoded again.
    const again = cache.acquire(a, 384);
    expect(test.environment.clearTimeout).toHaveBeenCalled();
    test.timers.splice(0)[0]!();
    expect(test.environment.revokeObjectURL).not.toHaveBeenCalled();
    again.release();
    test.timers.splice(0)[0]!();
    expect(test.environment.revokeObjectURL).toHaveBeenCalledWith(image!.url);
    expect(decode).toHaveBeenCalledTimes(3);

    // Released before its turn: never decoded.
    const d = new Blob(["d"]);
    const handleD = cache.acquire(d, 384);
    handleD.release();
    test.timers.splice(0)[0]!();
    pending[1]!(bitmap(10, 10));
    expect(await handleD.result).toBe(null);
    expect(decode).toHaveBeenCalledTimes(3);

    // Released while decoding: its URL is revoked as soon as it exists.
    handleC.release();
    test.timers.splice(0)[0]!();
    pending[2]!(bitmap(10, 10));
    expect(await handleC.result).toBe(null);
    expect(test.environment.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("falls back to the original where the browser cannot draw it", async () => {
    const test = setup(async () => {
      throw new DOMException("undecodable", "InvalidStateError");
    });
    const cache = createPreviewCache(test.environment);
    const heic = new Blob([new Uint8Array(12)], { type: "image/heic" });
    const image = await cache.acquire(heic, 384).result;
    expect(image).toEqual({ url: "blob:1:12", size: null });

    const withoutBitmaps = setup(async () => null);
    const plain = createPreviewCache({
      ...withoutBitmaps.environment,
      decoder: () => null,
    });
    expect(await plain.acquire(heic, 384).result).toEqual({
      url: "blob:1:12",
      size: null,
    });
  });
});
