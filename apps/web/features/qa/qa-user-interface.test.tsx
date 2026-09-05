// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QaUserInterface, qaUserTabs } from "./qa-user-interface";

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
  act(() => {
    root.render(
      <main data-t02p-qa-harness="">
        <div data-product-shell="" data-settings-open="false">
          <div data-qa-controls="" />
          <nav data-primary-navigation-pager="" />
          <div data-t02p-qa-search="" />
          <div data-inscription-filter="" />
          <QaUserInterface
            published={[item("catalog-inscription-001", "山门题记")]}
            user={{ id: "qa-user-01", name: "访碑者", bio: "记录碑刻。" }}
            {...properties}
          />
        </div>
      </main>,
    );
  });
  return container;
};

const click = (element: Element | null) => {
  if (!(element instanceof HTMLElement)) throw new Error("Missing element");
  act(() => element.click());
};

const settlePager = (container: HTMLElement) => {
  act(() =>
    container
      .querySelector("[data-user-pager]")
      ?.dispatchEvent(new Event("scrollend")),
  );
};

const scrollPager = (container: HTMLElement, left: number) => {
  const frame = container.querySelector<HTMLElement>("[data-user-pager]")!;
  act(() => {
    frame.scrollLeft = left;
    frame.dispatchEvent(new Event("scroll"));
  });
  return frame;
};

describe("QaUserInterface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(
      1400,
    );
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
      function (this: HTMLElement) {
        const key = this.dataset.horizontalPanelKey;
        return key === undefined
          ? 0
          : qaUserTabs.indexOf(key as (typeof qaUserTabs)[number]) * 400;
      },
    );
    Object.defineProperty(HTMLElement.prototype, "onscrollend", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value(this: HTMLElement, options: ScrollToOptions) {
        this.scrollLeft = Number(options.left ?? 0);
        this.dispatchEvent(new Event("scroll"));
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (id: number) => window.clearTimeout(id),
    });
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
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
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
      settlePager(container);
      expect(container.textContent).toContain(visibleText);
    }
    expect(onTabChangeIntent.mock.calls.map(([tab]) => tab)).toEqual([
      "saved",
      "liked",
      "history",
      "published",
    ]);

    click(
      container.querySelector(
        '[data-user-content-id="catalog-inscription-001"]',
      ),
    );
    expect(onContentOpenIntent).toHaveBeenCalledWith("catalog-inscription-001");
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
    expect(container.querySelector("[data-user-avatar] img")).toBeNull();
    expect(container.querySelector("[data-user-trigger] img")).toBeNull();
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
    settlePager(container);
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

  it("supports controlled open and close requests without mutating ownership", () => {
    const onClosedChange = vi.fn();
    const closed = renderUser({ onOpenChange: onClosedChange, open: false });

    click(closed.querySelector("[data-user-trigger]"));
    expect(onClosedChange).toHaveBeenCalledWith(true);
    expect(closed.querySelector("[data-user-page]")).toBeNull();

    const onOpenChange = vi.fn();
    const opened = renderUser({ onOpenChange, open: true });
    click(opened.querySelector("[data-user-close]"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(opened.querySelector("[data-user-page]")).not.toBeNull();
  });

  it("isolates only its QA harness, traps focus and restores exact state", async () => {
    document.body.style.overflow = "clip";
    const container = renderUser();
    const controls = container.querySelector<HTMLElement>("[data-qa-controls]");
    const pager = container.querySelector<HTMLElement>(
      "[data-primary-navigation-pager]",
    );
    const search = container.querySelector<HTMLElement>(
      "[data-t02p-qa-search]",
    );
    const filter = container.querySelector<HTMLElement>(
      "[data-inscription-filter]",
    );
    if (
      controls === null ||
      pager === null ||
      search === null ||
      filter === null
    ) {
      throw new Error("Missing modal isolation fixture");
    }
    controls.setAttribute("aria-hidden", "menu");
    pager.inert = true;
    pager.setAttribute("inert", "");
    search.setAttribute("aria-hidden", "false");
    const trigger = container.querySelector<HTMLButtonElement>(
      "[data-user-trigger]",
    );

    click(trigger);
    await act(async () => vi.runAllTimers());

    const targets = [controls, pager, search, filter, trigger];
    for (const target of targets) {
      expect(target?.getAttribute("aria-hidden")).toBe("true");
      expect(target?.inert).toBe(true);
    }
    expect(document.body.style.overflow).toBe("hidden");

    const overlay = container.querySelector<HTMLElement>("[data-user-page]");
    const focusable = Array.from(
      overlay?.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"])',
      ) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      throw new Error("Missing modal focus targets");
    }
    first.focus();
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Tab",
          shiftKey: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(last);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }),
      ),
    );
    expect(document.activeElement).toBe(first);

    click(container.querySelector("[data-user-close]"));
    await act(async () => vi.runAllTimers());
    expect(controls.getAttribute("aria-hidden")).toBe("menu");
    expect(controls.inert).toBeUndefined();
    expect(pager.getAttribute("aria-hidden")).toBeNull();
    expect(pager.inert).toBe(true);
    expect(pager.getAttribute("inert")).toBe("");
    expect(search.getAttribute("aria-hidden")).toBe("false");
    expect(search.inert).toBeUndefined();
    expect(filter.getAttribute("aria-hidden")).toBeNull();
    expect(filter.inert).toBeUndefined();
    expect(trigger?.getAttribute("aria-hidden")).toBeNull();
    expect(trigger?.inert).toBeUndefined();
    expect(document.body.style.overflow).toBe("clip");
    expect(document.activeElement).toBe(trigger);
  });

  it("lets ProductShell consume Escape before closing User", async () => {
    const container = renderUser();
    click(container.querySelector("[data-user-trigger]"));
    await act(async () => vi.runAllTimers());
    const shell = container.querySelector<HTMLElement>("[data-product-shell]");
    const settings = container.querySelector<HTMLButtonElement>(
      "[data-user-settings]",
    );
    settings?.focus();
    click(settings);
    if (shell === null) throw new Error("Missing product shell fixture");
    shell.dataset.settingsOpen = "true";

    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      ),
    );
    expect(container.querySelector("[data-user-page]")).not.toBeNull();
    expect(document.activeElement).toBe(settings);

    shell.dataset.settingsOpen = "false";
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(container.querySelector("[data-user-page]")).toBeNull();
  });

  it("keeps four mounted panels and only commits a tab after native settling", () => {
    const onTabChangeIntent = vi.fn();
    const container = renderUser({
      onTabChangeIntent,
      saved: [item("saved-original", "收藏")],
    });
    click(container.querySelector("[data-user-trigger]"));
    const panels = Array.from(
      container.querySelectorAll<HTMLElement>("[data-user-panel]"),
    );
    expect(panels).toHaveLength(4);
    const frame = scrollPager(container, 180);
    act(() => vi.runOnlyPendingTimers());
    expect(Number(frame.dataset.horizontalPagerProgress)).toBeCloseTo(0.45);
    expect(frame.dataset.horizontalPagerActiveKey).toBe("published");
    expect(onTabChangeIntent).not.toHaveBeenCalled();
    scrollPager(container, 400);
    settlePager(container);
    settlePager(container);
    expect(frame.dataset.horizontalPagerActiveKey).toBe("saved");
    expect(onTabChangeIntent.mock.calls).toEqual([["saved"]]);
    expect(Array.from(container.querySelectorAll("[data-user-panel]"))).toEqual(
      panels,
    );
    expect(panels[0]?.hasAttribute("inert")).toBe(true);
    expect(panels[1]?.getAttribute("aria-hidden")).toBe("false");
  });

  it("cancels an interrupted drag and does not emit a bounced or duplicate tab intent", () => {
    const onTabChangeIntent = vi.fn();
    const onContentOpenIntent = vi.fn();
    const container = renderUser({ onTabChangeIntent, onContentOpenIntent });
    click(container.querySelector("[data-user-trigger]"));
    const frame = container.querySelector<HTMLElement>("[data-user-pager]")!;
    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    scrollPager(container, 220);
    act(() => frame.dispatchEvent(new Event("touchcancel", { bubbles: true })));
    settlePager(container);
    expect(frame.scrollLeft).toBe(0);
    expect(onTabChangeIntent).not.toHaveBeenCalled();
    click(container.querySelector("[data-user-content-id]"));
    expect(onContentOpenIntent).not.toHaveBeenCalled();
    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    scrollPager(container, 130);
    scrollPager(container, 0);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    settlePager(container);
    click(container.querySelector('[data-user-tab="published"]'));
    expect(onTabChangeIntent).not.toHaveBeenCalled();
  });

  it("supersedes rapid tab requests and clamps keyboard navigation at both ends", () => {
    const onTabChangeIntent = vi.fn();
    const container = renderUser({ onTabChangeIntent });
    click(container.querySelector("[data-user-trigger]"));
    click(container.querySelector('[data-user-tab="saved"]'));
    click(container.querySelector('[data-user-tab="liked"]'));
    click(container.querySelector('[data-user-tab="history"]'));
    expect(onTabChangeIntent).not.toHaveBeenCalled();
    settlePager(container);
    expect(onTabChangeIntent.mock.calls).toEqual([["history"]]);
    const historyTab = container.querySelector('[data-user-tab="history"]')!;
    act(() =>
      historyTab.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      ),
    );
    settlePager(container);
    expect(onTabChangeIntent).toHaveBeenCalledOnce();
    act(() =>
      historyTab.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Home" }),
      ),
    );
    settlePager(container);
    const publishedTab = container.querySelector(
      '[data-user-tab="published"]',
    )!;
    act(() =>
      publishedTab.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }),
      ),
    );
    settlePager(container);
    expect(onTabChangeIntent.mock.calls).toEqual([["history"], ["published"]]);
  });

  it("keeps each PC modal panel as its own vertical scroll owner across tabs and Settings", () => {
    const container = renderUser({
      platform: "pc",
      saved: [item("saved-original", "收藏")],
    });
    click(container.querySelector("[data-user-trigger]"));
    const published = container.querySelector<HTMLElement>(
      '[data-user-panel="published"]',
    )!;
    const frame = container.querySelector<HTMLElement>("[data-user-pager]")!;
    const publishedCard = published.querySelector("[data-user-content-id]");
    act(() => {
      published.scrollTop = 280;
      published.dispatchEvent(new Event("scroll"));
    });
    click(container.querySelector('[data-user-tab="saved"]'));
    settlePager(container);
    const saved = container.querySelector<HTMLElement>(
      '[data-user-panel="saved"]',
    )!;
    act(() => {
      saved.scrollTop = 175;
      saved.dispatchEvent(new Event("scroll"));
    });
    click(container.querySelector("[data-user-settings]"));
    expect(frame.dataset.horizontalPagerActiveKey).toBe("saved");
    expect(saved.scrollTop).toBe(175);
    click(container.querySelector('[data-user-tab="published"]'));
    settlePager(container);
    expect(published.scrollTop).toBe(280);
    expect(published.querySelector("[data-user-content-id]")).toBe(
      publishedCard,
    );
    expect(frame.style.height).toBe("");
    expect(frame.dataset.horizontalPagerScrollOwner).toBe("panel");
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("uses two source-preserving content columns in every phone tab without a feed preference", () => {
    const records = [item("original-1", "一"), item("original-2", "二")];
    const container = renderUser({
      platform: "phone",
      published: records,
      saved: records,
      liked: records,
      history: records,
    });
    click(container.querySelector("[data-user-trigger]"));
    for (const tab of qaUserTabs) {
      const panel = container.querySelector(`[data-user-panel="${tab}"]`)!;
      expect(
        panel
          .querySelector("[data-user-content-list]")
          ?.getAttribute("data-user-columns"),
      ).toBe("2");
      expect(
        Array.from(panel.querySelectorAll("[data-user-content-id]")).map(
          (item) => item.getAttribute("data-user-content-id"),
        ),
      ).toEqual(["original-1", "original-2"]);
    }
    const header = container.querySelector("[data-user-page] header");
    expect(header?.lastElementChild?.hasAttribute("data-user-settings")).toBe(
      true,
    );
    expect(header?.querySelector("[data-user-edit-profile]")).toBeNull();
    expect(
      container.querySelector(
        '[aria-label="用户资料"] [data-user-edit-profile]',
      ),
    ).not.toBeNull();
  });
});
