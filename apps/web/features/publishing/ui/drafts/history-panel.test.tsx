// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { client } = vi.hoisted(() => ({
  client: { draftHistory: vi.fn(), restoreSnapshot: vi.fn() },
}));
vi.mock("../../publishing-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../publishing-data")>()),
  publishingClient: client,
}));
vi.mock("../../publishing-provider", async () => {
  const { useSyncExternalStore } = await import("react");
  const { uploadSession } = await import("./drafts.test-support");
  return {
    useUploadSession: () =>
      useSyncExternalStore(uploadSession.subscribe, uploadSession.get),
  };
});

import { act } from "react";

import { PublishingRequestError } from "../../publishing-data";
import { HistoryPanel } from "./history-panel";
import {
  NOW,
  buttonByText,
  cleanup,
  click,
  content,
  draft,
  draftId,
  editingDraft,
  flush,
  installDialogPolyfill,
  itemId,
  minutesAgo,
  page,
  render,
  snapshot,
  uploadSession,
} from "./drafts.test-support";

const rows = (node: HTMLElement) =>
  Array.from(node.querySelectorAll<HTMLLIElement>("li[data-snapshot-id]"));

const renderPanel = async (prepareRestore?: () => Promise<boolean>) => {
  const onRestored = vi.fn();
  const onClose = vi.fn();
  const node = await render(
    <HistoryPanel
      draftId={draftId(1)}
      onClose={onClose}
      onRestored={onRestored}
      {...(prepareRestore === undefined ? {} : { prepareRestore })}
    />,
  );
  await flush();
  return { node, onRestored, onClose };
};

const item = (key: string, n: number) => ({
  key,
  itemId: itemId(n),
  kind: "static" as const,
  qualityMode: "standard" as const,
  edit: { rotation: 0 as const, crop: null },
});

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  installDialogPolyfill();
  window.history.replaceState({ kind: "editor" }, "", "/#editor");
});
afterEach(async () => {
  window.history.replaceState({ kind: "editor" }, "", "/#editor");
  await cleanup();
  uploadSession.reset();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("History panel", () => {
  it("shows snapshots newest first with kind labels and a preview", async () => {
    client.draftHistory.mockResolvedValue(
      page([
        // Deliberately out of order: the panel still shows newest first.
        snapshot(3, {
          kind: "legacy_draft",
          createdAt: minutesAgo(60 * 24 * 2),
          content: content({ title: "旧稿" }),
        }),
        snapshot(1, {
          kind: "published",
          createdAt: minutesAgo(5),
          content: content({
            title: "",
            body: "  第一行\n第二行  ",
            items: [item("a", 1), item("b", 2)],
            coverKey: "b",
          }),
        }),
        snapshot(2, {
          kind: "conflict",
          pinned: true,
          createdAt: minutesAgo(90),
          content: content({ title: "另一台设备" }),
        }),
        snapshot(4, { kind: "submitted", createdAt: minutesAgo(60 * 24 * 3) }),
        snapshot(5, { kind: "saved", createdAt: minutesAgo(60 * 24 * 4) }),
      ]),
    );
    const { node } = await renderPanel();
    expect(client.draftHistory).toHaveBeenCalledWith(
      draftId(1),
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal),
    );
    const list = rows(node);
    expect(
      list.map((row) => row.querySelector("[data-snapshot-kind]")?.textContent),
    ).toEqual(["已发布", "冲突副本", "早期草稿", "已提交", "已保存"]);
    const [newest, conflict] = list;
    expect(newest?.querySelector("h3")?.textContent).toBe("未命名作品");
    expect(newest?.textContent).toContain("第一行\n第二行");
    expect(newest?.textContent).toContain("2 项图片");
    expect(newest?.textContent).toContain("5 分钟前");
    expect(conflict?.querySelector("h3")?.textContent).toBe("另一台设备");
    expect(conflict?.textContent).toContain("无图片");
  });

  it("restores a snapshot through the client and hands the draft back", async () => {
    client.draftHistory.mockResolvedValue(
      page([snapshot(1), snapshot(2, { kind: "submitted" })]),
    );
    const restored = draft({ revision: 7 });
    client.restoreSnapshot.mockResolvedValue(restored);
    const { node, onRestored } = await renderPanel();
    const target = rows(node).find(
      (row) => row.dataset.snapshotId === snapshot(2).id,
    )!;
    await click(buttonByText(target, "恢复为当前编辑"));
    await flush();
    expect(client.restoreSnapshot).toHaveBeenCalledExactlyOnceWith(draftId(1), {
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      snapshotId: snapshot(2).id,
    });
    expect(onRestored).toHaveBeenCalledExactlyOnceWith(restored);
    expect(node.querySelector('[role="status"]')?.textContent).toBe(
      "已恢复为当前编辑，之前保存的内容保留在历史版本中",
    );
    expect(node.textContent).toContain("账号中已保存的内容会保留在历史版本中");
  });

  it("saves the open editor's pending input before restoring", async () => {
    let unsaved = true;
    const saveNow = vi.fn(async () => {
      unsaved = false;
    });
    uploadSession.set({
      ...editingDraft(draftId(1), "pending"),
      hasUnsavedChanges: () => unsaved,
      saveNow,
    });
    client.draftHistory.mockResolvedValue(page([snapshot(1)]));
    client.restoreSnapshot.mockResolvedValue(draft());
    const { node, onRestored } = await renderPanel();
    await click(buttonByText(rows(node)[0]!, "恢复为当前编辑"));
    await flush();
    expect(saveNow).toHaveBeenCalledOnce();
    expect(client.restoreSnapshot).toHaveBeenCalledOnce();
    expect(saveNow.mock.invocationCallOrder[0]).toBeLessThan(
      client.restoreSnapshot.mock.invocationCallOrder[0]!,
    );
    expect(onRestored).toHaveBeenCalledOnce();
  });

  it("never restores over input the account does not have", async () => {
    const saveNow = vi.fn(async () => {
      uploadSession.set({ autosave: { status: "error", draftId: draftId(1) } });
    });
    uploadSession.set({
      ...editingDraft(draftId(1), "pending"),
      hasUnsavedChanges: () => true,
      saveNow,
    });
    client.draftHistory.mockResolvedValue(page([snapshot(1)]));
    const { node, onRestored } = await renderPanel();
    const target = rows(node)[0]!;
    const button = buttonByText(target, "恢复为当前编辑");
    button.focus();
    await click(button);
    await flush();
    expect(saveNow).toHaveBeenCalledOnce();
    expect(client.restoreSnapshot).not.toHaveBeenCalled();
    expect(onRestored).not.toHaveBeenCalled();
    expect(target.querySelector('[role="alert"]')?.textContent).toBe(
      "当前编辑还有未保存的更改，保存完成后才能恢复",
    );
    // The pressed button kept focus and can be pressed again.
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-disabled")).toBeNull();
  });

  it("leaves another draft's session alone", async () => {
    const saveNow = vi.fn(async () => undefined);
    uploadSession.set({
      ...editingDraft(draftId(2), "pending"),
      hasUnsavedChanges: () => true,
      saveNow,
    });
    client.draftHistory.mockResolvedValue(page([snapshot(1)]));
    client.restoreSnapshot.mockResolvedValue(draft());
    const { node } = await renderPanel();
    await click(buttonByText(rows(node)[0]!, "恢复为当前编辑"));
    await flush();
    expect(saveNow).not.toHaveBeenCalled();
    expect(client.restoreSnapshot).toHaveBeenCalledOnce();
  });

  it("uses the editor's own preparation when it provides one", async () => {
    const prepare = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    client.draftHistory.mockResolvedValue(page([snapshot(1)]));
    client.restoreSnapshot.mockResolvedValue(draft());
    const { node, onRestored } = await renderPanel(prepare);
    const target = rows(node)[0]!;
    await click(buttonByText(target, "恢复为当前编辑"));
    await flush();
    expect(client.restoreSnapshot).not.toHaveBeenCalled();
    expect(target.querySelector('[role="alert"]')?.textContent).toBe(
      "当前编辑还有未保存的更改，保存完成后才能恢复",
    );
    await click(buttonByText(target, "恢复为当前编辑"));
    await flush();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(client.restoreSnapshot).toHaveBeenCalledOnce();
    expect(onRestored).toHaveBeenCalledOnce();
  });

  it("closes when a conflict arrives, so the chooser never opens on top of it", async () => {
    uploadSession.set(editingDraft(draftId(1), "saving"));
    client.draftHistory.mockResolvedValue(page([snapshot(1)]));
    const { onClose } = await renderPanel();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () =>
      uploadSession.set({
        autosave: { status: "conflict", draftId: draftId(1) },
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays open over a conflict that was already there and asks for a version first", async () => {
    uploadSession.set({
      ...editingDraft(draftId(1), "conflict"),
      hasUnsavedChanges: () => true,
    });
    client.draftHistory.mockResolvedValue(page([snapshot(1)]));
    const { node, onClose } = await renderPanel();
    const target = rows(node)[0]!;
    await click(buttonByText(target, "恢复为当前编辑"));
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(client.restoreSnapshot).not.toHaveBeenCalled();
    expect(target.querySelector('[role="alert"]')?.textContent).toBe(
      "这份草稿有两个版本待选择，请先选择要继续编辑的版本",
    );
  });

  it("retries the page that failed to load", async () => {
    client.draftHistory
      .mockResolvedValueOnce(page([snapshot(1)]))
      .mockRejectedValueOnce(
        new PublishingRequestError(0, "网络连接中断，请检查后重试"),
      )
      .mockResolvedValueOnce(
        page([snapshot(0, { kind: "restored" }), snapshot(1)]),
      );
    client.restoreSnapshot.mockResolvedValue(draft());
    const { node } = await renderPanel();
    await click(buttonByText(rows(node)[0]!, "恢复为当前编辑"));
    await flush();
    const alert = node.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("网络连接中断");
    await click(buttonByText(alert as HTMLElement, "重试"));
    await flush();
    expect(client.draftHistory.mock.calls.map((call) => call[1])).toEqual([
      { page: 1, pageSize: 20 },
      { page: 1, pageSize: 20 },
      { page: 1, pageSize: 20 },
    ]);
    expect(rows(node)[0]?.textContent).toContain("已恢复");
  });

  it("shows a refused restore at that snapshot without calling back", async () => {
    client.draftHistory.mockResolvedValue(page([snapshot(1)]));
    client.restoreSnapshot.mockRejectedValue(
      new PublishingRequestError(409, "状态已变化，请检查后重试"),
    );
    const { node, onRestored } = await renderPanel();
    const target = rows(node)[0]!;
    await click(buttonByText(target, "恢复为当前编辑"));
    await flush();
    expect(target.querySelector('[role="alert"]')?.textContent).toBe(
      "状态已变化，请检查后重试",
    );
    expect(onRestored).not.toHaveBeenCalled();
    expect(buttonByText(target, "恢复为当前编辑").disabled).toBe(false);
  });

  it("says when there is no history yet", async () => {
    client.draftHistory.mockResolvedValue(page([]));
    const { node } = await renderPanel();
    expect(node.textContent).toContain("暂无历史版本");
  });
});
