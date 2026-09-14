import type { Size } from "./media-geometry";

/**
 * Bounded local previews of selected files (S06). A tile or thumbnail shows
 * a small copy, never the camera original: a 24 MP still decoded for every
 * 56-112 px tile (and again in each dialog) can make a phone browser reload
 * the tab, which loses a no-save session. Each preview is decoded once at a
 * bounded size through `createImageBitmap`, drawn to a small image and the
 * bitmap and canvas released at once; at most two decode at a time. Entries
 * are shared per Blob and size, and their object URL is revoked a moment
 * after the last user lets go (a layout swap remounts the same tiles).
 *
 * Where the browser cannot draw the file (no `createImageBitmap`, or e.g.
 * HEIC outside WebKit) the original's object URL is used as before, so a
 * browser whose `<img>` can still decode it shows it.
 */

/** Long edge of strip tiles and staged thumbnails (112 px at 3×). */
export const THUMBNAIL_EDGE = 384;
/** Long edge of the image inside the crop dialogs (the viewport at 3×). */
export const CROP_IMAGE_EDGE = 2048;

export interface BoundedImage {
  readonly url: string;
  /** Pixel size in display orientation; null when the original is shown as is. */
  readonly size: Size | null;
}

export interface PreviewEnvironment {
  /** Null where the browser has no `createImageBitmap`. */
  readonly decoder: () =>
    ((blob: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>) | null;
  readonly createCanvas: () => HTMLCanvasElement | null;
  /** Null where object URLs cannot be made. */
  readonly createObjectURL: (blob: Blob) => string | null;
  readonly revokeObjectURL: (url: string) => void;
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export const browserPreviewEnvironment = (): PreviewEnvironment => ({
  decoder: () =>
    typeof createImageBitmap === "function"
      ? (blob, options) =>
          options === undefined
            ? createImageBitmap(blob)
            : createImageBitmap(blob, options)
      : null,
  createCanvas: () =>
    typeof document === "undefined" ? null : document.createElement("canvas"),
  createObjectURL: (blob) =>
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : null,
  revokeObjectURL: (url) => {
    if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function")
      URL.revokeObjectURL(url);
  },
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
});

const decodeBounded = async (
  decode: NonNullable<ReturnType<PreviewEnvironment["decoder"]>>,
  blob: Blob,
  maxEdge: number,
): Promise<ImageBitmap> => {
  try {
    // Display orientation, like an <img> and the crop's frame.
    return await decode(blob, {
      imageOrientation: "from-image",
      resizeWidth: maxEdge,
      resizeQuality: "medium",
    });
  } catch (error) {
    // Engines that refuse these options decode once at full size; the
    // bitmap is drawn down and closed immediately.
    if (!(error instanceof TypeError)) throw error;
    return decode(blob);
  }
};

/** Draws one bounded copy; the bitmap and canvas backing store are freed before returning. */
export const renderBounded = async (
  environment: PreviewEnvironment,
  blob: Blob,
  maxEdge: number,
): Promise<{ readonly blob: Blob; readonly size: Size }> => {
  const decode = environment.decoder();
  if (decode === null) throw new Error("decode unavailable");
  const bitmap = await decodeBounded(decode, blob, maxEdge);
  let canvas: HTMLCanvasElement | null = null;
  try {
    if (!(bitmap.width > 0 && bitmap.height > 0))
      throw new Error("decode failed");
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const size = {
      width: Math.max(1, Math.round(bitmap.width * scale)),
      height: Math.max(1, Math.round(bitmap.height * scale)),
    };
    canvas = environment.createCanvas();
    const context = canvas?.getContext("2d") ?? null;
    if (canvas === null || context === null)
      throw new Error("canvas unavailable");
    canvas.width = size.width;
    canvas.height = size.height;
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const transparent =
      blob.type === "image/png" ||
      blob.type === "image/webp" ||
      blob.type === "image/gif";
    const drawn = canvas;
    const out = await new Promise<Blob | null>((resolve) =>
      drawn.toBlob(
        resolve,
        transparent ? "image/png" : "image/jpeg",
        transparent ? undefined : 0.85,
      ),
    );
    if (out === null) throw new Error("encode failed");
    return { blob: out, size };
  } finally {
    bitmap.close();
    if (canvas !== null) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};

export interface PreviewHandle {
  readonly result: Promise<BoundedImage | null>;
  /** Idempotent. */
  release(): void;
}

export interface PreviewCache {
  acquire(blob: Blob, maxEdge: number): PreviewHandle;
}

interface Entry {
  refs: number;
  disposed: boolean;
  url: string | null;
  timer: unknown;
  result: Promise<BoundedImage | null>;
}

export const createPreviewCache = (
  environment: PreviewEnvironment,
  {
    concurrency = 2,
    releaseDelayMs = 2000,
  }: { readonly concurrency?: number; readonly releaseDelayMs?: number } = {},
): PreviewCache => {
  const entries = new WeakMap<Blob, Map<number, Entry>>();
  let running = 0;
  const waiting: (() => void)[] = [];
  const takeSlot = (): Promise<void> => {
    if (running < concurrency) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  const giveSlot = () => {
    const next = waiting.shift();
    // The slot passes straight to the next waiting decode.
    if (next) next();
    else running -= 1;
  };

  const produce = async (
    entry: Entry,
    blob: Blob,
    maxEdge: number,
  ): Promise<BoundedImage | null> => {
    await takeSlot();
    try {
      if (entry.disposed) return null;
      const bounded =
        environment.decoder() === null
          ? null
          : await renderBounded(environment, blob, maxEdge).catch(() => null);
      const url = environment.createObjectURL(bounded?.blob ?? blob);
      if (url === null) return null;
      if (entry.disposed) {
        environment.revokeObjectURL(url);
        return null;
      }
      entry.url = url;
      return { url, size: bounded?.size ?? null };
    } finally {
      giveSlot();
    }
  };

  const dispose = (blob: Blob, maxEdge: number, entry: Entry) => {
    entry.timer = null;
    if (entry.refs > 0) return;
    entry.disposed = true;
    const sizes = entries.get(blob);
    if (sizes?.get(maxEdge) === entry) sizes.delete(maxEdge);
    if (entry.url !== null) environment.revokeObjectURL(entry.url);
    entry.url = null;
  };

  return {
    acquire: (blob, maxEdge) => {
      let sizes = entries.get(blob);
      if (sizes === undefined) {
        sizes = new Map();
        entries.set(blob, sizes);
      }
      let entry = sizes.get(maxEdge);
      if (entry === undefined) {
        const created: Entry = {
          refs: 0,
          disposed: false,
          url: null,
          timer: null,
          result: Promise.resolve(null),
        };
        created.result = produce(created, blob, maxEdge);
        sizes.set(maxEdge, created);
        entry = created;
      }
      const held = entry;
      held.refs += 1;
      if (held.timer !== null) {
        environment.clearTimeout(held.timer);
        held.timer = null;
      }
      let released = false;
      return {
        result: held.result,
        release: () => {
          if (released) return;
          released = true;
          held.refs -= 1;
          if (held.refs > 0 || held.disposed) return;
          held.timer = environment.setTimeout(
            () => dispose(blob, maxEdge, held),
            releaseDelayMs,
          );
        },
      };
    },
  };
};

let shared: PreviewCache | null = null;

export const sharedPreviewCache = (): PreviewCache => {
  shared ??= createPreviewCache(browserPreviewEnvironment());
  return shared;
};
