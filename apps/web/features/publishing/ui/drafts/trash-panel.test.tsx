// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { client } = vi.hoisted(() => ({
  client: { listTrash: vi.fn(), restoreWork: vi.fn() },
}));
vi.mock("../../publishing-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../publishing-data")>()),
  publishingClient: client,
}));

import { PublishingRequestError } from "../../publishing-data";
import { TrashPanel } from "./trash-panel";
import {
  NOW,
  buttonByText,
  cleanup,
  click,
  daysFromNow,
  flush,
  installDialogPolyfill,
  page,
  render,
  trashed,
  workId,
} from "./drafts.test-support";

const rows = (node: HTMLElement) =>
  Array.from(node.querySelectorAll<HTMLLIElement>("li[data-work-id]"));

const renderPanel = async () => {
  const onRestored = vi.fn();
  const node = await render(
    <TrashPanel onClose={vi.fn()} onRestored={onRestored} />,
  );
  await flush();
  return { node, onRestored };
};

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  installDialogPolyfill();
  window.history.replaceState({ kind: "profile" }, "", "/#profile");
});
afterEach(async () => {
  window.history.replaceState({ kind: "profile" }, "", "/#profile");
  await cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Recycle bin", () => {
  it("shows the days left from each purge time on a fixed clock", async () => {
    client.listTrash.mockResolvedValue(
      page([
        trashed(1, { purgeAfter: daysFromNow(30) }),
        trashed(2, { purgeAfter: daysFromNow(0.25), title: "" }),
      ]),
    );
    const { node } = await renderPanel();
    expect(client.listTrash).toHaveBeenCalledWith(
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal),
    );
    const [first, second] = rows(node);
    expect(first?.querySelector("[data-trash-note]")?.textContent).toBe(
      "剩余 30 天，到期后永久删除",
    );
    expect(second?.querySelector("h3")?.textContent).toBe("未命名作品");
    expect(second?.querySelector("[data-trash-note]")?.textContent).toBe(
      "剩余 1 天，到期后永久删除",
    );
    expect(buttonByText(first!, "恢复（仅自己可见）").disabled).toBe(false);
  });

  it("never offers restore for an Admin-removed work", async () => {
    client.listTrash.mockResolvedValue(
      page([trashed(3, { restorable: false, purgeAfter: daysFromNow(12) })]),
    );
    const { node } = await renderPanel();
    const row = rows(node)[0]!;
    expect(row.dataset.trashState).toBe("removed");
    expect(row.querySelector("[data-trash-note]")?.textContent).toBe(
      "已被移除，无法恢复",
    );
    const restore = buttonByText(row, "恢复（仅自己可见）");
    expect(restore.disabled).toBe(true);
    await click(restore);
    expect(row.querySelector('[role="alertdialog"]')).toBeNull();
    expect(client.restoreWork).not.toHaveBeenCalled();
  });

  it("does not claim a removal in the last day, when the purge may already be due", async () => {
    client.listTrash.mockResolvedValue(
      page([
        trashed(6, { restorable: false, purgeAfter: daysFromNow(0.5) }),
        trashed(7, { restorable: false, purgeAfter: daysFromNow(-0.1) }),
      ]),
    );
    const { node } = await renderPanel();
    const [lastDay, due] = rows(node);
    expect(lastDay?.dataset.trashState).toBe("unavailable");
    expect(lastDay?.querySelector("[data-trash-note]")?.textContent).toBe(
      "无法恢复",
    );
    expect(buttonByText(lastDay!, "恢复（仅自己可见）").disabled).toBe(true);
    expect(due?.querySelector("[data-trash-note]")?.textContent).toBe(
      "保留期已满，正在永久删除",
    );
    expect(node.textContent).not.toContain("已被移除");
  });

  it("retries the read that failed", async () => {
    client.listTrash
      .mockRejectedValueOnce(
        new PublishingRequestError(0, "网络连接中断，请检查后重试"),
      )
      .mockResolvedValueOnce(page([trashed(8)]));
    const { node } = await renderPanel();
    const alert = node.querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert.textContent).toContain("网络连接中断");
    await click(buttonByText(alert, "重试"));
    await flush();
    expect(client.listTrash.mock.calls.map((call) => call[0])).toEqual([
      { page: 1, pageSize: 20 },
      { page: 1, pageSize: 20 },
    ]);
    expect(rows(node)).toHaveLength(1);
  });

  it("restores as self-only only after confirmation", async () => {
    client.listTrash.mockResolvedValue(
      page([trashed(4, { title: "秋山" }), trashed(5)]),
    );
    client.restoreWork.mockResolvedValue({
      workId: workId(4),
      visibility: "self",
    });
    const { node, onRestored } = await renderPanel();
    const row = rows(node)[0]!;
    await click(buttonByText(row, "恢复（仅自己可见）"));
    expect(client.restoreWork).not.toHaveBeenCalled();
    const confirm = row.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(
      document.getElementById(confirm.getAttribute("aria-labelledby")!)
        ?.textContent,
    ).toBe("恢复「秋山」？");
    expect(
      document.getElementById(confirm.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toContain("仅自己可见");
    await click(buttonByText(confirm, "恢复"));
    await flush();
    expect(client.restoreWork).toHaveBeenCalledExactlyOnceWith(workId(4), {
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(onRestored).toHaveBeenCalledExactlyOnceWith(workId(4));
    expect(rows(node).map((item) => item.dataset.workId)).toEqual([workId(5)]);
    expect(node.querySelector('[role="status"]')?.textContent).toContain(
      "已恢复「秋山」，目前仅自己可见",
    );
    expect(document.activeElement).toBe(node.querySelector("ul"));
  });

  it("moves focus to the empty state after the last work is restored", async () => {
    client.listTrash.mockResolvedValue(page([trashed(9)]));
    client.restoreWork.mockResolvedValue({
      workId: workId(9),
      visibility: "self",
    });
    const { node } = await renderPanel();
    const row = rows(node)[0]!;
    await click(buttonByText(row, "恢复（仅自己可见）"));
    await click(buttonByText(row, "恢复"));
    await flush();
    expect(rows(node)).toHaveLength(0);
    expect(document.activeElement?.textContent).toBe("回收站是空的");
  });

  it("shows the empty state", async () => {
    client.listTrash.mockResolvedValue(page([]));
    const { node } = await renderPanel();
    expect(node.textContent).toContain("回收站是空的");
    expect(rows(node)).toHaveLength(0);
  });
});
