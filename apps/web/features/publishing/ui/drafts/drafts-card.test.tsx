// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { client, author, entry } = vi.hoisted(() => ({
  client: { listDrafts: vi.fn(), deleteDraft: vi.fn() },
  author: {
    cache: new Map<string, unknown>(),
    revision: 1,
    notify: vi.fn(),
  },
  entry: { checking: false, openEditor: vi.fn() },
}));
vi.mock("../../publishing-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../publishing-data")>()),
  publishingClient: client,
}));
vi.mock("../../../authors/author-context", () => ({
  useAuthors: () => author,
}));
vi.mock("../../publishing-provider", async () => {
  const { useSyncExternalStore } = await import("react");
  const { uploadSession } = await import("./drafts.test-support");
  return {
    useUploadSession: () =>
      useSyncExternalStore(uploadSession.subscribe, uploadSession.get),
  };
});
vi.mock("../../publishing-entry", () => ({
  usePublishingEntry: () => entry,
}));

import { PublishingRequestError } from "../../publishing-data";
import { DraftsCard } from "./drafts-card";
import {
  ACCOUNT,
  buttonByText,
  cleanup,
  flush,
  installDialogPolyfill,
  page,
  render,
  summary,
} from "./drafts.test-support";

const card = () => document.querySelector<HTMLElement>("[data-drafts-card]")!;
const openButton = () =>
  card().querySelector<HTMLButtonElement>("button[aria-haspopup]")!;

beforeEach(() => {
  installDialogPolyfill();
  author.cache.clear();
  author.revision = 1;
  entry.openEditor.mockReturnValue(true);
  window.history.replaceState({ kind: "profile" }, "", "/#profile");
});
afterEach(async () => {
  window.history.replaceState({ kind: "profile" }, "", "/#profile");
  await cleanup();
  vi.clearAllMocks();
});

describe("Drafts card", () => {
  it("shows the account's true draft count from the first page total", async () => {
    let answer: (value: unknown) => void = () => undefined;
    client.listDrafts.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    await render(<DraftsCard accountId={ACCOUNT} active />);
    expect(card().textContent).toContain("正在读取…");
    expect(card().textContent).not.toContain("暂无草稿");
    await act(async () =>
      answer(page([summary(1, { title: "春日", excerpt: "正文开头" })], 3)),
    );
    await flush();
    expect(client.listDrafts).toHaveBeenCalledWith(
      { page: 1, pageSize: 1 },
      expect.any(AbortSignal),
    );
    expect(card().dataset.draftsCount).toBe("3");
    expect(card().querySelector("h3")?.textContent).toBe("草稿");
    expect(card().textContent).toContain("3 份草稿");
    expect(openButton().getAttribute("aria-label")).toBe("草稿，3 份草稿");
  });

  it("says 暂无草稿 at zero, and never turns a failed read into zero", async () => {
    client.listDrafts.mockResolvedValueOnce(page([]));
    await render(<DraftsCard accountId={ACCOUNT} active />);
    await flush();
    expect(card().dataset.draftsCount).toBe("0");
    expect(card().textContent).toContain("暂无草稿");
    await cleanup();

    author.cache.clear();
    client.listDrafts.mockRejectedValueOnce(
      new PublishingRequestError(0, "网络连接中断，请检查后重试"),
    );
    await render(<DraftsCard accountId={ACCOUNT} active />);
    await flush();
    expect(card().dataset.draftsCount).toBeUndefined();
    expect(card().textContent).toContain("暂时无法读取");
    expect(card().textContent).not.toContain("暂无草稿");
  });

  it("never keeps showing a remembered count once a refresh fails", async () => {
    client.listDrafts.mockResolvedValueOnce(page([]));
    await render(<DraftsCard accountId={ACCOUNT} active />);
    await flush();
    expect(card().textContent).toContain("暂无草稿");
    await cleanup();

    // Back on the profile after the editor made a draft; the read fails.
    client.listDrafts.mockRejectedValueOnce(
      new PublishingRequestError(0, "网络连接中断，请检查后重试"),
    );
    await render(<DraftsCard accountId={ACCOUNT} active />);
    await flush();
    expect(card().dataset.draftsCount).toBeUndefined();
    expect(card().textContent).toContain("暂时无法读取");
    expect(card().textContent).not.toContain("暂无草稿");
  });

  it("does not read drafts while the Works tab is not the visible panel", async () => {
    client.listDrafts.mockResolvedValue(page([], 0));
    await render(<DraftsCard accountId={ACCOUNT} active={false} />);
    await flush();
    expect(client.listDrafts).not.toHaveBeenCalled();
  });

  it("keeps the count in step with deletions in the picker", async () => {
    client.listDrafts
      .mockResolvedValueOnce(page([summary(1)], 2))
      .mockResolvedValueOnce(page([summary(1), summary(2)], 2));
    client.deleteDraft.mockResolvedValue({
      deleted: true,
      snapshots: 0,
      conflictCopies: 0,
      mediaItems: 0,
    });
    await render(<DraftsCard accountId={ACCOUNT} active />);
    await flush();
    await act(async () => openButton().click());
    await flush();
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    const row = dialog.querySelector<HTMLElement>(
      `li[data-draft-id="${summary(1).id}"]`,
    )!;
    await act(async () => buttonByText(row, "删除").click());
    await act(async () => buttonByText(row, "删除草稿").click());
    await flush();
    expect(card().dataset.draftsCount).toBe("1");
    expect(card().textContent).toContain("1 份草稿");
  });

  it("closes the picker and opens the editor on the draft once the dialog's history entry is gone", async () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {
      // The browser pops the dialog's entry back to the profile entry.
      window.history.replaceState({ kind: "profile" }, "", "/#profile");
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { kind: "profile" } }),
      );
    });
    const markerAtOpen: unknown[] = [];
    entry.openEditor.mockImplementation(() => {
      markerAtOpen.push(window.history.state?.phase4Dialog);
      return true;
    });
    client.listDrafts
      .mockResolvedValueOnce(page([summary(1)], 1))
      .mockResolvedValueOnce(page([summary(7, { title: "夏" })], 1));
    await render(<DraftsCard accountId={ACCOUNT} active />);
    await flush();
    await act(async () => openButton().click());
    await flush();
    expect(window.history.state?.phase4Dialog).toBeTruthy();
    const dialog = document.querySelector("dialog")!;
    await act(async () => buttonByText(dialog, "继续编辑").click());
    await flush();
    await vi.waitFor(() => expect(entry.openEditor).toHaveBeenCalled());
    expect(document.querySelector("dialog")).toBeNull();
    expect(entry.openEditor).toHaveBeenCalledExactlyOnceWith(
      { type: "draft", id: summary(7).id },
      openButton(),
    );
    // The editor entry never inherits the picker's history marker.
    expect(markerAtOpen).toEqual([undefined]);
  });
});
