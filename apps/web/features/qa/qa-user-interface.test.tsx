// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QaUserInterface } from "./qa-user-interface";

import type { ComponentProps } from "react";
import type { QaUserContentItem } from "./qa-user-interface";

const mountedRoots: ReturnType<typeof createRoot>[] = [];

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const item = (id: string, title: string): QaUserContentItem => ({ id, title });

const renderUser = (
  properties: Partial<ComponentProps<typeof QaUserInterface>> = {},
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() =>
    root.render(
      <QaUserInterface
        published={[item("qa-published-01", "山门题记")]}
        user={{ id: "qa-user-01", name: "访碑者", bio: "记录碑刻。" }}
        {...properties}
      />,
    ),
  );
  return container;
};

const click = (element: Element | null) => {
  if (!(element instanceof HTMLElement)) throw new Error("Missing element");
  act(() => element.click());
};

describe("QaUserInterface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
    });
  });

  afterEach(() => {
    for (const root of mountedRoots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    document.body.style.overflow = "";
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("opens on published content and restores focus when closed", async () => {
    const onOpenIntent = vi.fn();
    const onCloseIntent = vi.fn();
    const container = renderUser({ onCloseIntent, onOpenIntent });
    const trigger = container.querySelector<HTMLButtonElement>(
      "[data-user-trigger]",
    );

    click(trigger);
    await act(async () => vi.runAllTimers());

    expect(onOpenIntent).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-user-page]")).not.toBeNull();
    expect(
      container
        .querySelector('[data-user-tab="published"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(container.textContent).toContain("我发布过的内容");
    expect(container.textContent).toContain("山门题记");
    expect(document.activeElement).toBe(
      container.querySelector("[data-user-close]"),
    );

    click(container.querySelector("[data-user-close]"));
    await act(async () => vi.runAllTimers());
    expect(onCloseIntent).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-user-page]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("switches all four tabs and reports presentation intents", () => {
    const onTabChangeIntent = vi.fn();
    const onContentOpenIntent = vi.fn();
    const container = renderUser({
      history: [item("qa-history-01", "浏览记录一")],
      liked: [item("qa-liked-01", "喜欢内容一")],
      onContentOpenIntent,
      onTabChangeIntent,
      saved: [item("qa-saved-01", "收藏内容一")],
    });
    click(container.querySelector("[data-user-trigger]"));

    for (const [tab, visibleText] of [
      ["saved", "收藏内容一"],
      ["liked", "喜欢内容一"],
      ["history", "浏览记录一"],
      ["published", "山门题记"],
    ] as const) {
      click(container.querySelector(`[data-user-tab="${tab}"]`));
      expect(container.textContent).toContain(visibleText);
    }
    expect(onTabChangeIntent.mock.calls.map(([tab]) => tab)).toEqual([
      "saved",
      "liked",
      "history",
      "published",
    ]);

    click(container.querySelector('[data-user-content-id="qa-published-01"]'));
    expect(onContentOpenIntent).toHaveBeenCalledWith("qa-published-01");
    expect(container.textContent).toContain("已记录内容打开意图：山门题记");
  });

  it("renders explicit empty and avatar fallback states", () => {
    const container = renderUser({ published: [] });
    click(container.querySelector("[data-user-trigger]"));

    expect(
      container.querySelector('[data-user-empty="published"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("暂无发布内容");
    expect(container.querySelector("[data-user-avatar]")?.textContent).toBe(
      "访",
    );
  });

  it("emits edit, avatar, create and Settings intents without persistence", () => {
    const callbacks = {
      onAvatarChangeIntent: vi.fn(),
      onCreateIntent: vi.fn(),
      onEditProfileIntent: vi.fn(),
      onSettingsIntent: vi.fn(),
    };
    const container = renderUser(callbacks);
    click(container.querySelector("[data-user-trigger]"));

    click(container.querySelector("[data-user-avatar]"));
    click(container.querySelector("[data-user-edit-profile]"));
    click(container.querySelector("[data-user-create]"));
    click(container.querySelector("[data-user-settings]"));

    expect(callbacks.onAvatarChangeIntent).toHaveBeenCalledOnce();
    expect(callbacks.onEditProfileIntent).toHaveBeenCalledOnce();
    expect(callbacks.onCreateIntent).toHaveBeenCalledOnce();
    expect(callbacks.onSettingsIntent).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("已记录设置意图");
  });

  it("closes with Escape and keeps tab selection keyboard-visible", async () => {
    const container = renderUser({
      saved: [item("qa-saved-01", "收藏内容一")],
    });
    const trigger = container.querySelector<HTMLButtonElement>(
      "[data-user-trigger]",
    );
    click(trigger);
    await act(async () => vi.runAllTimers());

    const publishedTab = container.querySelector<HTMLButtonElement>(
      '[data-user-tab="published"]',
    );
    publishedTab?.focus();
    act(() =>
      publishedTab?.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      ),
    );
    expect(
      container
        .querySelector('[data-user-tab="saved"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");

    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(container.querySelector("[data-user-page]")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
