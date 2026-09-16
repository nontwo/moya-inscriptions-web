// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BulkActions, planWorkOperations } from "admin/community-bulk-actions";

import type { SelectedOperation } from "admin/community-bulk-actions";
import type { OperatorWork } from "@moya/contracts/internal/community-operator";
import type { ReactNode } from "react";

// The Payload modal is replaced by an always-rendered stand-in: the body and
// the confirm button are visible, and the open/close calls are observed. The
// package is reachable only from the Admin workspace, so the mock names the
// file the component resolves.
const modal = await vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const { realpathSync } = await import("node:fs");
  const { join } = await import("node:path");
  // Under jsdom import.meta.url is an http URL; the directory stays a path.
  const adminRequire = createRequire(
    join(import.meta.dirname, "../../../apps/admin/"),
  );
  return {
    payloadUi: realpathSync(adminRequire.resolve("@payloadcms/ui")),
    open: vi.fn(),
    close: vi.fn(),
  };
});
vi.mock(modal.payloadUi, () => ({
  useModal: () => ({ openModal: modal.open, closeModal: modal.close }),
  ConfirmationModal: ({
    modalSlug,
    heading,
    body,
    confirmLabel,
    onConfirm,
  }: {
    modalSlug: string;
    heading: ReactNode;
    body: ReactNode;
    confirmLabel?: string;
    onConfirm: () => Promise<void> | void;
  }) =>
    createElement(
      "div",
      { "data-modal": modalSlug },
      createElement("p", null, heading),
      body,
      createElement(
        "button",
        { type: "button", onClick: () => void onConfirm() },
        confirmLabel,
      ),
    ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  modal.open.mockClear();
  modal.close.mockClear();
});

const operations = (): SelectedOperation[] =>
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
const bulk = (
  overrides: Partial<Parameters<typeof BulkActions>[0]> = {},
): Parameters<typeof BulkActions>[0] => ({
  view: "works",
  count: 3,
  disabled: false,
  choices: [{ value: "enable", label: "批量推荐" }],
  prepare: operations,
  onBusy: vi.fn(),
  onComplete: vi.fn(async () => {}),
  ...overrides,
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
    const pending = vi.fn();
    const view = render(
      createElement(
        BulkActions,
        bulk({ onComplete: completed, onPending: pending }),
      ),
    );
    fireEvent.click(view.getByText("批量推荐"));
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(view.getByText("first：已完成")).toBeTruthy();
    expect(view.getByText("third：已完成")).toBeTruthy();
    // The owning view learns about the unconfirmed item before the reload.
    expect(pending).toHaveBeenCalledWith(1);
    expect(pending.mock.invocationCallOrder[0]).toBeLessThan(
      completed.mock.invocationCallOrder[0]!,
    );
    expect(view.getByText("未确认 1 项")).toBeTruthy();
    expect(view.queryByText(/已选择/)).toBeNull();
    expect((view.getByText("批量推荐") as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(view.getByText("重试未确认的 1 项"));
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(2));
    expect(requests[3]).toEqual(requests[1]);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(pending).toHaveBeenLastCalledWith(0);
    expect(view.getByText("已选择 3 项（当前页）")).toBeTruthy();
  });

  it("abandons unconfirmed items explicitly, clearing the results and releasing the owner", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Synthetic lost response"));
    const completed = vi.fn(async () => {});
    const pending = vi.fn();
    const view = render(
      createElement(
        BulkActions,
        bulk({
          count: 1,
          prepare: () => operations().slice(0, 1),
          onComplete: completed,
          onPending: pending,
        }),
      ),
    );
    fireEvent.click(view.getByText("批量推荐"));
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(pending).toHaveBeenLastCalledWith(1);
    expect(view.getByText("重试未确认的 1 项")).toBeTruthy();
    fireEvent.click(view.getByText("放弃未确认项"));
    expect(pending).toHaveBeenLastCalledWith(0);
    await waitFor(() => expect(completed).toHaveBeenCalledTimes(2));
    expect(view.queryByText(/重试未确认/)).toBeNull();
    expect(view.queryByText(/放弃未确认项/)).toBeNull();
    expect(view.queryByRole("status")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a definite conflict and confirms a restricting action through the modal", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, error: { code: "STATE_CONFLICT" } }),
          { status: 409 },
        ),
      );
    const completed = vi.fn(async () => {});
    const view = render(
      createElement(
        BulkActions,
        bulk({
          view: "works",
          count: 1,
          choices: [
            { value: "hidden", label: "批量隐藏", confirm: "限制访问。" },
          ],
          prepare: () => operations().slice(0, 1),
          onComplete: completed,
        }),
      ),
    );
    fireEvent.click(view.getByText("批量隐藏"));
    expect(fetcher).not.toHaveBeenCalled();
    expect(modal.open).toHaveBeenCalledWith("community-bulk-confirm-works");
    const dialog = view.container.querySelector(
      '[data-modal="community-bulk-confirm-works"]',
    );
    expect(dialog?.textContent).toContain("批量隐藏所选 1 项。限制访问。");
    fireEvent.click(view.getByText("确认执行"));
    expect(modal.close).toHaveBeenCalledWith("community-bulk-confirm-works");
    await waitFor(() => expect(completed).toHaveBeenCalledOnce());
    expect(fetcher).toHaveBeenCalledOnce();
    expect(view.queryByText(/重试未确认/)).toBeNull();
    expect(view.getByRole("status").textContent).toContain("该项状态已变化");
  });

  it("lists the rows an action left alone with their reasons", () => {
    const view = render(
      createElement(
        BulkActions,
        bulk({ skipped: ["甲：未公开，不能推荐", "乙：已是该状态，未处理"] }),
      ),
    );
    const lines = [...view.getByRole("status").querySelectorAll("li")].map(
      (li) => li.textContent,
    );
    expect(lines).toEqual(["甲：未公开，不能推荐", "乙：已是该状态，未处理"]);
  });
});

describe("Selected-work command planning", () => {
  const work = (
    n: number,
    overrides: Partial<OperatorWork> = {},
  ): OperatorWork => ({
    id: `work-${String(n).repeat(32)}`,
    title: `作品${n}`,
    text: "",
    authorId: `user-${"a".repeat(32)}`,
    authorName: "作者",
    authorStatus: "active",
    state: "visible",
    authorDeleted: false,
    version: 4,
    firstPublishedAt: "2026-09-01T00:00:00.000Z",
    latestSubmission: null,
    publicRevisionId: null,
    publiclyVisible: true,
    recommendation: { enabled: false, version: 0, position: 0, source: "none" },
    ...overrides,
  });
  const all = (works: readonly OperatorWork[]) =>
    new Set(works.map((w) => w.id));

  it("features only public works and starts a new explicit recommendation at position 0", () => {
    const works = [
      work(1),
      work(2, { publiclyVisible: false, title: "" }),
      work(3, {
        recommendation: {
          enabled: false,
          version: 2,
          position: 7,
          source: "work",
        },
      }),
      work(4, {
        recommendation: {
          enabled: true,
          version: 0,
          position: 9007199254740991,
          source: "user",
        },
      }),
      work(5, { authorDeleted: true }),
    ];
    const plan = planWorkOperations("feature", works, all(works));
    expect(plan.skipped).toEqual(["未命名作品：未公开，不能推荐"]);
    expect(plan.operations.map((op) => [op.id, op.name, op.input])).toEqual([
      [
        works[0]!.id,
        "set-featured",
        {
          target: { type: "work", id: works[0]!.id },
          enabled: true,
          position: 0,
          expectedVersion: 0,
        },
      ],
      [
        works[2]!.id,
        "set-featured",
        {
          target: { type: "work", id: works[2]!.id },
          enabled: true,
          position: 7,
          expectedVersion: 2,
        },
      ],
      [
        works[3]!.id,
        "set-featured",
        {
          target: { type: "work", id: works[3]!.id },
          enabled: true,
          position: 0,
          expectedVersion: 0,
        },
      ],
    ]);
    expect(
      plan.operations.some((op) => op.input.position === 9007199254740991),
    ).toBe(false);
  });

  it("cancels only works that are recommended", () => {
    const works = [
      work(1),
      work(2, {
        recommendation: {
          enabled: true,
          version: 3,
          position: 1,
          source: "work",
        },
      }),
      work(3, {
        recommendation: {
          enabled: true,
          version: 0,
          position: 9007199254740991,
          source: "user",
        },
      }),
    ];
    const plan = planWorkOperations("unfeature", works, all(works));
    expect(plan.skipped).toEqual(["作品1：未推荐，无需取消"]);
    expect(plan.operations.map((op) => op.input)).toEqual([
      {
        target: { type: "work", id: works[1]!.id },
        enabled: false,
        position: 1,
        expectedVersion: 3,
      },
      {
        target: { type: "work", id: works[2]!.id },
        enabled: false,
        position: 0,
        expectedVersion: 0,
      },
    ]);
  });

  it("does not re-apply the state a work is already in and honours the selection", () => {
    const works = [
      work(1, { state: "hidden", version: 9 }),
      work(2, {
        latestSubmission: {
          revisionId: `work-revision-${"b".repeat(32)}`,
          title: "最新标题",
          disposition: "approved",
        },
      }),
      work(3),
    ];
    const plan = planWorkOperations(
      "hidden",
      works,
      new Set([works[0]!.id, works[1]!.id]),
    );
    expect(plan.skipped).toEqual(["作品1：已是该状态，未处理"]);
    expect(plan.operations).toEqual([
      {
        id: works[1]!.id,
        label: "最新标题",
        name: "moderate-work",
        input: { id: works[1]!.id, state: "hidden", expectedVersion: 4 },
      },
    ]);
    expect(
      planWorkOperations("removed", works, all(works)).operations,
    ).toHaveLength(3);
  });
});
