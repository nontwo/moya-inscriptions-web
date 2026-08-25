// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeFeedPager } from "./home-feed-pager";
import { HOME_PAGER_SCROLL_IDLE_MS } from "./home-feed-pager-motion";
import { homeFeeds } from "./home-feed";

import type { Root } from "react-dom/client";
import type { HomeFeedPagerHandle } from "./home-feed-pager";
import type { HomeFeed } from "./home-feed";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
let prefersReducedMotion = false;
let pagerWidth = 400;
let scrollToCalls: ScrollToOptions[] = [];
const resizeObservers: TestResizeObserver[] = [];

class TestResizeObserver implements ResizeObserver {
  readonly observed = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    resizeObservers.push(this);
  }

  disconnect() {
    this.observed.clear();
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  trigger() {
    this.callback([], this);
  }
}

const renderPager = (
  onCommit = vi.fn<(feed: HomeFeed) => void>(),
  platform: "phone" | "tablet" | "pc" = "phone",
  onProgress = vi.fn<(progress: number) => void>(),
  registerActiveScrollElement?: (element: HTMLElement) => () => void,
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const handle = createRef<HomeFeedPagerHandle>();
  roots.push(root);
  const render = (activeFeed: HomeFeed = "discover", primaryVisible = true) => {
    act(() => {
      root.render(
        <HomeFeedPager
          ref={handle}
          activeFeed={activeFeed}
          onCommit={onCommit}
          onProgress={onProgress}
          panels={{
            discover: <button type="button">Discover action</button>,
            nearby: <p>Nearby panel</p>,
            topics: <p>Topics panel</p>,
          }}
          platform={platform}
          primaryVisible={primaryVisible}
          {...(registerActiveScrollElement === undefined
            ? {}
            : { registerActiveScrollElement })}
        />,
      );
    });
  };
  render();
  const frame = container.querySelector<HTMLElement>("[data-home-feed-pager]")!;
  return { container, frame, handle, onCommit, onProgress, render };
};

const nativeScroll = (frame: HTMLElement, scrollLeft: number) => {
  act(() => {
    frame.scrollLeft = scrollLeft;
    frame.dispatchEvent(new Event("scroll"));
  });
};

const settleFromIdle = () => {
  act(() => vi.advanceTimersByTime(HOME_PAGER_SCROLL_IDLE_MS));
};

describe("HomeFeedPager native scroll-snap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prefersReducedMotion = false;
    pagerWidth = 400;
    scrollToCalls = [];
    resizeObservers.length = 0;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      () => pagerWidth,
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        const feed = this.dataset.homeFeedPanel;
        if (feed === "discover") return 600;
        if (feed === "nearby") return 900;
        if (feed === "topics") return 700;
        return 0;
      },
    );
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value(this: HTMLElement, options: ScrollToOptions) {
        scrollToCalls.push(options);
        this.scrollLeft = Number(options.left ?? 0);
        this.dispatchEvent(new Event("scroll"));
      },
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
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: prefersReducedMotion })),
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("keeps all feeds mounted and exposes only the committed panel", () => {
    const { container, frame } = renderPager();
    const panels = Array.from(
      container.querySelectorAll<HTMLElement>("[data-home-feed-panel]"),
    );

    expect(frame.getAttribute("data-home-pager-native")).toBe("");
    expect(panels).toHaveLength(3);
    expect(panels.every((panel) => !panel.hasAttribute("hidden"))).toBe(true);
    expect(panels[0]?.getAttribute("aria-hidden")).toBe("false");
    expect(panels[0]?.hasAttribute("inert")).toBe(false);
    expect(panels[1]?.getAttribute("aria-hidden")).toBe("true");
    expect(panels[1]?.hasAttribute("inert")).toBe(true);
    expect(
      panels.every((panel) =>
        panel.hasAttribute("data-home-feed-scroll-surface"),
      ),
    ).toBe(true);
  });

  it("publishes native progress without committing before scroll settles", () => {
    const { frame, onCommit, onProgress } = renderPager();

    nativeScroll(frame, 200);
    act(() => vi.advanceTimersByTime(0));

    expect(onProgress).toHaveBeenLastCalledWith(0.5);
    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.dataset.homePagerScrolling).toBe("true");
  });

  it("commits exactly once after native scrollend and deduplicates idle settle", () => {
    const { frame, onCommit } = renderPager();

    nativeScroll(frame, 400);
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
    expect(frame.dataset.homePagerScrolling).toBe("false");
    settleFromIdle();
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("does not settle while the native touch remains active", () => {
    const { frame, onCommit } = renderPager();

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 400);
    settleFromIdle();
    settleFromIdle();
    expect(onCommit).not.toHaveBeenCalled();

    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    settleFromIdle();
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });

  it("uses the idle fallback and clamps a fling to one adjacent feed", () => {
    const { frame, onCommit } = renderPager();

    nativeScroll(frame, 800);
    settleFromIdle();
    expect(scrollToCalls.at(-1)?.left).toBe(400);
    expect(onCommit).not.toHaveBeenCalled();
    settleFromIdle();

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });

  it("returns to the current snap point with zero commit", () => {
    const { frame, onCommit } = renderPager();

    nativeScroll(frame, 80);
    nativeScroll(frame, 0);
    settleFromIdle();

    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.style.height).toBe("");
  });

  it("keeps Phone height fixed while retaining the PC document-flow height model", () => {
    const phone = renderPager();
    expect(phone.frame.style.height).toBe("");
    nativeScroll(phone.frame, 400);
    act(() => phone.frame.dispatchEvent(new Event("scrollend")));
    expect(phone.frame.style.height).toBe("");

    const { frame } = renderPager(vi.fn(), "pc");
    expect(frame.style.height).toBe("600px");

    nativeScroll(frame, 400);
    expect(frame.style.height).toBe("600px");
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(frame.style.height).toBe("900px");
  });

  it("registers the committed Phone panel without changing any panel scrollTop", () => {
    const registered: HTMLElement[] = [];
    const cleanups: ReturnType<typeof vi.fn>[] = [];
    const register = vi.fn((element: HTMLElement) => {
      registered.push(element);
      const cleanup = vi.fn();
      cleanups.push(cleanup);
      return cleanup;
    });
    const { container, render } = renderPager(
      vi.fn(),
      "phone",
      vi.fn(),
      register,
    );
    const discover = container.querySelector<HTMLElement>(
      '[data-home-feed-panel="discover"]',
    )!;
    const nearby = container.querySelector<HTMLElement>(
      '[data-home-feed-panel="nearby"]',
    )!;
    discover.scrollTop = 137;
    nearby.scrollTop = 88;

    render("nearby");

    expect(registered).toEqual([discover, nearby]);
    expect(cleanups[0]).toHaveBeenCalledOnce();
    expect(discover.scrollTop).toBe(137);
    expect(nearby.scrollTop).toBe(88);
    expect(container.querySelector('[data-home-feed-panel="discover"]')).toBe(
      discover,
    );
    expect(container.querySelector('[data-home-feed-panel="nearby"]')).toBe(
      nearby,
    );
  });

  it("restores each native panel after a hidden Primary ancestor removes its scroll range", () => {
    const { container, render } = renderPager();
    const panels = Array.from(
      container.querySelectorAll<HTMLElement>("[data-home-feed-panel]"),
    );
    const positions = [137, 88, 44];
    for (const [index, panel] of panels.entries()) {
      render(homeFeeds[index] ?? "discover");
      act(() => {
        panel.scrollTop = positions[index] ?? 0;
        panel.dispatchEvent(new Event("scroll"));
      });
    }

    pagerWidth = 0;
    render("topics", false);
    for (const panel of panels) {
      act(() => {
        panel.scrollTop = 0;
        panel.dispatchEvent(new Event("scroll"));
      });
    }
    pagerWidth = 400;
    render("topics", true);

    expect(panels.map((panel) => panel.scrollTop)).toEqual(positions);
  });

  it("allows a tab request to cross directly to a non-adjacent feed", () => {
    const { frame, handle, onCommit } = renderPager();

    act(() => handle.current?.scrollToFeed("topics"));
    expect(scrollToCalls.at(-1)).toMatchObject({
      behavior: "smooth",
      left: 800,
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("topics");
  });

  it("settles tab requests without decorative motion when reduced motion is set", () => {
    prefersReducedMotion = true;
    const { frame, handle, onCommit } = renderPager();

    act(() => handle.current?.scrollToFeed("nearby"));
    expect(scrollToCalls.at(-1)?.behavior).toBe("auto");
    act(() => frame.dispatchEvent(new Event("scrollend")));
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });

  it("suppresses the click synthesized by a completed touch scroll", () => {
    const { container, frame, handle } = renderPager();
    const action = container.querySelector<HTMLButtonElement>("button")!;
    const activated = vi.fn();
    action.addEventListener("click", activated);
    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 400);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    settleFromIdle();
    act(() => action.click());

    expect(activated).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(501));
    act(() => handle.current?.scrollToFeed("topics"));
    act(() => action.click());
    expect(activated).toHaveBeenCalledOnce();
  });

  it("changes at most one feed for one explicit PC wheel gesture", () => {
    const { frame, onCommit } = renderPager(vi.fn(), "pc");
    for (const deltaX of [42, 31, 18]) {
      act(() =>
        frame.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            deltaX,
            deltaY: 2,
          }),
        ),
      );
    }
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });
});
