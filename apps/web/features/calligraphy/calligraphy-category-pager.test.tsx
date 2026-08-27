// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calligraphyCategories } from "./calligraphy-category";
import { CalligraphyCategoryPager } from "./calligraphy-category-pager";

import type { Root } from "react-dom/client";
import type { CalligraphyCategory } from "./calligraphy-category";
import type { CalligraphyCategoryPagerHandle } from "./calligraphy-category-pager";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const resizeObservers: TestResizeObserver[] = [];
let prefersReducedMotion = false;
let pagerWidth = 400;
let offsets = [0, 400, 800];
let scrollToCalls: ScrollToOptions[] = [];

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
  platform: "phone" | "tablet" | "pc" = "phone",
  onCommit = vi.fn<(category: CalligraphyCategory) => void>(),
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const handle = createRef<CalligraphyCategoryPagerHandle>();
  roots.push(root);
  const render = (
    activeCategory: CalligraphyCategory = "all",
    primaryVisible = true,
  ) => {
    act(() => {
      root.render(
        <CalligraphyCategoryPager
          ref={handle}
          activeCategory={activeCategory}
          onCommit={onCommit}
          onProgress={vi.fn()}
          panels={{
            all: <button type="button">All card</button>,
            ink: <p>Ink page</p>,
            rubbing: <p>Rubbing page</p>,
          }}
          platform={platform}
          primaryVisible={primaryVisible}
        />,
      );
    });
  };
  render();
  const frame = container.querySelector<HTMLElement>(
    "[data-calligraphy-category-pager]",
  )!;
  return { container, frame, handle, onCommit, render };
};

const nativeScroll = (frame: HTMLElement, left: number) => {
  act(() => {
    frame.scrollLeft = left;
    frame.dispatchEvent(new Event("scroll"));
  });
};

describe("CalligraphyCategoryPager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prefersReducedMotion = false;
    pagerWidth = 400;
    offsets = [0, 400, 800];
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
        const category = this.dataset.calligraphyCategoryPanel as
          CalligraphyCategory | undefined;
        return category === undefined
          ? 0
          : (offsets[calligraphyCategories.indexOf(category)] ?? 0);
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        const category = this.dataset.calligraphyCategoryPanel;
        return category === "all" ? 900 : category === "ink" ? 600 : 720;
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
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
    vi.restoreAllMocks();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("keeps all pages mounted and commits only after release and snap settle", () => {
    const { container, frame, onCommit } = renderPager();
    const panels = Array.from(
      container.querySelectorAll<HTMLElement>(
        "[data-calligraphy-category-panel]",
      ),
    );
    expect(panels).toHaveLength(3);
    expect(panels[0]?.getAttribute("aria-hidden")).toBe("false");
    expect(panels[1]?.hasAttribute("inert")).toBe(true);

    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 200);
    act(() => vi.advanceTimersByTime(0));
    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.dataset.calligraphyPagerScrolling).toBe("true");

    nativeScroll(frame, 400);
    act(() => frame.dispatchEvent(new Event("scrollend")));
    expect(onCommit).not.toHaveBeenCalled();
    act(() => frame.dispatchEvent(new Event("touchend", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("ink");
  });

  it("uses immediate tab paging for reduced motion and PC", () => {
    prefersReducedMotion = true;
    const phone = renderPager();
    act(() => phone.handle.current?.scrollToCategory("rubbing"));
    expect(scrollToCalls.at(-1)).toMatchObject({ behavior: "auto", left: 800 });

    scrollToCalls = [];
    const pc = renderPager("pc");
    act(() => pc.handle.current?.scrollToCategory("ink"));
    expect(scrollToCalls.at(-1)).toMatchObject({ behavior: "auto", left: 400 });
  });

  it("cancels an interrupted gesture without changing category", () => {
    const { frame, onCommit } = renderPager();
    act(() => frame.dispatchEvent(new Event("touchstart", { bubbles: true })));
    nativeScroll(frame, 240);
    act(() => frame.dispatchEvent(new Event("touchcancel", { bubbles: true })));
    act(() => frame.dispatchEvent(new Event("scrollend")));
    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.scrollLeft).toBe(0);
    expect(frame.dataset.calligraphyPagerScrolling).toBe("false");
  });

  it("allows at most one bounded category change per PC wheel gesture", () => {
    const { frame, onCommit } = renderPager("pc");
    act(() =>
      frame.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaX: -50,
          deltaY: 2,
        }),
      ),
    );
    expect(onCommit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(161));
    for (const deltaX of [50, 40, 30]) {
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
    expect(onCommit).toHaveBeenCalledWith("ink");
  });

  it("preserves the committed category across resize and hidden mounting", () => {
    const { frame, onCommit, render } = renderPager();
    render("ink");
    expect(frame.scrollLeft).toBe(400);

    pagerWidth = 0;
    render("ink", false);
    act(() => resizeObservers[0]?.trigger());
    pagerWidth = 520;
    offsets = [0, 520, 1040];
    render("ink", true);
    act(() => resizeObservers[0]?.trigger());

    expect(frame.scrollLeft).toBe(520);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
