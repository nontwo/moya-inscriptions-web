// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkActions } from "admin/community-bulk-actions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const operations = () =>
  ["first", "second", "third"].map((id) => ({
    id,
    label: id,
    name: "recommend-user" as const,
    input: { id, enabled: true, expectedVersion: 0 },
  }));
const answer = () =>
  new Response(JSON.stringify({ ok: true, result: { version: 1 } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("Owner selected-item commands", () => {
  it("retries only the unknown item with its original request identity", async () => {
    const requests: unknown[] = [];
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        if (requests.length === 2)
          throw new TypeError("Synthetic lost response");
        return answer();
      });
    const completed = vi.fn(async () => {});
    const view = render(
      createElement(BulkActions, {
        count: 3,
        disabled: false,
        choices: [{ value: "enable", label: "批量推荐" }],
        prepare: operations,
        onBusy: vi.fn(),
        onComplete: completed,
      }),
    );
    fireEvent.click(view.getByText("批量推荐"));
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(view.getByText("first：已完成")).toBeTruthy();
    expect(view.getByText("third：已完成")).toBeTruthy();
    fireEvent.click(view.getByText("重试未确认的 1 项"));
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(2));
    expect(requests[3]).toEqual(requests[1]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not repeat a definite conflict and requires confirmation before hiding", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, error: { code: "STATE_CONFLICT" } }),
          { status: 409 },
        ),
      );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const completed = vi.fn(async () => {});
    const view = render(
      createElement(BulkActions, {
        count: 1,
        disabled: false,
        choices: [{ value: "hide", label: "批量隐藏", confirm: true }],
        prepare: () => operations().slice(0, 1),
        onBusy: vi.fn(),
        onComplete: completed,
      }),
    );
    fireEvent.click(view.getByText("批量隐藏"));
    expect(fetcher).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(view.getByText("批量隐藏"));
    await waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(fetcher).toHaveBeenCalledOnce();
    expect(view.queryByText(/重试未确认/)).toBeNull();
    expect(view.getByRole("status").textContent).toContain("该项状态已变化");
  });
});
