import { describe, expect, it, vi } from "vitest";

import { identifyFiles } from "./import-grouping";
import {
  IDENTIFIER,
  fileOf,
  jpeg,
  motion,
} from "./parsers/synthetic-media.test-support";
import { PublishingRuntime, SESSION_HEARTBEAT_MS } from "./publishing-runtime";
import {
  ACCOUNT,
  DRAFT_ID,
  OTHER_ACCOUNT,
  SESSION_ID,
  fakeClient,
  fakePreprocess,
  fakeTransfer,
  manualTimers,
  recoveryDouble,
  settle,
  absentMetadata,
  uuid,
} from "./upload-manager.test-support";

import type {
  PublishingClientPort,
  PublishingServices,
} from "./publishing-runtime";
import type { PublishingDraft, WorkDraftContent } from "@moya/contracts";

const stamp = "2026-09-13T12:00:00.000Z";

const draftOf = (content: WorkDraftContent, revision = 1): PublishingDraft => ({
  id: DRAFT_ID,
  kind: "new",
  workId: null,
  baseRevisionId: null,
  revision,
  content,
  mediaItems: [],
  conflict: null,
  deviceClass: "desktop",
  createdAt: stamp,
  updatedAt: stamp,
});

const setup = () => {
  const uploads = fakeClient();
  const transfers: ReturnType<typeof fakeTransfer>[] = [];
  const preprocessors: ReturnType<typeof fakePreprocess>[] = [];
  const recovery = recoveryDouble();
  const timers = manualTimers();
  let account: string | null = null;
  const client = {
    ...uploads.client,
    limits: vi.fn(async () => ({
      maxItems: 2,
      originalItemMaxBytes: 1_000_000,
      standardComponentMaxBytes: 1_000_000,
      titleMax: 200,
      bodyMax: 10_000,
    })),
    createDraft: vi.fn(async (cmd: { content: WorkDraftContent }) =>
      draftOf(cmd.content),
    ),
    saveDraft: vi.fn(
      async (
        _id: string,
        cmd: { content: WorkDraftContent; baseRevision: number },
      ) => ({
        status: "saved" as const,
        draft: draftOf(cmd.content, cmd.baseRevision + 1),
      }),
    ),
    saveDraftNow: vi.fn(),
    draft: vi.fn(),
    submit: vi.fn(async (cmd: { requestId: string }) => ({
      state: "confirmed" as const,
      requestId: cmd.requestId,
      workId: `work-${"9".repeat(32)}`,
      revisionId: `work-revision-${"8".repeat(32)}`,
      visibility: "public" as const,
      submittedAt: stamp,
    })),
    submissionReceipt: vi.fn(async () => null),
    createSession: vi.fn(async () => ({
      id: SESSION_ID,
      state: "active" as const,
      workId: null,
      leaseExpiresAt: stamp,
      createdAt: stamp,
    })),
    heartbeatSession: vi.fn(async () => undefined),
    discardSession: vi.fn(async () => ({ discarded: true as const })),
    deleteDraft: vi.fn(async () => ({
      deleted: true as const,
      snapshots: 2,
      conflictCopies: 0,
      mediaItems: 1,
    })),
  };
  const services: PublishingServices = {
    client: client as unknown as PublishingClientPort,
    currentAccount: () => account,
    requestId: uuid,
    createTransfer: () => {
      const transfer = fakeTransfer();
      transfers.push(transfer);
      return transfer.transfer;
    },
    createPreprocess: () => {
      const preprocess = fakePreprocess();
      preprocessors.push(preprocess);
      return preprocess;
    },
    createHasher: () => null,
    createRecovery: () => recovery,
    identifyFiles: (files) => identifyFiles(files),
    preprocessConcurrency: () => 1,
    transferConcurrency: 2,
    deviceClass: () => "phone",
    timers: timers.timers,
    metadata: absentMetadata,
  };
  const runtime = new PublishingRuntime(services);
  return {
    runtime,
    client,
    uploads,
    transfers,
    preprocessors,
    recovery,
    timers,
    signIn: (next: string | null) => {
      account = next;
      runtime.setAccount(next);
    },
  };
};

const content = (title: string): WorkDraftContent => ({
  title,
  body: "",
  authorship: { kind: "original" },
  visibility: "public",
  items: [],
  coverKey: null,
  coverCrop: null,
});

describe("publishing runtime", () => {
  it("keeps one manager per account and pauses the previous account on a switch", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "unsaved" });
    await test.runtime.stageFiles([fileOf(jpeg({}))], "picker");
    expect(test.runtime.confirmStaging().ok).toBe(true);
    await settle();
    const managerA = test.runtime.manager()!;
    expect(managerA.getSnapshot().items).toHaveLength(1);
    expect(test.transfers[0]!.starts).toHaveLength(1);

    test.signIn(OTHER_ACCOUNT);
    const managerB = test.runtime.manager()!;
    expect(managerB).not.toBe(managerA);
    expect(managerB.getSnapshot().items).toHaveLength(0);
    expect(managerA.getSnapshot()).toMatchObject({
      status: "paused",
      pauseReason: "account",
    });
    expect(test.transfers[0]!.transfer.abort).toHaveBeenCalledOnce();
    expect(test.runtime.store.get()).toMatchObject({
      accountId: OTHER_ACCOUNT,
      session: null,
      staging: null,
    });

    // Back to A: interrupted work waits for the explicit Continue.
    test.signIn(ACCOUNT);
    expect(test.runtime.manager()).toBe(managerA);
    expect(managerA.getSnapshot().status).toBe("paused");
    test.signIn(null);
    expect(test.runtime.manager()).toBeNull();
  });

  it("creates the temporary session only when media needs a holder in no-save mode", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "unsaved" });
    test.runtime.edit(content("只有文字"));
    expect(test.client.createSession).not.toHaveBeenCalled();
    expect(test.client.createDraft).not.toHaveBeenCalled();
    await test.runtime.stageFiles([fileOf(jpeg({}))], "picker");
    test.runtime.confirmStaging();
    await settle();
    expect(test.client.createSession).toHaveBeenCalledOnce();
    expect(test.uploads.client.registerItem.mock.calls[0]![0].holder).toEqual({
      sessionId: SESSION_ID,
    });
    expect(test.recovery.save).not.toHaveBeenCalled();
    await test.runtime.closeSession({ discard: true });
    expect(test.uploads.client.cancelItem).toHaveBeenCalledOnce();
    expect(test.client.discardSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.anything(),
    );
  });

  it("creates the saved draft with pending media entries before registering media", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "saved" });
    await test.runtime.stageFiles([fileOf(jpeg({}))], "picker");
    const confirmed = test.runtime.confirmStaging();
    await settle();
    expect(test.client.createDraft).toHaveBeenCalledOnce();
    const created = test.client.createDraft.mock.calls[0]![0].content;
    expect(created.items).toEqual([
      {
        key: confirmed.ok ? confirmed.confirmed[0]!.key : "",
        itemId: null,
        kind: "static",
        qualityMode: "standard",
        pendingLabel: "photo",
        edit: { rotation: 0, crop: null },
      },
    ]);
    expect(test.uploads.client.registerItem.mock.calls[0]![0].holder).toEqual({
      draftId: DRAFT_ID,
    });
    expect(test.runtime.store.get().session?.draftId).toBe(DRAFT_ID);
    expect(test.recovery.save).toHaveBeenCalledOnce();
  });

  it("enforces the account's item limit in staging with a Live pair counted once", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    await settle();
    test.runtime.startSession({ target: { type: "new" }, saveMode: "unsaved" });
    await test.runtime.stageFiles(
      [
        fileOf(jpeg({ identifier: IDENTIFIER })),
        fileOf(motion({ identifier: IDENTIFIER })),
        fileOf(jpeg({})),
        fileOf(jpeg({})),
      ],
      "picker",
    );
    expect(test.runtime.store.get().staging?.count).toMatchObject({
      ready: 3,
      maxItems: 2,
      overBy: 1,
    });
    expect(test.runtime.confirmStaging()).toEqual({
      ok: false,
      error: "items_limit",
    });
    const last = test.runtime.store.get().staging!.batch.entries.at(-1)!;
    expect(test.runtime.removeStaged(last.key)).toBeNull();
    expect(test.runtime.confirmStaging().ok).toBe(true);
  });

  it("switches a saved draft to no-save only through the targeted deletion", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({
      target: { type: "draft", id: DRAFT_ID },
      saveMode: "saved",
      draft: draftOf(content("草稿")),
    });
    const result = await test.runtime.disableSaving();
    expect(test.client.deleteDraft).toHaveBeenCalledWith(
      DRAFT_ID,
      expect.anything(),
    );
    expect(result).toMatchObject({ deleted: true, snapshots: 2 });
    expect(test.recovery.clearDraft).toHaveBeenCalledWith(ACCOUNT, DRAFT_ID);
    expect(test.runtime.store.get().session).toMatchObject({
      saveMode: "unsaved",
      draftId: null,
    });
    expect(test.runtime.autosave()).toBeNull();
  });

  it("submits once with the session holder and the edit's base revision", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "saved" });
    test.runtime.edit(content("题"));
    const state = await test.runtime.submit(content("题"));
    expect(state?.status).toBe("confirmed");
    expect(test.client.submit).toHaveBeenCalledOnce();
    expect(test.client.submit.mock.calls[0]![0]).toMatchObject({
      holder: { draftId: DRAFT_ID },
      baseRevisionId: null,
    });
  });

  it("keeps a session while anything would be lost on leaving, and ends it only when nothing would", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "unsaved" });
    await test.runtime.stageFiles([fileOf(jpeg({}))], "picker");
    test.runtime.confirmStaging();
    await settle();
    expect(await test.runtime.closeSession({ discard: false })).toBe("kept");
    const manager = test.runtime.manager()!;
    // A paused upload is still unfinished work: the session and the progress entry stay.
    manager.pause("offline");
    expect(await test.runtime.closeSession({ discard: false })).toBe("kept");
    await manager.continueUploads();
    await settle();
    const itemId = manager.getSnapshot().items[0]!.itemId!;
    test.transfers[0]!.starts.at(-1)!.callbacks.onSettled({
      status: 200,
      responseText: test.uploads.receive(itemId, "still"),
      stalled: false,
    });
    await settle();
    test.uploads.makeReady(itemId);
    test.timers.fireAll();
    await settle();
    expect(manager.getSnapshot().items[0]!.phase).toBe("ready");
    // No-save content exists nowhere else: a plain leave keeps it.
    expect(await test.runtime.closeSession({ discard: false })).toBe("kept");
    expect(test.uploads.client.cancelItem).not.toHaveBeenCalled();
    expect(await test.runtime.closeSession({ discard: true })).toBe("ended");
    expect(test.runtime.store.get().session).toBeNull();
    expect(manager.getSnapshot().items).toEqual([]);
    expect(test.uploads.client.cancelItem).toHaveBeenCalledOnce();
    expect(test.client.discardSession).toHaveBeenCalledOnce();

    // A saved-mode item that failed (nothing in flight) still needs the author.
    test.runtime.startSession({ target: { type: "new" }, saveMode: "saved" });
    const failing = test.runtime.manager()!;
    await test.runtime.stageFiles([fileOf(jpeg({}))], "picker");
    const preprocess = test.preprocessors.at(-1)!;
    preprocess.still.mockResolvedValueOnce({
      status: "failed",
      reason: "decode_failed",
    });
    test.runtime.confirmStaging();
    await settle();
    expect(failing.getSnapshot().items[0]!.phase).toBe("failed");
    expect(await test.runtime.closeSession({ discard: false })).toBe("kept");
    expect(await test.runtime.closeSession({ discard: true })).toBe("ended");

    // A saved draft that is saved and fully ready ends on leaving, without any account write.
    test.runtime.startSession({
      target: { type: "draft", id: DRAFT_ID },
      saveMode: "saved",
      draft: draftOf(content("已保存")),
    });
    expect(await test.runtime.closeSession({ discard: false })).toBe("ended");
    expect(test.client.deleteDraft).not.toHaveBeenCalled();
  });

  it("discards a temporary session that was still being created when the author discards", async () => {
    const test = setup();
    let created!: () => void;
    const create = test.client.createSession.getMockImplementation()!;
    test.client.createSession.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          created = () => resolve(create());
        }),
    );
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "unsaved" });
    await test.runtime.stageFiles([fileOf(jpeg({}))], "picker");
    test.runtime.confirmStaging();
    await settle();
    expect(test.client.createSession).toHaveBeenCalledOnce();
    const closing = test.runtime.closeSession({ discard: true });
    await settle();
    created();
    expect(await closing).toBe("ended");
    expect(test.client.discardSession).toHaveBeenCalledWith(
      SESSION_ID,
      expect.anything(),
    );
    expect(test.uploads.client.registerItem).not.toHaveBeenCalled();
  });

  it("never sends one account's pending draft save under another account", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "saved" });
    test.runtime.edit(content("A 的草稿"));
    test.signIn(OTHER_ACCOUNT);
    test.timers.fireAll();
    await settle();
    expect(test.client.createDraft).not.toHaveBeenCalled();
    test.signIn(ACCOUNT);
    test.timers.fireAll();
    await settle();
    expect(test.client.createDraft).toHaveBeenCalledOnce();
    expect(test.client.createDraft.mock.calls[0]![0].content.title).toBe(
      "A 的草稿",
    );
  });

  it("restarts the temporary session heartbeat when its account returns", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "unsaved" });
    await test.runtime.stageFiles([fileOf(jpeg({}))], "picker");
    test.runtime.confirmStaging();
    await settle();
    const heartbeats = () =>
      [...test.timers.pending.values()].filter(
        (timer) => timer.ms === SESSION_HEARTBEAT_MS,
      ).length;
    expect(heartbeats()).toBe(1);
    test.signIn(OTHER_ACCOUNT);
    expect(heartbeats()).toBe(0);
    test.signIn(ACCOUNT);
    expect(heartbeats()).toBe(1);
  });

  it("deletes the draft a first save was still creating when saving is switched off", async () => {
    const test = setup();
    let finish!: () => void;
    test.client.createDraft.mockImplementationOnce(
      (cmd: { content: WorkDraftContent }) =>
        new Promise((resolve) => {
          finish = () => resolve(draftOf(cmd.content));
        }),
    );
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "saved" });
    test.runtime.edit(content("第一稿"));
    test.timers.fireAll();
    await settle();
    expect(test.client.createDraft).toHaveBeenCalledOnce();
    const switching = test.runtime.disableSaving();
    await settle();
    expect(test.client.deleteDraft).not.toHaveBeenCalled();
    finish();
    await switching;
    expect(test.client.deleteDraft).toHaveBeenCalledWith(
      DRAFT_ID,
      expect.anything(),
    );
    expect(test.runtime.store.get().session).toMatchObject({
      saveMode: "unsaved",
      draftId: null,
    });
    test.timers.fireAll();
    await settle();
    expect(test.client.saveDraft).not.toHaveBeenCalled();
  });

  it("saves registered item ids into the draft without the editor merging them", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "saved" });
    test.runtime.edit(content("有图"));
    await test.runtime.stageFiles([fileOf(jpeg({}))], "picker");
    test.runtime.confirmStaging();
    await settle();
    const itemId = test.runtime.manager()!.getSnapshot().items[0]!.itemId!;
    expect(itemId).toMatch(/^media-item-/u);
    test.timers.fireAll();
    await settle();
    const saved = test.client.saveDraft.mock.calls.at(-1)![1].content;
    expect(saved.items).toEqual([expect.objectContaining({ itemId })]);
    expect(saved.items[0]).not.toHaveProperty("pendingLabel");
    // A later editor edit without the id keeps it.
    test.runtime.edit({
      ...content("有图，改标题"),
      items: [{ ...saved.items[0]!, itemId: null, pendingLabel: "photo" }],
    });
    test.timers.fireAll();
    await settle();
    expect(
      test.client.saveDraft.mock.calls.at(-1)![1].content.items[0],
    ).toEqual(expect.objectContaining({ itemId }));
  });

  it("completes the session on a confirmed submission: no later draft write, the receipt stays readable", async () => {
    const test = setup();
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "saved" });
    test.runtime.edit(content("题"));
    test.timers.fireAll();
    await settle();
    test.runtime.edit(content("题（改）"));
    const state = await test.runtime.submit(content("题（改）"));
    expect(state?.status).toBe("confirmed");
    expect(test.runtime.store.get().session).toBeNull();
    expect(test.runtime.submission()?.store.get().status).toBe("confirmed");
    const saves = test.client.saveDraft.mock.calls.length;
    test.timers.fireAll();
    await settle();
    expect(test.client.saveDraft).toHaveBeenCalledTimes(saves);
    expect(await test.runtime.closeSession({ discard: false })).toBe("none");
    expect(test.recovery.clearDraft).toHaveBeenCalledWith(ACCOUNT, DRAFT_ID);
  });

  it("shows a submit that failed before sending in the submission state", async () => {
    const test = setup();
    test.client.createDraft.mockRejectedValueOnce(
      Object.assign(new Error("草稿数量已达上限"), {
        status: 409,
        code: "draft_limit",
        outcomeUnknown: false,
      }),
    );
    test.signIn(ACCOUNT);
    test.runtime.startSession({ target: { type: "new" }, saveMode: "saved" });
    test.runtime.edit(content("题"));
    const state = await test.runtime.submit(content("题"));
    expect(state).toEqual({
      status: "failed",
      code: "draft_limit",
      message: "草稿数量已达上限",
    });
    expect(test.runtime.submission()?.store.get()).toEqual(state);
    expect(test.client.submit).not.toHaveBeenCalled();
  });
});
