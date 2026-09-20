import { act } from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

import type {
  PublishingDraft,
  PublishingDraftConflict,
  PublishingDraftSummary,
  PublishingMediaItem,
  PublishingSnapshot,
  WorkDraftContent,
} from "@moya/contracts";
import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const hex = (n: number) => n.toString(16).padStart(32, "0");
export const draftId = (n: number) => `work-draft-${hex(n)}`;
export const snapshotId = (n: number) => `work-snapshot-${hex(n)}`;
export const workId = (n: number) => `work-${hex(n)}`;
export const itemId = (n: number) => `media-item-${hex(n)}`;
export const ACCOUNT = `user-${"a".repeat(32)}`;

/** A fixed clock for every time label in these tests. */
export const NOW = new Date("2026-09-13T12:00:00.000Z");
export const minutesAgo = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();
export const daysFromNow = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

export const content = (
  overrides: Partial<WorkDraftContent> = {},
): WorkDraftContent => ({
  title: "",
  body: "",
  authorship: { kind: "original" },
  visibility: "public",
  items: [],
  coverKey: null,
  coverCrop: null,
  ...overrides,
});

export const summary = (
  n: number,
  overrides: Partial<PublishingDraftSummary> = {},
): PublishingDraftSummary => ({
  id: draftId(n),
  kind: "new",
  workId: null,
  title: "",
  excerpt: "",
  coverSrc: null,
  itemCount: 0,
  missingLocalCount: 0,
  deviceClass: "phone",
  updatedAt: minutesAgo(n),
  ...overrides,
});

export const snapshot = (
  n: number,
  overrides: Partial<PublishingSnapshot> = {},
): PublishingSnapshot => ({
  id: snapshotId(n),
  kind: "saved",
  draftId: draftId(1),
  workId: null,
  sourceRevision: n,
  pinned: false,
  createdAt: minutesAgo(n * 10),
  content: content(),
  ...overrides,
});

export const readyItem = (n: number): PublishingMediaItem => ({
  id: itemId(n),
  kind: "static",
  qualityMode: "standard",
  state: "ready",
  failureCode: null,
  components: [],
  presentation: { width: 100, height: 100 },
  media: {
    thumbSrc: `/api/community/publishing/media/${itemId(n)}/thumb/base`,
    displaySrc: `/api/community/publishing/media/${itemId(n)}/display/base`,
  },
});

export const draft = (
  overrides: Partial<PublishingDraft> = {},
): PublishingDraft => ({
  id: draftId(1),
  kind: "new",
  workId: null,
  baseRevisionId: null,
  revision: 3,
  content: content({ title: "恢复后的标题" }),
  mediaItems: [],
  conflict: null,
  deviceClass: "phone",
  createdAt: minutesAgo(600),
  updatedAt: NOW.toISOString(),
  ...overrides,
});

export const conflict = (
  overrides: Partial<PublishingDraftConflict> = {},
): PublishingDraftConflict => ({
  id: draftId(9),
  device: {
    content: content({ title: "手机上的标题", body: "手机正文" }),
    baseRevision: 2,
    deviceClass: "phone",
    savedAt: minutesAgo(3),
  },
  account: {
    content: content({ title: "电脑上的标题", body: "电脑正文" }),
    revision: 3,
    deviceClass: "desktop",
    updatedAt: minutesAgo(5),
  },
  createdAt: minutesAgo(3),
  ...overrides,
});

export const page = <T>(items: readonly T[], total = items.length) => ({
  items: [...items],
  total,
  page: 1,
  pageSize: 20,
  totalPages: Math.ceil(total / 20),
});

/** jsdom has no modal dialog: the AuthorDialog only needs open/close. */
export const installDialogPolyfill = () => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    }),
  });
};

const roots: Root[] = [];

export const render = async (element: ReactNode) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(element));
  return container;
};

export const cleanup = async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
};

/** Lets pending promises (client answers) settle inside act. */
export const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

export const buttonByText = (
  scope: ParentNode,
  text: string,
): HTMLButtonElement => {
  const match = Array.from(scope.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === text,
  );
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
};

export const click = async (element: HTMLElement) => {
  await act(async () => element.click());
};

/** The parts of `useUploadSession()` the drafts surfaces read. */
export interface FakeUploadSession {
  readonly accountId: string | null;
  readonly session: {
    readonly saveMode: "saved" | "unsaved";
    readonly draftId: string | null;
  } | null;
  readonly autosave: {
    readonly status: string;
    readonly draftId: string | null;
  } | null;
  readonly hasUnsavedChanges: () => boolean;
  readonly saveNow: () => Promise<void>;
  readonly forgetDraftLocalCopies: (draftId: string) => Promise<void>;
  readonly countLocalDraftItems: (draftId: string) => Promise<number>;
}

const idleSession = (): FakeUploadSession => ({
  accountId: ACCOUNT,
  session: null,
  autosave: null,
  hasUnsavedChanges: vi.fn(() => false),
  saveNow: vi.fn(async () => undefined),
  forgetDraftLocalCopies: vi.fn(async () => undefined),
  countLocalDraftItems: vi.fn(async () => 0),
});

/**
 * A controllable stand-in for the publishing provider's upload session.
 * Test files mock `useUploadSession` with
 * `useSyncExternalStore(uploadSession.subscribe, uploadSession.get)`.
 */
export const uploadSession = (() => {
  let value = idleSession();
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next: Partial<FakeUploadSession>) => {
      value = { ...value, ...next };
      for (const listener of listeners) listener();
    },
    reset: () => {
      value = idleSession();
    },
  };
})();

/** An open saved-draft session editing `id`. */
export const editingDraft = (
  id: string,
  status = "saved",
): Pick<FakeUploadSession, "session" | "autosave"> => ({
  session: { saveMode: "saved", draftId: id },
  autosave: { status, draftId: id },
});
