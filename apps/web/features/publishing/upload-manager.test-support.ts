import { vi } from "vitest";

import { UploadManager } from "./upload-manager";

import type {
  IdentifiedMotion,
  IdentifiedStill,
  LogicalSource,
} from "./import-grouping";
import type { LocalRecoveryStore } from "./local-recovery";
import type { PreprocessPort } from "./preprocess/worker-client";
import type {
  UploadClientPort,
  UploadManagerOptions,
  UploadSessionBinding,
  UploadTimers,
} from "./upload-manager";
import type {
  TransferCallbacks,
  TransferPort,
  TransferRequest,
} from "./uppy-transfer";
import type {
  MediaComponentRole,
  MediaMetadata,
  PublishingMediaItem,
  RegisterMediaItemCommand,
} from "@moya/contracts";

/** Test doubles at the manager's boundaries: client, transfer, workers, timers. */

export const ACCOUNT = `user-${"a".repeat(32)}`;
export const OTHER_ACCOUNT = `user-${"b".repeat(32)}`;
export const DRAFT_ID = `work-draft-${"d".repeat(32)}`;
export const SESSION_ID = `publishing-session-${"e".repeat(32)}`;

const hex = (value: number) => value.toString(16).padStart(32, "0");

/** Lets queued promise chains and Blob reads (macrotasks in Node) finish. */
export const settle = async () => {
  for (let round = 0; round < 5; round += 1) {
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

export const clientError = (
  status: number,
  message: string,
  outcomeUnknown: boolean,
  code: string | null = null,
) => Object.assign(new Error(message), { status, outcomeUnknown, code });

export const fakeClient = () => {
  let sequence = 0;
  const items = new Map<string, PublishingMediaItem>();
  const update = (
    itemId: string,
    change: (item: PublishingMediaItem) => PublishingMediaItem,
  ) => {
    const next = change(items.get(itemId)!);
    items.set(itemId, next);
    return next;
  };
  const client = {
    registerItem: vi.fn(
      async (cmd: RegisterMediaItemCommand): Promise<PublishingMediaItem> => {
        const id = `media-item-${hex((sequence += 1))}`;
        const item: PublishingMediaItem = {
          id,
          kind: cmd.kind,
          qualityMode: cmd.qualityMode,
          state: "awaiting_upload",
          failureCode: null,
          components: cmd.components.map((component) => ({
            id: `media-component-${hex((sequence += 1))}`,
            role: component.role,
            state: "awaiting" as const,
            byteSize: component.byteSize,
            receivedBytes: 0,
          })),
          presentation: null,
          media: null,
        };
        items.set(id, item);
        return item;
      },
    ),
    item: vi.fn(async (itemId: string) => {
      const item = items.get(itemId);
      if (!item) throw clientError(404, "内容不可用", false);
      return item;
    }),
    cancelItem: vi.fn(async (itemId: string) =>
      update(itemId, (item) => ({
        ...item,
        state: "cancelled",
        components: item.components.map((c) => ({
          ...c,
          state: "cancelled" as const,
        })),
      })),
    ),
    // The Backend's rules (community-postgres media.ts resetComponent): only an
    // item awaiting upload or failed; an awaiting component of a live item is
    // left alone; any other component — received bytes included — is reset.
    resetComponent: vi.fn(async (itemId: string, role: MediaComponentRole) => {
      const current = items.get(itemId);
      if (!current) throw clientError(404, "内容不可用", false);
      if (current.state !== "awaiting_upload" && current.state !== "failed")
        throw clientError(409, "状态已变化，请检查后重试", false);
      const component = current.components.find((c) => c.role === role);
      if (!component) throw clientError(404, "内容不可用", false);
      if (component.state === "awaiting" && current.state !== "failed")
        return current;
      return update(itemId, (item) => ({
        ...item,
        state: "awaiting_upload",
        failureCode: null,
        components: item.components.map((c) =>
          c.role === role
            ? { ...c, state: "awaiting" as const, receivedBytes: 0 }
            : c,
        ),
      }));
    }),
    uploadEndpoint: vi.fn(
      (componentId: string) =>
        `/api/community/publishing/uploads/${componentId}`,
    ),
    uploadHeaders: vi.fn((attempt: string) => ({
      "content-type": "application/octet-stream",
      "x-author-account": ACCOUNT,
      "x-upload-attempt": attempt,
    })),
    uploadResult: vi.fn((status: number, text: string) => {
      if (status >= 200 && status < 300) return JSON.parse(text);
      throw clientError(
        status,
        status === 0
          ? "网络连接中断，结果尚未确认"
          : "暂时无法确认结果，请稍后检查",
        status === 0 || status >= 500,
      );
    }),
  } satisfies UploadClientPort;

  /** Marks one component received on the account and returns the upload answer text. */
  const receive = (itemId: string, role: MediaComponentRole): string => {
    const item = update(itemId, (current) => {
      const components = current.components.map((c) =>
        c.role === role
          ? { ...c, state: "received" as const, receivedBytes: c.byteSize }
          : c,
      );
      return {
        ...current,
        components,
        state: components.every((c) => c.state === "received")
          ? "processing"
          : current.state,
      };
    });
    const component = item.components.find((c) => c.role === role)!;
    return JSON.stringify({
      componentId: component.id,
      sha256: "0".repeat(64),
      receivedBytes: component.byteSize,
      item,
    });
  };

  const makeReady = (itemId: string) =>
    update(itemId, (item) => ({
      ...item,
      state: "ready",
      components: item.components.map((c) => ({
        ...c,
        state: "verified" as const,
      })),
      presentation: { width: 4, height: 3 },
      media: {
        thumbSrc: `/api/community/publishing/media/${itemId}/thumb/base`,
        displaySrc: `/api/community/publishing/media/${itemId}/display/base`,
        ...(item.kind === "live"
          ? {
              motionSrc: `/api/community/publishing/media/${itemId}/motion/base`,
            }
          : {}),
      },
    }));

  /** The account saw an attempt start for this component (it is receiving). */
  const markReceiving = (componentId: string) => {
    for (const [itemId, item] of items)
      if (item.components.some((c) => c.id === componentId))
        update(itemId, (current) => ({
          ...current,
          components: current.components.map((c) =>
            c.id === componentId && c.state === "awaiting"
              ? { ...c, state: "receiving" as const }
              : c,
          ),
        }));
  };

  const failProcessing = (
    itemId: string,
    failureCode: PublishingMediaItem["failureCode"],
  ) =>
    update(itemId, (item) => ({
      ...item,
      state: "failed",
      failureCode,
      components: item.components.map((c) => ({
        ...c,
        state: "verified" as const,
      })),
    }));

  return { client, items, receive, makeReady, markReceiving, failProcessing };
};

export const fakeTransfer = () => {
  const starts: { request: TransferRequest; callbacks: TransferCallbacks }[] =
    [];
  const transfer = {
    start: vi.fn((request: TransferRequest, callbacks: TransferCallbacks) => {
      starts.push({ request, callbacks });
    }),
    abort: vi.fn(),
    dispose: vi.fn(),
  } satisfies TransferPort;
  return { transfer, starts };
};

export const fakePreprocess = () =>
  ({
    still: vi.fn<PreprocessPort["still"]>(async () => ({
      status: "optimized",
      blob: new Blob([new Uint8Array(100)], { type: "image/webp" }),
      contentType: "image/webp",
      width: 4,
      height: 3,
    })),
    motion: vi.fn<PreprocessPort["motion"]>(async () => ({
      status: "optimized",
      blob: new Blob([new Uint8Array(200)], { type: "video/mp4" }),
      contentType: "video/mp4",
      width: 4,
      height: 2,
      durationMs: 2900,
      hasAudio: true,
    })),
  }) satisfies PreprocessPort;

export const manualTimers = () => {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  const timers: UploadTimers = {
    setTimeout: (callback, ms) => {
      const id = next++;
      pending.set(id, { callback, ms });
      return id;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };
  const fireAll = () => {
    const due = [...pending];
    pending.clear();
    for (const [, timer] of due) timer.callback();
  };
  return { timers, pending, fireAll };
};

export const recoveryDouble = () =>
  ({
    save: vi.fn<LocalRecoveryStore["save"]>(async () => true),
    remove: vi.fn<LocalRecoveryStore["remove"]>(async () => undefined),
    list: vi.fn<LocalRecoveryStore["list"]>(async () => []),
    clearDraft: vi.fn<LocalRecoveryStore["clearDraft"]>(async () => undefined),
  }) satisfies LocalRecoveryStore;

let fileCounter = 0;
export const still = (
  overrides: Partial<IdentifiedStill> = {},
): IdentifiedStill => ({
  kind: "still",
  file: new File([new Uint8Array(1000)], `still-${(fileCounter += 1)}`),
  type: "image/jpeg",
  orientation: null,
  contentIdentifier: null,
  appleMakerNote: false,
  motionPhoto: null,
  motionPhotoInvalid: false,
  ...overrides,
});

export const motionFile = (
  identifier: string,
  stillTimeMs: number | null = null,
): IdentifiedMotion => ({
  kind: "motion",
  file: new File([new Uint8Array(3000)], `motion-${(fileCounter += 1)}`),
  type: "video/quicktime",
  contentIdentifier: identifier,
  audioTracks: 1,
  stillTimeMs,
});

export const staticSource = (): LogicalSource => ({
  kind: "static",
  still: still(),
});

export const liveSource = (
  identifier: string,
  stillTimeMs: number | null = null,
): LogicalSource => ({
  kind: "live",
  layout: "pair",
  still: still({
    type: "image/heic",
    contentIdentifier: identifier,
    appleMakerNote: true,
  }),
  motion: motionFile(identifier, stillTimeMs),
});

let requestCounter = 0;
export const uuid = () =>
  `00000000-0000-4000-8000-${String((requestCounter += 1)).padStart(12, "0")}`;

/** Metadata extraction double (exifr is exercised in metadata.test.ts). */
export const absentMetadata = async (): Promise<MediaMetadata> => ({
  provenance: { source: "client", parser: "exifr@7.1.3", status: "absent" },
  values: {},
});

export const createTestManager = (
  overrides: Partial<UploadManagerOptions> & {
    saveMode?: "saved" | "unsaved";
  } = {},
) => {
  const client = fakeClient();
  const transfer = fakeTransfer();
  // A started attempt makes the account's component `receiving`, as the Backend does.
  const start = transfer.transfer.start.getMockImplementation()!;
  transfer.transfer.start.mockImplementation((request, callbacks) => {
    client.markReceiving(request.endpoint.split("/").at(-1)!);
    start(request, callbacks);
  });
  const preprocess = fakePreprocess();
  const timers = manualTimers();
  const recovery = recoveryDouble();
  let account: string | null = ACCOUNT;
  const manager = new UploadManager({
    accountId: ACCOUNT,
    client: client.client,
    transfer: transfer.transfer,
    preprocess,
    currentAccount: () => account,
    requestId: uuid,
    attemptId: uuid,
    preprocessConcurrency: 2,
    transferConcurrency: 2,
    hasher: null,
    recovery,
    metadata: absentMetadata,
    timers: timers.timers,
    now: () => 1,
    ...overrides,
  });
  const saveMode = overrides.saveMode ?? "saved";
  const holder = vi.fn<UploadSessionBinding["resolveHolder"]>(async () =>
    saveMode === "saved" ? { draftId: DRAFT_ID } : { sessionId: SESSION_ID },
  );
  manager.bindSession({ saveMode, resolveHolder: holder });
  return {
    manager,
    client,
    transfer,
    preprocess,
    timers,
    recovery,
    holder,
    setAccount: (next: string | null) => {
      account = next;
    },
    item: (key: string) =>
      manager.getSnapshot().items.find((item) => item.key === key)!,
  };
};
