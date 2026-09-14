import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";

/**
 * Component byte transfer through Uppy core + XHRUpload (U04–U06, §8.1):
 * raw POST bodies (`formData: false`), one Uppy file per component attempt
 * with its own endpoint and headers, bounded concurrency, Uppy's timeout off
 * (`timeout: 0`) and retries off (`shouldRetry: () => false`). Stall
 * detection is ours and is reported as a failure, never retried. Every
 * settled file is removed at once, because Uppy's `upload()` retries files
 * still in an error state.
 */

export interface TransferRequest {
  /** Unique per attempt; never contains a file name. */
  readonly id: string;
  readonly endpoint: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Blob;
}

export interface TransferOutcome {
  /** HTTP status, or 0 when the request failed without an answer. */
  readonly status: number;
  readonly responseText: string;
  /** True when our stall detection ended the transfer. */
  readonly stalled: boolean;
}

export interface TransferCallbacks {
  onProgress(bytesSent: number, bytesTotal: number): void;
  onSettled(outcome: TransferOutcome): void;
}

export interface TransferPort {
  start(request: TransferRequest, callbacks: TransferCallbacks): void;
  /** Aborts a transfer; its callbacks are never called afterwards. */
  abort(id: string): void;
  dispose(): void;
}

export interface TransferTimers {
  readonly setTimeout: (callback: () => void, ms: number) => unknown;
  readonly clearTimeout: (handle: unknown) => void;
}

export const TRANSFER_TIMING = {
  /** No upload progress for this long while bytes remain: stalled. */
  stallMs: 45_000,
  /** After the last byte, the relay answers within 60 s; this is the outer guard. */
  answerMs: 150_000,
} as const;

interface TransferMeta extends Record<string, unknown> {
  transferId: string;
  endpoint: string;
  headers: Record<string, string>;
}

interface ResponseBody extends Record<string, unknown> {
  status: number;
  responseText: string;
}

const silentLogger = { debug: () => {}, warn: () => {}, error: () => {} };

export const createUppyTransfer = (
  concurrency: number,
  timers: TransferTimers = {
    setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimeout: (handle) =>
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): TransferPort => {
  const uppy = new Uppy<TransferMeta, ResponseBody>({
    autoProceed: false,
    allowMultipleUploadBatches: true,
    logger: silentLogger,
    restrictions: {
      maxFileSize: null,
      minFileSize: null,
      maxTotalFileSize: null,
      maxNumberOfFiles: null,
      minNumberOfFiles: null,
      allowedFileTypes: null,
      requiredMetaFields: [],
    },
  });
  uppy.use(XHRUpload<TransferMeta, ResponseBody>, {
    method: "post",
    formData: false,
    bundle: false,
    limit: concurrency,
    timeout: 0,
    shouldRetry: () => false,
    allowedMetaFields: false,
    withCredentials: false,
    endpoint: (file) =>
      Array.isArray(file) ? "" : (file.meta as TransferMeta).endpoint,
    headers: (file) => ({ ...(file.meta as TransferMeta).headers }),
    getResponseData: (xhr) => ({
      status: xhr.status,
      responseText: xhr.responseText,
    }),
  });

  const active = new Map<
    string,
    {
      fileId: string;
      callbacks: TransferCallbacks;
      timer: unknown;
      total: number;
      sent: number;
    }
  >();

  const byFileId = (fileId: string) => {
    for (const [id, entry] of active)
      if (entry.fileId === fileId) return [id, entry] as const;
    return null;
  };

  /**
   * Core's own listeners have already recorded the result when ours run, so
   * the file is removed synchronously: a later `upload()` never sees it.
   */
  const remove = (fileId: string) => {
    if (uppy.getFile(fileId)) uppy.removeFile(fileId);
  };

  const armTimer = (id: string) => {
    const entry = active.get(id);
    if (!entry) return;
    timers.clearTimeout(entry.timer);
    const waitingForAnswer = entry.sent >= entry.total;
    entry.timer = timers.setTimeout(
      () => {
        const current = active.get(id);
        if (!current) return;
        active.delete(id);
        remove(current.fileId);
        current.callbacks.onSettled({
          status: 0,
          responseText: "",
          stalled: true,
        });
      },
      waitingForAnswer ? TRANSFER_TIMING.answerMs : TRANSFER_TIMING.stallMs,
    );
  };

  const settle = (fileId: string, outcome: TransferOutcome) => {
    const found = byFileId(fileId);
    remove(fileId);
    if (!found) return;
    const [id, entry] = found;
    timers.clearTimeout(entry.timer);
    active.delete(id);
    entry.callbacks.onSettled(outcome);
  };

  uppy.on("upload-progress", (file, progress) => {
    if (!file) return;
    const found = byFileId(file.id);
    if (!found) return;
    const [id, entry] = found;
    const sent = Math.min(
      entry.total,
      Math.max(0, progress.bytesUploaded ?? 0),
    );
    if (sent > entry.sent) {
      entry.sent = sent;
      entry.callbacks.onProgress(sent, entry.total);
    }
    armTimer(id);
  });
  uppy.on("upload-success", (file, response) => {
    if (!file) return;
    const body = response.body as ResponseBody | undefined;
    settle(file.id, {
      status: body?.status ?? response.status,
      responseText: body?.responseText ?? "",
      stalled: false,
    });
  });
  uppy.on("upload-error", (file, _error, response) => {
    if (!file) return;
    const xhr = response as unknown as
      { status?: number; responseText?: string } | undefined;
    settle(file.id, {
      status: typeof xhr?.status === "number" ? xhr.status : 0,
      responseText:
        typeof xhr?.responseText === "string" ? xhr.responseText : "",
      stalled: false,
    });
  });

  return {
    start(request, callbacks) {
      const fileId = uppy.addFile({
        // A synthetic name: raw file names never enter the transfer layer.
        name: request.id,
        type: "application/octet-stream",
        data: request.body,
        meta: {
          transferId: request.id,
          endpoint: request.endpoint,
          headers: { ...request.headers },
        },
      });
      active.set(request.id, {
        fileId,
        callbacks,
        timer: null,
        total: request.body.size,
        sent: 0,
      });
      armTimer(request.id);
      uppy.upload().catch(() => undefined);
    },
    abort(id) {
      const entry = active.get(id);
      if (!entry) return;
      timers.clearTimeout(entry.timer);
      active.delete(id);
      remove(entry.fileId);
    },
    dispose() {
      for (const entry of active.values()) timers.clearTimeout(entry.timer);
      active.clear();
      uppy.destroy();
    },
  };
};
