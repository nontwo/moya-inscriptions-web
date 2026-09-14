import { describe, expect, it, vi } from "vitest";

import { PREPROCESS_TIMEOUT_MS, createWorkerPreprocess } from "./worker-client";

import type { StaticPreprocessRequest } from "./static-image";
import type { WorkerTimers } from "./worker-client";

/** A dedicated-worker double at the postMessage boundary. */
const fakeWorker = () => {
  const worker = {
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
    onmessageerror: null as ((event: MessageEvent<unknown>) => void) | null,
    onerror: null as ((event: ErrorEvent) => void) | null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  return worker;
};

const timers = () => {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  const port: WorkerTimers = {
    setTimeout: (callback, ms) => {
      pending.set(next, { callback, ms });
      return next++;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };
  return { port, pending };
};

const request: StaticPreprocessRequest = {
  file: new Blob([new Uint8Array(4)], { type: "image/jpeg" }),
  sourceType: "image/jpeg",
  exifOrientation: null,
  headerDimensions: null,
  mayHaveAlpha: false,
};

const setup = () => {
  const workers: ReturnType<typeof fakeWorker>[] = [];
  const spawn = () => {
    const worker = fakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  };
  const clock = timers();
  const port = createWorkerPreprocess(spawn, spawn, clock.port);
  return { workers, clock, port };
};

describe("preprocessing worker client", () => {
  it("answers the worker's result and terminates it", async () => {
    const test = setup();
    const answer = test.port.still(request, new AbortController().signal);
    test.workers[0]!.onmessage!({
      data: {
        ok: true,
        result: {
          status: "retained",
          contentType: "image/jpeg",
          width: 1,
          height: 1,
        },
      },
    } as MessageEvent<unknown>);
    await expect(answer).resolves.toMatchObject({ status: "retained" });
    expect(test.workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(test.clock.pending.size).toBe(0);
  });

  it("frees the slot when a silently killed worker never answers (explicit choice)", async () => {
    const test = setup();
    const still = test.port.still(request, new AbortController().signal);
    const motion = test.port.motion(new Blob([]), new AbortController().signal);
    expect([...test.clock.pending.values()].map((timer) => timer.ms)).toEqual([
      PREPROCESS_TIMEOUT_MS.still,
      PREPROCESS_TIMEOUT_MS.motion,
    ]);
    for (const timer of test.clock.pending.values()) timer.callback();
    await expect(still).resolves.toEqual({
      status: "unsupported",
      reason: "encode_unsupported",
    });
    await expect(motion).resolves.toEqual({
      status: "unsupported",
      reason: "video_encode_unsupported",
    });
    expect(test.workers.every((w) => w.terminate.mock.calls.length === 1)).toBe(
      true,
    );
    // A late answer after the budget changes nothing.
    test.workers[0]!.onmessage!({
      data: { ok: true, result: {} },
    } as MessageEvent<unknown>);
    expect(test.workers[0]!.terminate).toHaveBeenCalledOnce();
  });

  it("fails on an unreadable message and rejects on abort", async () => {
    const test = setup();
    const unreadable = test.port.motion(
      new Blob([]),
      new AbortController().signal,
    );
    test.workers[0]!.onmessageerror!({} as MessageEvent<unknown>);
    await expect(unreadable).resolves.toEqual({
      status: "failed",
      reason: "processing_failed",
    });
    const controller = new AbortController();
    const aborted = test.port.still(request, controller.signal);
    controller.abort(new DOMException("cancelled", "AbortError"));
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    expect(test.workers[1]!.terminate).toHaveBeenCalledOnce();
    expect(test.clock.pending.size).toBe(0);
  });
});
