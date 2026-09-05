// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeFeedPager } from "./home-feed-pager";
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
let pagerOffsets = [0, 400, 800];
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

describe("HomeFeedPager native scroll-snap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prefersReducedMotion = false;
    pagerWidth = 400;
    pagerOffsets = [0, 400, 800];
    scrollToCalls = [];
    resizeObservers.length = 0;
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: TestResizeObserver,
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      () => pagerWidth,
    );
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
      function (this: HTMLElement) {
        const feed = this.dataset.homeFeedPanel as HomeFeed | undefined;
        return feed === undefined
          ? 0
          : (pagerOffsets[homeFeeds.indexOf(feed)] ?? 0);
      },
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
    Object.defineProperty(HTMLElement.prototype, "onscrollend", {
      configurable: true,
      value: null,
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.replaceChildren();
    Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
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

  it("uses native scrollend as the only settle path when supported", () => {
    const { frame, onCommit } = renderPager();

    nativeScroll(frame, 400);
    act(() => vi.advanceTimersByTime(1_000));
    expect(onCommit).not.toHaveBeenCalled();
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
    expect(frame.dataset.homePagerScrolling).toBe("false");
    act(() => frame.dispatchEvent(new Event("scrollend")));
    expect(onCommit).toHaveBeenCalledOnce();
  });

  it("defers an observed scrollend until the native touch is no longer active", () => {
    const { frame, onCommit } = renderPager();

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 400);
    act(() => frame.dispatchEvent(new Event("scrollend")));
    expect(onCommit).not.toHaveBeenCalled();

    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });

  it("uses stable animation frames only when scrollend is unsupported", () => {
    Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
    const { frame, onCommit } = renderPager();

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 400);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    act(() => vi.runAllTimers());

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
    expect(scrollToCalls).toEqual([]);
    expect(frame.dataset.homePagerSettleMode).toBe("stable-frames");
  });

  it("returns to the current snap point with zero commit", () => {
    const { frame, onCommit } = renderPager();

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 80);
    nativeScroll(frame, 0);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    act(() => frame.dispatchEvent(new Event("scrollend")));

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
    pagerOffsets = [0, 412, 830];
    const { frame, handle, onCommit } = renderPager();

    act(() => handle.current?.scrollToFeed("topics"));
    expect(scrollToCalls.at(-1)).toMatchObject({
      behavior: "smooth",
      left: 830,
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

  it("uses an immediate actual-offset request for PC browser parity", () => {
    pagerOffsets = [0, 412, 830];
    const { frame, handle, onCommit } = renderPager(vi.fn(), "pc");

    act(() => handle.current?.scrollToFeed("nearby"));
    expect(scrollToCalls.at(-1)).toMatchObject({ behavior: "auto", left: 412 });
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(onCommit).toHaveBeenCalledOnce();
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
    act(() => frame.dispatchEvent(new Event("scrollend")));
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

  it("consumes an internal commit without aligning scrollLeft a second time", () => {
    pagerOffsets = [0, 412, 830];
    const { frame, onCommit, render } = renderPager();

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 411.5);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(onCommit).toHaveBeenCalledWith("nearby");
    expect(scrollToCalls).toEqual([]);
    render("nearby");
    expect(frame.scrollLeft).toBe(411.5);
    expect(scrollToCalls).toEqual([]);
  });

  it("invalidates a stale native session when a new touch reverses direction", () => {
    const { frame, onCommit } = renderPager();

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 400);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 0);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    act(() => frame.dispatchEvent(new Event("scrollend")));
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(onCommit).not.toHaveBeenCalled();
    expect(scrollToCalls).toEqual([]);
  });

  it("lets a reverse touch replace a pending programmatic request", () => {
    const { frame, handle, onCommit } = renderPager();

    act(() => handle.current?.scrollToFeed("topics"));
    expect(scrollToCalls).toHaveLength(1);

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 0);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(onCommit).not.toHaveBeenCalled();
    expect(scrollToCalls).toHaveLength(1);
  });

  it("cancels an unsupported-browser fallback when a newer touch starts", () => {
    Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
    const { frame, onCommit } = renderPager();

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 400);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 0);
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    act(() => vi.runAllTimers());

    expect(onCommit).not.toHaveBeenCalled();
    expect(scrollToCalls).toEqual([]);
  });

  it("invalidates settle work on resize and aligns from current panel offsets", () => {
    const { frame, onCommit } = renderPager();
    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 400);

    pagerWidth = 500;
    pagerOffsets = [0, 500, 1_000];
    act(() => resizeObservers[0]?.trigger());
    act(() => frame.dispatchEvent(new Event("scrollend")));

    expect(frame.scrollLeft).toBe(0);
    expect(onCommit).not.toHaveBeenCalled();
    expect(scrollToCalls).toEqual([]);
  });

  it("keeps the committed feed when resize clamping scrollLeft fires before ResizeObserver", () => {
    const { frame, onCommit, render } = renderPager();

    render("nearby");
    expect(frame.scrollLeft).toBe(400);

    pagerWidth = 1_200;
    pagerOffsets = [0, 1_200, 2_400];
    const observer = resizeObservers.find((candidate) =>
      candidate.observed.has(frame),
    );
    act(() => {
      observer?.trigger();
    });
    expect(frame.scrollLeft).toBe(1_200);

    pagerWidth = 320;
    pagerOffsets = [0, 320, 640];
    nativeScroll(frame, 640);
    act(() => {
      frame.dispatchEvent(new Event("scrollend"));
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.scrollLeft).toBe(320);
    expect(frame.dataset["homePagerScrolling"]).toBe("false");

    act(() => {
      observer?.trigger();
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.scrollLeft).toBe(320);
    expect(frame.dataset["homePagerScrolling"]).toBe("false");
  });

  it("defers observed PC height writes and cancels pending writes on unmount", () => {
    const { container, frame } = renderPager(vi.fn(), "pc");
    const panel = container.querySelector<HTMLElement>(
      '[data-home-feed-panel="discover"]',
    )!;
    const observer = resizeObservers.find((candidate) =>
      candidate.observed.has(frame),
    )!;
    expect(frame.style.height).toBe("600px");

    Object.defineProperty(panel, "scrollHeight", {
      configurable: true,
      value: 980,
    });
    act(() => observer.trigger());
    expect(frame.style.height).toBe("600px");
    act(() => vi.runAllTimers());
    expect(frame.style.height).toBe("980px");

    Object.defineProperty(panel, "scrollHeight", {
      configurable: true,
      value: 1250,
    });
    act(() => observer.trigger());
    const root = roots.pop()!;
    act(() => root.unmount());
    act(() => vi.runAllTimers());
    expect(observer.observed.size).toBe(0);
    expect(frame.style.height).toBe("980px");
  });
});
