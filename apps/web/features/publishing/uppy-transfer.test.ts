// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TRANSFER_TIMING, createUppyTransfer } from "./uppy-transfer";

import type { TransferOutcome, TransferTimers } from "./uppy-transfer";

/** The XHR boundary: records every real send so retries would be visible. */
class FakeXhr {
  static sends: FakeXhr[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 0;
  statusText = "";
  responseText = "";
  responseType = "";
  response: unknown = null;
  withCredentials = false;
  aborted = false;
  upload: {
    onprogress:
      | ((event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.sends.push(this);
  }
  abort() {
    this.aborted = true;
  }
  answer(status: number, text: string) {
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
  fail() {
    this.status = 0;
    this.onerror?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
}

const flush = async () => {
  for (let index = 0; index < 10; index += 1)
    await vi.advanceTimersByTimeAsync(0);
};

const manualTimers = () => {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  const timers: TransferTimers = {
    setTimeout: (callback, ms) => {
      const id = next++;
      pending.set(id, { callback, ms });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };
  const fire = (ms: number) => {
    for (const [id, timer] of [...pending]) {
      if (timer.ms !== ms) continue;
      pending.delete(id);
      timer.callback();
    }
  };
  return { timers, fire, pending };
};

const request = (id: string, size = 32) => ({
  id,
  endpoint: `/api/community/publishing/uploads/media-component-${id.padStart(32, "0")}`,
  headers: {
    "content-type": "application/octet-stream",
    "x-author-account": `user-${"a".repeat(32)}`,
    "x-upload-attempt": "0f8fad5b-d9cb-469f-a165-70867728950e",
  },
  body: new Blob([new Uint8Array(size)]),
});

describe("Uppy component transfer", () => {
  const original = globalThis.XMLHttpRequest;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeXhr.sends = [];
    globalThis.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  });
  afterEach(async () => {
    // Uppy schedules its initial online check for 3s and does not cancel it
    // in destroy(). Execute pending library timers before jsdom is torn down;
    // errors still fail here instead of leaking into an unrelated test file.
    try {
      await vi.runAllTimersAsync();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      globalThis.XMLHttpRequest = original;
    }
  });

  it("posts the raw component bytes to its own endpoint with its own headers", async () => {
    const { timers } = manualTimers();
    const transfer = createUppyTransfer(2, timers);
    const settled = vi.fn<(outcome: TransferOutcome) => void>();
    const progress = vi.fn();
    const first = request("1");
    transfer.start(first, { onProgress: progress, onSettled: settled });
    await flush();
    expect(FakeXhr.sends).toHaveLength(1);
    const xhr = FakeXhr.sends[0]!;
    expect(xhr.method.toLowerCase()).toBe("post");
    expect(xhr.url).toBe(first.endpoint);
    expect(xhr.body).toBe(first.body);
    expect(xhr.headers).toMatchObject(first.headers);
    xhr.progress(16, 32);
    expect(progress).toHaveBeenCalledWith(16, 32);
    xhr.answer(200, '{"ok":true}');
    await flush();
    expect(settled).toHaveBeenCalledWith({
      status: 200,
      responseText: '{"ok":true}',
      stalled: false,
    });
    transfer.dispose();
  });

  it("never retries a failed request, not even when another upload starts", async () => {
    const { timers } = manualTimers();
    const transfer = createUppyTransfer(2, timers);
    const failed = vi.fn();
    transfer.start(request("2"), { onProgress: vi.fn(), onSettled: failed });
    await flush();
    FakeXhr.sends[0]!.fail();
    await flush();
    await vi.advanceTimersByTimeAsync(700);
    expect(failed).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0]![0]).toMatchObject({
      status: 0,
      stalled: false,
    });
    expect(FakeXhr.sends).toHaveLength(1);

    const serverError = vi.fn();
    transfer.start(request("3"), {
      onProgress: vi.fn(),
      onSettled: serverError,
    });
    await flush();
    expect(FakeXhr.sends).toHaveLength(2);
    expect(FakeXhr.sends[1]!.url).toContain("0003");
    FakeXhr.sends[1]!.answer(503, "");
    await flush();
    await vi.advanceTimersByTimeAsync(700);
    expect(serverError).toHaveBeenCalledWith({
      status: 503,
      responseText: "",
      stalled: false,
    });
    expect(FakeXhr.sends).toHaveLength(2);
    transfer.dispose();
  });

  it("aborts without reporting and ends a stalled transfer as a failure", async () => {
    const { timers, fire } = manualTimers();
    const transfer = createUppyTransfer(2, timers);
    const aborted = vi.fn();
    transfer.start(request("4"), { onProgress: vi.fn(), onSettled: aborted });
    await flush();
    transfer.abort("4");
    await flush();
    expect(FakeXhr.sends[0]!.aborted).toBe(true);
    expect(aborted).not.toHaveBeenCalled();

    const stalled = vi.fn();
    transfer.start(request("5"), { onProgress: vi.fn(), onSettled: stalled });
    await flush();
    fire(TRANSFER_TIMING.stallMs);
    await flush();
    expect(stalled).toHaveBeenCalledWith({
      status: 0,
      responseText: "",
      stalled: true,
    });
    expect(FakeXhr.sends[1]!.aborted).toBe(true);
    expect(FakeXhr.sends).toHaveLength(2);
    transfer.dispose();
  });
});
