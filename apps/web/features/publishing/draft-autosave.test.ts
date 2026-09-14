import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDraftAutosave, isEmptyDraftContent } from "./draft-autosave";

import type { DraftAutosavePort } from "./draft-autosave";
import type {
  PublishingDraft,
  PublishingDraftConflict,
  PublishingDraftSaveResult,
  SavePublishingDraftCommand,
  WorkDraftContent,
} from "@moya/contracts";

const draftId = `work-draft-${"1".repeat(32)}`;
const stamp = "2026-09-13T12:00:00.000Z";

const content = (title: string, body = ""): WorkDraftContent => ({
  title,
  body,
  authorship: { kind: "original" },
  visibility: "public",
  items: [],
  coverKey: null,
  coverCrop: null,
});

const draft = (
  revision: number,
  value: WorkDraftContent,
  conflict: PublishingDraftConflict | null = null,
): PublishingDraft => ({
  id: draftId,
  kind: "new",
  workId: null,
  baseRevisionId: null,
  revision,
  content: value,
  mediaItems: [],
  conflict,
  deviceClass: "desktop",
  createdAt: stamp,
  updatedAt: stamp,
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}
const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const lost = Object.assign(new Error("网络连接中断，结果尚未确认"), {
  status: 0,
  outcomeUnknown: true,
  code: null,
});

const port = () => {
  let revision = 1;
  const saves: SavePublishingDraftCommand[] = [];
  const api = {
    createDraft: vi.fn<DraftAutosavePort["createDraft"]>(async (cmd) =>
      draft(1, cmd.content),
    ),
    saveDraft: vi.fn<DraftAutosavePort["saveDraft"]>(async (_id, cmd) => {
      saves.push(cmd);
      revision += 1;
      return { status: "saved", draft: draft(revision, cmd.content) };
    }),
    saveDraftNow: vi.fn<DraftAutosavePort["saveDraftNow"]>(async (_id, cmd) => {
      revision += 1;
      return { status: "saved", draft: draft(revision, cmd.content) };
    }),
    draft: vi.fn<DraftAutosavePort["draft"]>(async () =>
      draft(revision, content("server")),
    ),
  };
  return { api, saves };
};

let ids = 0;
const requestId = () =>
  `00000000-0000-4000-8000-${String((ids += 1)).padStart(12, "0")}`;

describe("draft autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("creates no draft for empty or whitespace-only content", async () => {
    const { api } = port();
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: "phone",
    });
    autosave.edit(content("   ", "\n\t"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.createDraft).not.toHaveBeenCalled();
    expect(isEmptyDraftContent(content(" "))).toBe(true);
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

  it("creates the draft on first real content about 2 s after the last edit", async () => {
    const { api } = port();
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: "phone",
    });
    autosave.edit(content("墨"));
    await vi.advanceTimersByTimeAsync(1500);
    autosave.edit(content("墨迹"));
    await vi.advanceTimersByTimeAsync(1999);
    expect(api.createDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.createDraft).toHaveBeenCalledOnce();
    expect(api.createDraft.mock.calls[0]![0]).toMatchObject({
      content: content("墨迹"),
      deviceClass: "phone",
    });
    expect(autosave.store.get()).toMatchObject({
      status: "saved",
      draftId,
      revision: 1,
    });
  });

  it("coalesces edits made during an in-flight save into one follow-up with the newest input", async () => {
    const { api, saves } = port();
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: null,
      draft: draft(1, content("a")),
    });
    const first = deferred<PublishingDraftSaveResult>();
    api.saveDraft.mockImplementationOnce(async (_id, cmd) => {
      saves.push(cmd);
      return first.promise;
    });
    autosave.edit(content("b"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    autosave.edit(content("c"));
    await vi.advanceTimersByTimeAsync(2000);
    autosave.edit(content("d"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    first.resolve({ status: "saved", draft: draft(2, content("b")) });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveDraft).toHaveBeenCalledTimes(2);
    expect(saves.map((cmd) => cmd.content.title)).toEqual(["b", "d"]);
    expect(saves[1]!.baseRevision).toBe(2);
  });

  it("advances only the saved marker and never clears newer input", async () => {
    const { api } = port();
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: null,
      draft: draft(1, content("a")),
    });
    const pending = deferred<PublishingDraftSaveResult>();
    api.saveDraft.mockImplementationOnce(async () => pending.promise);
    autosave.edit(content("sent"));
    await vi.advanceTimersByTimeAsync(2000);
    autosave.edit(content("newer"));
    pending.resolve({ status: "saved", draft: draft(2, content("sent")) });
    await vi.advanceTimersByTimeAsync(0);
    const state = autosave.store.get();
    expect(state.savedVersion).toBe(1);
    expect(state.editVersion).toBe(2);
    expect(autosave.hasUnsavedChanges()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.saveDraft.mock.calls.at(-1)![1].content.title).toBe("newer");
    expect(autosave.hasUnsavedChanges()).toBe(false);
  });

  it("surfaces both versions on conflict and stops autosaving until a choice", async () => {
    const { api } = port();
    const conflict: PublishingDraftConflict = {
      id: `work-draft-${"2".repeat(32)}`,
      device: {
        content: content("this device"),
        baseRevision: 1,
        deviceClass: "phone",
        savedAt: stamp,
      },
      account: {
        content: content("account"),
        revision: 3,
        deviceClass: "desktop",
        updatedAt: stamp,
      },
      createdAt: stamp,
    };
    api.saveDraft.mockResolvedValueOnce({
      status: "conflict",
      draft: draft(3, content("account"), conflict),
      conflict,
    });
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: "phone",
      draft: draft(1, content("a")),
    });
    autosave.edit(content("this device"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosave.store.get()).toMatchObject({
      status: "conflict",
      conflict,
    });
    autosave.edit(content("still typing"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.saveDraft).toHaveBeenCalledTimes(1);
    expect(autosave.hasUnsavedChanges()).toBe(true);
    autosave.adoptDraft(
      draft(4, content("still typing")),
      content("still typing"),
    );
    expect(autosave.store.get()).toMatchObject({
      status: "saved",
      revision: 4,
    });
  });

  it("uses the snapshot endpoint for Save now", async () => {
    const { api } = port();
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: null,
      draft: draft(1, content("a")),
    });
    autosave.edit(content("b"));
    await autosave.saveNow();
    expect(api.saveDraftNow).toHaveBeenCalledOnce();
    expect(api.saveDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.saveDraft).not.toHaveBeenCalled();
  });

  it("reconciles a lost save by reading the draft and never retries by itself", async () => {
    const { api } = port();
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: null,
      draft: draft(1, content("a")),
    });
    api.saveDraft.mockRejectedValueOnce(lost);
    api.draft.mockResolvedValueOnce(draft(2, content("b")));
    autosave.edit(content("b"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.draft).toHaveBeenCalledOnce();
    expect(autosave.store.get()).toMatchObject({
      status: "saved",
      revision: 2,
    });

    api.saveDraft.mockRejectedValueOnce(lost);
    api.draft.mockResolvedValueOnce(draft(2, content("b")));
    autosave.edit(content("c"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosave.store.get().status).toBe("error");
    const calls = api.saveDraft.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.saveDraft).toHaveBeenCalledTimes(calls);
    await autosave.retry();
    expect(api.saveDraft).toHaveBeenCalledTimes(calls + 1);
    expect(autosave.store.get().status).toBe("saved");
  });

  it("never sends for another account: a pending save waits for the account to return", async () => {
    const { api } = port();
    let current: string | null = "user-a";
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: null,
      accountId: "user-a",
      currentAccount: () => current,
    });
    autosave.edit(content("A 的文字"));
    await vi.advanceTimersByTimeAsync(1000);
    current = "user-b";
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.createDraft).not.toHaveBeenCalled();
    // Even an explicit Save now is not sent under the other account.
    await autosave.saveNow();
    expect(api.createDraft).not.toHaveBeenCalled();
    expect(api.saveDraftNow).not.toHaveBeenCalled();
    expect(autosave.hasUnsavedChanges()).toBe(true);

    current = "user-a";
    autosave.resume();
    await vi.advanceTimersByTimeAsync(2000);
    expect(api.createDraft).toHaveBeenCalledOnce();
    expect(autosave.store.get().status).toBe("saved");
  });

  it("reconciles a save lost to an account change only after that account returns", async () => {
    const { api } = port();
    let current: string | null = "user-a";
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: null,
      draft: draft(1, content("a")),
      accountId: "user-a",
      currentAccount: () => current,
    });
    const pending = deferred<PublishingDraftSaveResult>();
    api.saveDraft.mockImplementationOnce(async () => pending.promise);
    autosave.edit(content("b"));
    await vi.advanceTimersByTimeAsync(2000);
    autosave.suspend();
    current = "user-b";
    pending.reject(
      Object.assign(new Error("账户状态已变化，请刷新后检查操作结果"), {
        status: 401,
        outcomeUnknown: true,
        code: null,
      }),
    );
    await vi.advanceTimersByTimeAsync(10_000);
    expect(api.draft).not.toHaveBeenCalled();
    expect(api.saveDraft).toHaveBeenCalledOnce();

    current = "user-a";
    api.draft.mockResolvedValueOnce(draft(2, content("b")));
    autosave.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(api.draft).toHaveBeenCalledOnce();
    expect(autosave.store.get()).toMatchObject({
      status: "saved",
      revision: 2,
    });
    expect(api.saveDraft).toHaveBeenCalledOnce();
  });

  it("keeps the create request identity when its outcome is unknown", async () => {
    const { api } = port();
    api.createDraft.mockRejectedValueOnce(lost);
    const autosave = createDraftAutosave({
      port: api,
      requestId,
      deviceClass: null,
    });
    autosave.edit(content("first"));
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosave.store.get().status).toBe("error");
    await autosave.retry();
    expect(api.createDraft).toHaveBeenCalledTimes(2);
    expect(api.createDraft.mock.calls[1]![0].requestId).toBe(
      api.createDraft.mock.calls[0]![0].requestId,
    );
  });
});
