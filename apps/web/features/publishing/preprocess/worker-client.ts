import type { MotionPreprocessResult } from "./live-motion";
import type {
  StaticPreprocessRequest,
  StaticPreprocessResult,
} from "./static-image";

/**
 * Main-thread side of the preprocessing workers: one dedicated worker per
 * request, terminated when it answers, fails, is aborted or exceeds its time
 * budget (which also releases its decoders, bitmaps and canvases). A worker
 * the browser killed silently (memory pressure) never holds a preprocessing
 * slot beyond that budget; the item then needs the explicit choice. Without
 * Worker support Standard preprocessing is unsupported likewise.
 */

export interface PreprocessPort {
  still(
    request: StaticPreprocessRequest,
    signal: AbortSignal,
  ): Promise<StaticPreprocessResult>;
  motion(blob: Blob, signal: AbortSignal): Promise<MotionPreprocessResult>;
}

type Spawn = () => Worker;

export interface WorkerTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Time budgets per request (a 30 s Live motion at 1080p60 encodes well within this). */
export const PREPROCESS_TIMEOUT_MS = {
  still: 120_000,
  motion: 600_000,
} as const;

const defaultTimers: WorkerTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const run = <T>(
  spawn: Spawn | null,
  message: unknown,
  signal: AbortSignal,
  outcomes: { unsupported: T; failed: T; timedOut: T },
  timeoutMs: number,
  timers: WorkerTimers,
): Promise<T> => {
  if (spawn === null) return Promise.resolve(outcomes.unsupported);
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = spawn();
    } catch {
      resolve(outcomes.unsupported);
      return;
    }
    let settled = false;
    const finish = (): boolean => {
      if (settled) return false;
      settled = true;
      timers.clearTimeout(timer);
      worker.terminate();
      signal.removeEventListener("abort", onAbort);
      return true;
    };
    const onAbort = () => {
      if (finish()) reject(signal.reason);
    };
    const timer = timers.setTimeout(() => {
      if (finish()) resolve(outcomes.timedOut);
    }, timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (!finish()) return;
      const data = event.data as { ok?: unknown; result?: unknown } | null;
      resolve(data?.ok === true ? (data.result as T) : outcomes.failed);
    };
    worker.onmessageerror = () => {
      if (finish()) resolve(outcomes.failed);
    };
    worker.onerror = () => {
      if (finish()) resolve(outcomes.failed);
    };
    try {
      worker.postMessage(message);
    } catch {
      if (finish()) resolve(outcomes.failed);
    }
  });
};

export const createWorkerPreprocess = (
  spawnStill: Spawn | null = typeof Worker === "undefined"
    ? null
    : () =>
        new Worker(new URL("./static-image.worker.ts", import.meta.url), {
          type: "module",
        }),
  spawnMotion: Spawn | null = typeof Worker === "undefined"
    ? null
    : () =>
        new Worker(new URL("./live-motion.worker.ts", import.meta.url), {
          type: "module",
        }),
  timers: WorkerTimers = defaultTimers,
): PreprocessPort => ({
  still: (request, signal) =>
    run<StaticPreprocessResult>(
      spawnStill,
      request,
      signal,
      {
        unsupported: { status: "unsupported", reason: "encode_unsupported" },
        failed: { status: "failed", reason: "encode_failed" },
        // A budget overrun is this device's limit: Original or remove.
        timedOut: { status: "unsupported", reason: "encode_unsupported" },
      },
      PREPROCESS_TIMEOUT_MS.still,
      timers,
    ),
  motion: (blob, signal) =>
    run<MotionPreprocessResult>(
      spawnMotion,
      { blob },
      signal,
      {
        unsupported: { status: "unsupported", reason: "webcodecs_unavailable" },
        failed: { status: "failed", reason: "processing_failed" },
        timedOut: { status: "unsupported", reason: "video_encode_unsupported" },
      },
      PREPROCESS_TIMEOUT_MS.motion,
      timers,
    ),
});
