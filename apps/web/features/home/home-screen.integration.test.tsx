// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeScreen } from "./home-screen";
import { ProductShell } from "../product-shell/product-shell";

import type { Root } from "react-dom/client";
import type { HomeSurfaceData } from "./home-feed";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const emptyHome: HomeSurfaceData = {
  discover: { state: "empty" },
  nearby: { state: "empty" },
  topics: { state: "empty" },
};

const mediaQuery = (): MediaQueryList =>
  ({
    addEventListener: vi.fn(),
    matches: false,
    removeEventListener: vi.fn(),
  }) as unknown as MediaQueryList;

const renderHome = (platform: "phone" | "tablet" | "pc" = "phone") => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <ProductShell
        calligraphy={<p>Calligraphy panel</p>}
        developmentPlatformOverride={platform}
        home={<HomeScreen data={emptyHome} />}
        initialPlatform={platform}
        inscriptions={<p>Inscriptions panel</p>}
      />,
    );
  });
  return container;
};

const feedTab = (container: ParentNode, feed: string) =>
  container.querySelector<HTMLButtonElement>(`[data-home-feed-tab="${feed}"]`)!;

describe("HomeScreen integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/dev/t02p");
    window.localStorage.clear();
    document.documentElement.dataset.yoyiBootStarted = String(
      performance.now() - 1_000,
    );
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(mediaQuery),
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (id: number) => window.clearTimeout(id),
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.replaceChildren();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("renders exactly three related tabs and keeps every panel mounted but inert", async () => {
    const container = renderHome();
    await act(async () => vi.runAllTimers());
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-home-feed-tab]"),
    );
    const panels = Array.from(
      container.querySelectorAll<HTMLElement>("[data-home-feed-panel]"),
    );

    expect(tabs.map(({ textContent }) => textContent)).toEqual([
      "发现",
      "附近",
      "专题",
    ]);
    expect(
      tabs.filter((tab) => tab.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);
    expect(panels).toHaveLength(3);
    expect(
      container.querySelectorAll("[data-home-feed-indicator]"),
    ).toHaveLength(1);
    for (const tab of tabs) {
      const panel = container.querySelector<HTMLElement>(
        `#${tab.getAttribute("aria-controls")}`,
      )!;
      expect(panel.getAttribute("aria-labelledby")).toBe(tab.id);
    }
    expect(panels[0]?.hasAttribute("hidden")).toBe(false);
    expect(panels[1]?.hasAttribute("hidden")).toBe(false);
    expect(panels[1]?.getAttribute("aria-hidden")).toBe("true");
    expect(panels[1]?.hasAttribute("inert")).toBe(true);
    expect(container.querySelectorAll("[data-open-settings]")).toHaveLength(1);
    expect(container.querySelectorAll("h1, h2")).not.toContainEqual(
      expect.objectContaining({ textContent: "发现" }),
    );
  });

  it("keeps three Phone feed scroll positions in their mounted native panels", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const container = renderHome();
    await act(async () => vi.runAllTimers());
    replaceState.mockClear();
    const shell = container.querySelector<HTMLElement>("[data-product-shell]")!;
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;
    const panels = {
      discover: container.querySelector<HTMLElement>(
        '[data-home-feed-panel="discover"]',
      )!,
      nearby: container.querySelector<HTMLElement>(
        '[data-home-feed-panel="nearby"]',
      )!,
      topics: container.querySelector<HTMLElement>(
        '[data-home-feed-panel="topics"]',
      )!,
    };
    const identities = { ...panels };
    for (const panel of Object.values(panels)) {
      Object.defineProperty(panel, "scrollHeight", {
        configurable: true,
        value: 2_000,
      });
      Object.defineProperty(panel, "clientHeight", {
        configurable: true,
        value: 600,
      });
    }

    panels.discover.scrollTop = 137;
    act(() => feedTab(container, "nearby").click());
    await act(async () => vi.runAllTimers());
    expect(home.scrollTop).toBe(0);
    expect(panels.nearby.scrollTop).toBe(0);
    panels.nearby.scrollTop = 88;
    act(() => feedTab(container, "topics").click());
    await act(async () => vi.runAllTimers());
    panels.topics.scrollTop = 44;

    act(() => feedTab(container, "discover").click());
    await act(async () => vi.runAllTimers());
    expect(panels.discover.scrollTop).toBe(137);
    act(() => feedTab(container, "nearby").click());
    await act(async () => vi.runAllTimers());
    expect(panels.nearby.scrollTop).toBe(88);
    act(() => feedTab(container, "topics").click());
    await act(async () => vi.runAllTimers());
    expect(panels.topics.scrollTop).toBe(44);
    expect(home.scrollTop).toBe(0);
    expect(
      Object.fromEntries(
        Object.keys(panels).map((feed) => [
          feed,
          container.querySelector(`[data-home-feed-panel="${feed}"]`) ===
            identities[feed as keyof typeof identities],
        ]),
      ),
    ).toEqual({ discover: true, nearby: true, topics: true });
    expect(shell.dataset.activeDestination).toBe("home");
    expect(replaceState).not.toHaveBeenCalled();

    const primaryButton = (label: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.getAttribute("aria-label") === label,
      )!;
    act(() => primaryButton("碑刻").click());
    await act(async () => vi.runAllTimers());
    act(() => primaryButton("首页").click());
    await act(async () => vi.runAllTimers());
    expect(feedTab(container, "topics").getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(panels.topics.scrollTop).toBe(44);
    expect(home.scrollTop).toBe(0);
  });

  it("keeps PC feed switching on the document scroll model", async () => {
    const container = renderHome("pc");
    await act(async () => vi.runAllTimers());
    const scrollTo = vi.mocked(window.scrollTo);
    const documentScroller = (document.scrollingElement ??
      document.documentElement) as HTMLElement;
    Object.defineProperty(documentScroller, "scrollHeight", {
      configurable: true,
      value: 2_000,
    });
    Object.defineProperty(documentScroller, "clientHeight", {
      configurable: true,
      value: 600,
    });
    scrollTo.mockClear();

    documentScroller.scrollTop = 137;
    act(() => feedTab(container, "nearby").click());
    await act(async () => vi.runAllTimers());
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", top: 0 });

    documentScroller.scrollTop = 88;
    act(() => feedTab(container, "discover").click());
    await act(async () => vi.runAllTimers());
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", top: 137 });
    expect(
      container
        .querySelector('[data-home-feed-panel="discover"]')
        ?.hasAttribute("data-home-feed-scroll-surface"),
    ).toBe(false);
  });

  it("leaves orientation-time Primary scroll restoration with ProductShell", async () => {
    const container = renderHome();
    await act(async () => vi.runAllTimers());
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;
    const discover = container.querySelector<HTMLElement>(
      '[data-home-feed-panel="discover"]',
    )!;
    Object.defineProperty(discover, "scrollHeight", {
      configurable: true,
      value: 2_000,
    });
    Object.defineProperty(discover, "clientHeight", {
      configurable: true,
      value: 600,
    });
    const primaryButton = (label: string) =>
      Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => button.getAttribute("aria-label") === label,
      )!;

    discover.scrollTop = 180;
    act(() => primaryButton("碑刻").click());
    await act(async () => vi.runAllTimers());
    act(() => primaryButton("首页").click());

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 700,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 390,
    });
    act(() => window.dispatchEvent(new Event("orientationchange")));
    await act(async () => vi.runAllTimers());

    expect(discover.scrollTop).toBe(180);
    expect(home.scrollTop).toBe(0);
  });
});
