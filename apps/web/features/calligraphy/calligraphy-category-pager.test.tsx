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
const readingHostCleanups: (() => void)[] = [];
const resizeObservers: TestResizeObserver[] = [];
let prefersReducedMotion = false;
let pagerWidth = 400;
let offsets = [0, 400, 800];
let scrollToCalls: ScrollToOptions[] = [];
let panelHeights: Record<CalligraphyCategory, number>;

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
  initialPrimaryVisible = true,
  commitRenders = false,
  scrollReaders?: {
    readonly readCurrentScrollTop: () => number;
    readonly readSavedCategoryScrollTop: (
      category: CalligraphyCategory,
    ) => number;
  },
  prepareOwner?: (owner: HTMLDivElement) => void,
) => {
  const container = document.createElement("div");
  prepareOwner?.(container);
  document.body.append(container);
  const root = createRoot(container);
  const handle = createRef<CalligraphyCategoryPagerHandle>();
  roots.push(root);
  const onProgress = vi.fn();
  const render = (
    activeCategory: CalligraphyCategory = "all",
    primaryVisible = true,
  ) => {
    act(() => {
      root.render(
        <CalligraphyCategoryPager
          ref={handle}
          activeCategory={activeCategory}
          onCommit={(category) => {
            onCommit(category);
            if (commitRenders) render(category);
          }}
          onProgress={onProgress}
          panels={{
            all: <button type="button">All card</button>,
            ink: <p>Ink page</p>,
            rubbing: <p>Rubbing page</p>,
          }}
          panelStates={{
            all: "populated",
            ink: "classification-unavailable",
            rubbing: "classification-unavailable",
          }}
          platform={platform}
          primaryVisible={primaryVisible}
          readCurrentScrollTop={() => 0}
          readSavedCategoryScrollTop={() => 0}
          {...scrollReaders}
        />,
      );
    });
  };
  render("all", initialPrimaryVisible);
  const frame = container.querySelector<HTMLElement>(
    "[data-calligraphy-category-pager]",
  )!;
  const unmount = () => {
    roots.splice(roots.indexOf(root), 1);
    act(() => root.unmount());
  };
  const track = frame.firstElementChild as HTMLElement;
  const panels = [...track.children] as HTMLElement[];
  return {
    container,
    frame,
    track,
    panels,
    handle,
    onCommit,
    onProgress,
    render,
    unmount,
  };
};

const nativeScroll = (frame: HTMLElement, left: number) => {
  act(() => {
    frame.scrollLeft = left;
    frame.dispatchEvent(new Event("scroll"));
  });
};

const touch = (
  node: HTMLElement,
  type: string,
  x = 300,
  y = 300,
  count = 1,
) => {
  const points =
    type === "touchend" || type === "touchcancel"
      ? []
      : Array.from({ length: count }, (_, index) => ({
          clientX: x + index * 80,
          clientY: y,
        }));
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: points as Touch[],
  });
  Object.defineProperty(event, "timeStamp", { value: performance.now() });
  act(() => node.dispatchEvent(event));
  return event;
};
const drag = (frame: HTMLElement, dx = -220, dy = 0) => {
  touch(frame, "touchstart");
  for (let index = 1; index <= 10; index++) {
    act(() => vi.advanceTimersByTime(16));
    touch(frame, "touchmove", 300 + (dx * index) / 10, 300 + (dy * index) / 10);
  }
};
const trackLeft = (track: HTMLElement) =>
  Number(track.style.transform.match(/translate3d\(([-\d.]+)px/)?.[1] ?? 0);

// JSDOM has no layout engine. Read the panel's actual inline presentation
// translation, just as trackLeft reads Embla's actual inline X transform.
const panelTranslationY = (panel: HTMLElement) => {
  const transform = panel.style.transform;
  const translated =
    transform.match(/translate3d\([^,]+,\s*([-\d.]+)px/) ??
    transform.match(/translateY\(([-\d.]+)px/);
  return Number(translated?.[1] ?? 0);
};

// This boundary double retains Shell's public two-frame restore and capture
// input cancellation. Actual Shell cancellation/retry implementation is covered
// by product-shell.test.tsx; this host observes pager writes separately.
const renderReadingPager = ({
  platform = "phone",
  savedTarget = 0,
}: {
  readonly platform?: "phone" | "tablet" | "pc";
  readonly savedTarget?: number;
} = {}) => {
  let top = 225;
  let active: CalligraphyCategory = "rubbing";
  let owner: HTMLDivElement;
  let pendingFrame: number | null = null;
  let restoring = false;
  const saved: Record<CalligraphyCategory, number> = {
    all: 0,
    ink: savedTarget,
    rubbing: 225,
  };
  const writes: {
    origin: "pager" | "restore";
    requested: number;
    top: number;
    height: string;
  }[] = [];
  const commitReadings: { top: number; height: string }[] = [];
  const height = () =>
    owner.querySelector<HTMLElement>("[data-calligraphy-category-pager]")?.style
      .height ?? "720px";
  const clamp = (value: number) =>
    Math.max(0, Math.min(value, owner.scrollHeight - owner.clientHeight));
  const cancelRestore = () => {
    if (pendingFrame !== null) window.cancelAnimationFrame(pendingFrame);
    pendingFrame = null;
    for (const input of ["touchstart", "pointerdown"])
      window.removeEventListener(input, cancelOnInput, true);
  };
  const cancelOnInput = (event: Event) => {
    if (event.target instanceof Node && owner.contains(event.target))
      cancelRestore();
  };
  const queueRestore = (desired: number) => {
    cancelRestore();
    for (const input of ["touchstart", "pointerdown"])
      window.addEventListener(input, cancelOnInput, {
        capture: true,
        passive: true,
      });
    pendingFrame = window.requestAnimationFrame(() => {
      pendingFrame = window.requestAnimationFrame(() => {
        pendingFrame = null;
        restoring = true;
        owner.scrollTop = clamp(desired);
        restoring = false;
        cancelRestore();
      });
    });
  };
  const onCommit = vi.fn((category: CalligraphyCategory) => {
    commitReadings.push({ top: owner.scrollTop, height: height() });
    saved[active] = owner.scrollTop;
    active = category;
    queueRestore(saved[category]);
  });
  const v = renderPager(
    platform,
    onCommit,
    true,
    true,
    {
      readCurrentScrollTop: () => owner.scrollTop,
      readSavedCategoryScrollTop: (category) => saved[category],
    },
    (element) => {
      owner = element;
      owner.dataset.primaryDestination = "calligraphy";
      Object.defineProperties(owner, {
        clientHeight: { configurable: true, get: () => 400 },
        scrollHeight: {
          configurable: true,
          get: () =>
            Math.max(
              400,
              Number.parseFloat(height()),
              Number.parseFloat(
                owner.querySelector<HTMLElement>(
                  "[data-calligraphy-category-pager]",
                )?.style.minHeight ?? "0",
              ) || 0,
            ),
        },
        scrollTop: {
          configurable: true,
          get: () => top,
          set: (requested: number) => {
            top = clamp(requested);
            writes.push({
              origin: restoring ? "restore" : "pager",
              requested,
              top,
              height: height(),
            });
          },
        },
      });
    },
  );
  v.render("rubbing");
  readingHostCleanups.push(cancelRestore);
  return {
    ...v,
    owner: v.container,
    saved,
    writes,
    commitReadings,
    visibleY: (panel: HTMLElement) => panelTranslationY(panel) - top,
    nativeScrollTo: (value: number) =>
      act(() => {
        top = clamp(value);
        owner.dispatchEvent(new Event("scroll"));
      }),
  };
};

describe("CalligraphyCategoryPager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    prefersReducedMotion = false;
    pagerWidth = 400;
    offsets = [0, 400, 800];
    scrollToCalls = [];
    panelHeights = { all: 900, ink: 600, rubbing: 720 };
    resizeObservers.length = 0;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    for (const name of ["offsetWidth", "offsetHeight"] as const)
      vi.spyOn(HTMLElement.prototype, name, "get").mockImplementation(() =>
        name === "offsetWidth" ? pagerWidth : 720,
      );
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockReturnValue(
      document.body,
    );
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(0);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const category = this.dataset.calligraphyCategoryPanel as
          CalligraphyCategory | undefined;
        const height = this.hasAttribute("data-calligraphy-category-pager")
          ? Math.max(
              Number.parseFloat(this.style.height) || 0,
              Number.parseFloat(this.style.minHeight) || 0,
            )
          : category === undefined
            ? 0
            : panelHeights[category];
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: pagerWidth,
          bottom: height,
          width: pagerWidth,
          height,
          toJSON: () => undefined,
        };
      },
    );
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
        const category = this.dataset.calligraphyCategoryPanel as
          CalligraphyCategory | undefined;
        return category === undefined ? 720 : panelHeights[category];
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
        window.setTimeout(() => callback(performance.now()), 16),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (id: number) => window.clearTimeout(id),
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: prefersReducedMotion,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(HTMLElement.prototype, "onscrollend", {
      configurable: true,
      value: null,
    });
  });

  afterEach(() => {
    for (const cleanup of readingHostCleanups.splice(0)) cleanup();
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("keeps mounted pages and commits category with inert ownership on release before visual settle", () => {
    const v = renderPager("phone", vi.fn(), true, true);
    expect(v.panels).toHaveLength(3);
    expect(v.panels[0]?.getAttribute("aria-hidden")).toBe("false");
    expect(v.panels[0]?.dataset.catalogPresentationState).toBe("populated");
    expect(v.panels[1]?.hasAttribute("inert")).toBe(true);
    const oldPanels = [...v.panels];
    drag(v.frame);
    expect(trackLeft(v.track)).toBeLessThan(-100);
    expect(v.frame.scrollLeft).toBe(0);
    expect(v.onCommit).not.toHaveBeenCalled();
    expect(v.frame.dataset.calligraphyPagerScrolling).toBe("true");
    touch(v.frame, "touchend");
    expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
    expect(v.panels[0]?.hasAttribute("inert")).toBe(true);
    expect(v.panels[1]?.hasAttribute("inert")).toBe(false);
    expect(v.panels[1]?.getAttribute("aria-hidden")).toBe("false");
    expect(v.frame.style.height).toBe("600px");
    expect(trackLeft(v.track)).toBeGreaterThan(-400);
    act(() => vi.advanceTimersByTime(3000));
    expect(trackLeft(v.track)).toBeCloseTo(-400, 2);
    expect(v.onCommit).toHaveBeenCalledOnce();
    expect([...v.track.children]).toEqual(oldPanels);
  });

  it.each(["phone", "tablet"] as const)(
    "hands off actual Y before the next paint while preserving both visible panels on %s",
    (platform) => {
      const v = renderReadingPager({ platform });
      const source = v.panels[2]!;
      const target = v.panels[1]!;
      const oldPanels = [...v.panels];
      drag(v.frame, 220);
      expect(v.visibleY(source)).toBe(-225);
      expect(v.visibleY(target)).toBe(0);
      const beforeRelease = [v.visibleY(source), v.visibleY(target)];

      touch(v.frame, "touchend");

      expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
      expect(v.saved.rubbing).toBe(225);
      expect(v.commitReadings).toEqual([{ top: 225, height: "720px" }]);
      expect(source.hasAttribute("inert")).toBe(true);
      expect(target.hasAttribute("inert")).toBe(false);
      expect(v.frame.style.height).toBe("600px");
      expect(v.writes).toEqual([
        { origin: "pager", requested: 0, top: 0, height: "600px" },
      ]);
      expect(panelTranslationY(target)).toBe(0);
      expect([v.visibleY(source), v.visibleY(target)]).toEqual(beforeRelease);
      expect(trackLeft(v.track)).toBeLessThan(-400);

      act(() => vi.advanceTimersByTime(32));
      expect(v.writes.map(({ origin, top }) => ({ origin, top }))).toEqual([
        { origin: "pager", top: 0 },
        { origin: "restore", top: 0 },
      ]);
      expect([v.visibleY(source), v.visibleY(target)]).toEqual(beforeRelease);
      expect(trackLeft(v.track)).toBeLessThan(-400);
      act(() => vi.advanceTimersByTime(3000));
      expect(v.panels.map(panelTranslationY)).toEqual([0, 0, 0]);
      expect(v.frame.style.height).toBe("600px");
      expect(v.owner.scrollTop).toBe(0);
      expect(v.writes).toHaveLength(2);
      expect([...v.track.children]).toEqual(oldPanels);
    },
  );

  it.each([
    { savedTarget: 135, expectedTop: 135, targetHeight: 600, minimumHeight: 0 },
    { savedTarget: 480, expectedTop: 200, targetHeight: 600, minimumHeight: 0 },
    {
      savedTarget: 480,
      expectedTop: 250,
      targetHeight: 600,
      minimumHeight: 650,
    },
    {
      savedTarget: 480,
      expectedTop: 480,
      targetHeight: 1200,
      minimumHeight: 0,
    },
  ])(
    "clamps saved Y $savedTarget to $expectedTop using actual target height $targetHeight and minimum $minimumHeight",
    ({ savedTarget, expectedTop, targetHeight, minimumHeight }) => {
      panelHeights.ink = targetHeight;
      const expectedHeight = `${targetHeight}px`;
      const v = renderReadingPager({ savedTarget });
      v.frame.style.minHeight = `${minimumHeight}px`;
      const source = v.panels[2]!;
      const target = v.panels[1]!;
      drag(v.frame, 220);
      expect(v.visibleY(target)).toBe(-expectedTop);
      touch(v.frame, "touchend");
      expect(v.owner.scrollTop).toBe(expectedTop);
      expect(v.frame.style.height).toBe(expectedHeight);
      expect(v.frame.getBoundingClientRect().height).toBe(
        Math.max(targetHeight, minimumHeight),
      );
      expect(panelTranslationY(target)).toBe(0);
      expect(v.visibleY(source)).toBe(-225);
      expect(v.writes).toEqual([
        {
          origin: "pager",
          requested: expectedTop,
          top: expectedTop,
          height: expectedHeight,
        },
      ]);
      act(() => vi.advanceTimersByTime(32));
      expect(v.owner.scrollTop).toBe(expectedTop);
      expect(v.writes[1]).toEqual({
        origin: "restore",
        requested: expectedTop,
        top: expectedTop,
        height: expectedHeight,
      });
      act(() => vi.advanceTimersByTime(3000));
      expect(v.panels.map(panelTranslationY)).toEqual([0, 0, 0]);
      expect(v.saved.ink).toBe(savedTarget);
    },
  );

  it.each(["pointerdown", "touchstart"] as const)(
    "lets new %s cancel the queued restore while native vertical movement remains visible",
    (input) => {
      const v = renderReadingPager();
      drag(v.frame, 220);
      touch(v.frame, "touchend");
      const target = v.panels[1]!;
      expect(v.owner.scrollTop).toBe(0);
      expect(v.writes).toHaveLength(1);
      if (input === "touchstart") touch(v.frame, input);
      else
        act(() => v.frame.dispatchEvent(new Event(input, { bubbles: true })));
      const beforeScroll = v.visibleY(target);
      v.nativeScrollTo(80);
      expect(panelTranslationY(target)).toBe(0);
      expect(v.visibleY(target)).toBe(beforeScroll - 80);
      if (input === "touchstart") {
        expect(touch(v.frame, "touchmove", 304, 260).defaultPrevented).toBe(
          false,
        );
        touch(v.frame, "touchend");
      }
      act(() => vi.advanceTimersByTime(3000));
      expect(v.owner.scrollTop).toBe(80);
      expect(v.writes).toHaveLength(1);
      expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
      expect(v.panels.map(panelTranslationY)).toEqual([0, 0, 0]);
    },
  );

  it("preserves the new source Y and saved target on an immediate reverse drag", () => {
    const v = renderReadingPager();
    drag(v.frame, 220);
    touch(v.frame, "touchend");
    expect(v.owner.scrollTop).toBe(0);
    expect(trackLeft(v.track)).toBeLessThan(-400);
    // A new touch cancels the first pending restore before either frame runs.
    drag(v.frame, -220);
    expect(v.visibleY(v.panels[2]!)).toBe(-225);
    touch(v.frame, "touchend");
    expect(v.onCommit.mock.calls.map(([category]) => category)).toEqual([
      "ink",
      "rubbing",
    ]);
    expect(v.owner.scrollTop).toBe(225);
    expect(panelTranslationY(v.panels[2]!)).toBe(0);
    expect(v.visibleY(v.panels[1]!)).toBe(0);
    expect(v.writes.map(({ origin, top }) => ({ origin, top }))).toEqual([
      { origin: "pager", top: 0 },
      { origin: "pager", top: 225 },
    ]);
    act(() => vi.advanceTimersByTime(3000));
    expect(v.writes.map(({ origin, top }) => ({ origin, top }))).toEqual([
      { origin: "pager", top: 0 },
      { origin: "pager", top: 225 },
      { origin: "restore", top: 225 },
    ]);
    expect(v.saved).toEqual({ all: 0, ink: 0, rubbing: 225 });
    expect(v.panels.map(panelTranslationY)).toEqual([0, 0, 0]);
  });

  it.each([
    "ordinary",
    "vertical",
    "second finger",
    "cancel",
    "hidden",
  ] as const)(
    "does not write Y or retain presentation offsets for %s input",
    (input) => {
      const v = renderReadingPager();
      if (input === "second finger" || input === "cancel" || input === "hidden")
        drag(v.frame, 220);
      else touch(v.frame, "touchstart");
      if (input === "vertical") {
        expect(touch(v.frame, "touchmove", 304, 260).defaultPrevented).toBe(
          false,
        );
        v.nativeScrollTo(245);
        expect(v.visibleY(v.panels[2]!)).toBe(-245);
      }
      if (input === "second finger") touch(v.frame, "touchstart", 80, 300, 2);
      if (input === "hidden") v.render("rubbing", false);
      else touch(v.frame, input === "cancel" ? "touchcancel" : "touchend");
      act(() => vi.advanceTimersByTime(3000));
      expect(v.writes).toEqual([]);
      expect(v.onCommit).not.toHaveBeenCalled();
      expect(v.panels.map(panelTranslationY)).toEqual([0, 0, 0]);
    },
  );

  it("clears reading offsets synchronously for a reduced-motion tab change", () => {
    prefersReducedMotion = true;
    const v = renderReadingPager({ savedTarget: 135 });
    act(() => v.handle.current?.scrollToCategory("ink"));
    expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
    expect(v.owner.scrollTop).toBe(135);
    expect(trackLeft(v.track)).toBe(-400);
    expect(v.panels[1]!.hasAttribute("inert")).toBe(false);
    expect(v.panels.map(panelTranslationY)).toEqual([0, 0, 0]);
    expect(v.writes).toEqual([
      { origin: "pager", requested: 135, top: 135, height: "600px" },
    ]);
    act(() => vi.advanceTimersByTime(3000));
    expect(v.owner.scrollTop).toBe(135);
    expect(v.panels.map(panelTranslationY)).toEqual([0, 0, 0]);
    expect(v.onCommit).toHaveBeenCalledOnce();
  });

  it("keeps PC category changes on the original delayed restore without a pager Y write", () => {
    const v = renderReadingPager({ platform: "pc" });
    act(() => v.handle.current?.scrollToCategory("ink"));
    act(() => v.frame.dispatchEvent(new Event("scrollend")));
    expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
    expect(v.owner.scrollTop).toBe(225);
    expect(v.writes).toEqual([]);
    expect(v.panels.map(panelTranslationY)).toEqual([0, 0, 0]);
    act(() => vi.advanceTimersByTime(32));
    expect(v.writes.map(({ origin, top }) => ({ origin, top }))).toEqual([
      { origin: "restore", top: 0 },
    ]);
  });

  it("uses immediate tab paging for reduced motion and PC", () => {
    prefersReducedMotion = true;
    const phone = renderPager("phone", vi.fn(), true, true);
    const phoneEvents = vi.spyOn(phone.frame, "dispatchEvent");
    act(() => phone.handle.current?.scrollToCategory("rubbing"));
    expect(phone.frame.scrollLeft).toBe(0);
    expect(trackLeft(phone.track)).toBe(-800);
    expect(scrollToCalls).toEqual([]);
    expect(phoneEvents).not.toHaveBeenCalled();
    expect(phone.onCommit).toHaveBeenCalledExactlyOnceWith("rubbing");
    phone.render("rubbing");
    expect(trackLeft(phone.track)).toBe(-800);
    expect(phone.onCommit).toHaveBeenCalledOnce();
    act(() => phone.frame.dispatchEvent(new Event("scrollend")));
    expect(phone.onCommit).toHaveBeenCalledExactlyOnceWith("rubbing");

    prefersReducedMotion = false;
    const pc = renderPager("pc");
    const pcEvents = vi.spyOn(pc.frame, "dispatchEvent");
    act(() => pc.handle.current?.scrollToCategory("ink"));
    expect(pc.frame.scrollLeft).toBe(400);
    expect(scrollToCalls).toEqual([]);
    expect(pcEvents).not.toHaveBeenCalled();
    expect(pc.onCommit).not.toHaveBeenCalled();
    nativeScroll(pc.frame, 400);
    expect(pc.onCommit).not.toHaveBeenCalled();
    act(() => pc.frame.dispatchEvent(new Event("scrollend")));
    expect(pc.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
  });

  it("uses native offset assignment after a PC hide and reveal without pre-committing", () => {
    const { frame, handle, onCommit, render } = renderPager("pc");
    render("rubbing");
    render("rubbing", false);
    render("rubbing", true);
    expect(frame.scrollLeft).toBe(800);
    // The observed WebKit state accepts the method call without moving.
    const ignoredScrollTo = vi
      .spyOn(frame, "scrollTo")
      .mockImplementation(() => {});
    const dispatched = vi.spyOn(frame, "dispatchEvent");

    act(() => handle.current?.scrollToCategory("all"));

    expect(ignoredScrollTo).not.toHaveBeenCalled();
    expect(frame.scrollLeft).toBe(0);
    expect(dispatched).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.dataset.calligraphyPagerScrolling).toBe("true");
    nativeScroll(frame, 0);
    expect(onCommit).not.toHaveBeenCalled();
    act(() => frame.dispatchEvent(new Event("scrollend")));
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("all");
    expect(frame.dataset.calligraphyPagerScrolling).toBe("false");
  });

  it.each(["phone", "tablet"] as const)(
    "commits tab requests immediately and lets the visual tail be interrupted on %s",
    (platform) => {
      const v = renderPager(platform, vi.fn(), true, true);
      const nativeSmoothScroll = vi.spyOn(v.frame, "scrollTo");
      act(() => v.handle.current?.scrollToCategory("ink"));
      expect(nativeSmoothScroll).not.toHaveBeenCalled();
      expect(v.frame.scrollLeft).toBe(0);
      expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
      act(() => vi.advanceTimersByTime(64));
      const before = trackLeft(v.track);
      expect(before).toBeLessThan(0);
      expect(before).toBeGreaterThan(-400);
      touch(v.frame, "touchstart");
      expect(trackLeft(v.track)).toBe(before);
      for (let index = 1; index <= 10; index++) {
        act(() => vi.advanceTimersByTime(16));
        touch(v.frame, "touchmove", 300 + 22 * index, 300);
      }
      expect(trackLeft(v.track)).toBeGreaterThan(before);
      touch(v.frame, "touchend");
      expect(v.onCommit.mock.calls.map(([category]) => category)).toEqual([
        "ink",
        "all",
      ]);
      act(() => vi.advanceTimersByTime(3000));
      expect(trackLeft(v.track)).toBeCloseTo(0, 2);
      expect(v.onCommit).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["phone", "tablet", "pc"] as const)(
    "commits before applying the shorter target panel height on %s",
    (platform) => {
      let heightObservedByCommit: string | undefined;
      const onCommit = vi.fn<(category: CalligraphyCategory) => void>(() => {
        heightObservedByCommit = rendered.frame.style.height;
      });
      const rendered = renderPager(platform, onCommit, true, true);
      expect(rendered.frame.style.height).toBe("900px");

      act(() => rendered.handle.current?.scrollToCategory("ink"));
      act(() => rendered.frame.dispatchEvent(new Event("scrollend")));

      expect(onCommit).toHaveBeenCalledOnce();
      expect(onCommit).toHaveBeenCalledWith("ink");
      expect(heightObservedByCommit).toBe("900px");
      expect(rendered.frame.style.height).toBe("600px");
    },
  );

  it("keeps a second-finger cancellation blocked until all fingers leave", () => {
    const v = renderPager("phone", vi.fn(), true, true);
    drag(v.frame);
    expect(trackLeft(v.track)).toBeLessThan(-100);
    touch(v.frame, "touchstart", 80, 300, 2);
    expect(v.frame.dataset.calligraphyPagerScrolling).toBe("false");
    touch(v.frame, "touchmove", 20, 300);
    touch(v.frame, "touchend");
    act(() => vi.advanceTimersByTime(3000));
    expect(trackLeft(v.track)).toBe(0);
    expect(v.onCommit).not.toHaveBeenCalled();
    drag(v.frame);
    touch(v.frame, "touchend");
    expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
  });

  it("cancels an interrupted gesture without changing category", () => {
    const v = renderPager();
    drag(v.frame);
    touch(v.frame, "touchcancel");
    act(() => vi.advanceTimersByTime(3000));
    expect(v.onCommit).not.toHaveBeenCalled();
    expect(trackLeft(v.track)).toBe(0);
    expect(v.frame.dataset.calligraphyPagerScrolling).toBe("false");
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
    const { frame, track, onCommit, render } = renderPager();
    render("ink");
    expect(trackLeft(track)).toBe(-400);

    pagerWidth = 0;
    render("ink", false);
    act(() => resizeObservers[0]?.trigger());
    pagerWidth = 520;
    offsets = [0, 520, 1040];
    render("ink", true);
    act(() => resizeObservers.at(-1)?.trigger());

    expect(trackLeft(frame.firstElementChild as HTMLElement)).toBe(-520);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("preserves the first gesture after becoming visible", () => {
    pagerWidth = 0;
    const v = renderPager("phone", vi.fn(), false, true);
    act(() => resizeObservers[0]?.trigger());
    pagerWidth = 400;
    v.render("all", true);
    drag(v.frame);
    act(() => resizeObservers[0]?.trigger());
    touch(v.frame, "touchend");
    expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
    act(() => vi.advanceTimersByTime(3000));
    expect(trackLeft(v.track)).toBeCloseTo(-400, 2);
  });

  it("does not write or queue a height frame for an unchanged measurement", () => {
    const { frame } = renderPager("pc");
    const writeHeight = vi.spyOn(frame.style, "height", "set");
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");

    act(() => resizeObservers[0]?.trigger());
    act(() => resizeObservers[0]?.trigger());

    expect(writeHeight).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(frame.style.height).toBe("900px");
  });

  it("coalesces observer changes into one latest-height write and then stabilizes", () => {
    const { frame } = renderPager("pc");
    const writeHeight = vi.spyOn(frame.style, "height", "set");
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    panelHeights.all = 1200;
    act(() => resizeObservers[0]?.trigger());
    panelHeights.all = 1400;
    act(() => resizeObservers[0]?.trigger());

    expect(frame.style.height).toBe("900px");
    expect(writeHeight).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledOnce();

    act(() => vi.runOnlyPendingTimers());
    expect(frame.style.height).toBe("1400px");
    expect(writeHeight).toHaveBeenCalledExactlyOnceWith("1400px");
    act(() => resizeObservers[0]?.trigger());
    act(() => vi.runOnlyPendingTimers());
    expect(writeHeight).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a queued height write when the current measurement already matches", () => {
    const { frame } = renderPager("pc");
    const writeHeight = vi.spyOn(frame.style, "height", "set");
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    panelHeights.all = 1200;
    act(() => resizeObservers[0]?.trigger());
    panelHeights.all = 900;
    act(() => resizeObservers[0]?.trigger());
    act(() => vi.runOnlyPendingTimers());

    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(writeHeight).not.toHaveBeenCalled();
    expect(frame.style.height).toBe("900px");
  });

  it("does not apply a queued or new observer height during an active gesture", () => {
    const { frame } = renderPager();
    const writeHeight = vi.spyOn(frame.style, "height", "set");
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    panelHeights.all = 1200;
    act(() => resizeObservers[0]?.trigger());
    touch(frame, "touchstart");
    act(() => vi.runOnlyPendingTimers());
    act(() => resizeObservers[0]?.trigger());

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(writeHeight).not.toHaveBeenCalled();
    expect(frame.style.height).toBe("900px");
    touch(frame, "touchcancel");
    expect(frame.style.height).toBe("1200px");
  });

  it("reconciles a deferred height after a touch ends without horizontal movement", () => {
    const { frame, onCommit } = renderPager();
    panelHeights.all = 1200;
    act(() => resizeObservers[0]?.trigger());
    touch(frame, "touchstart");
    act(() => vi.runOnlyPendingTimers());
    expect(frame.style.height).toBe("900px");

    touch(frame, "touchend");

    expect(frame.style.height).toBe("1200px");
    expect(frame.dataset.calligraphyPagerScrolling).toBe("false");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("releases deferred height work when the page hides without a touchend", () => {
    const { frame, onCommit } = renderPager();
    touch(frame, "touchstart");
    panelHeights.all = 1200;
    act(() => resizeObservers[0]?.trigger());
    expect(frame.style.height).toBe("900px");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => resizeObservers[0]?.trigger());
    act(() => vi.runOnlyPendingTimers());
    expect(frame.style.height).toBe("1200px");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps vertical input with the page and leaves an active drag intact on unrelated renders", () => {
    const v = renderPager("phone", vi.fn(), true, true);
    touch(v.frame, "touchstart");
    const firstVertical = touch(v.frame, "touchmove", 306, 280);
    const laterDiagonal = touch(v.frame, "touchmove", 160, 160);
    expect(firstVertical.defaultPrevented).toBe(false);
    expect(laterDiagonal.defaultPrevented).toBe(false);
    touch(v.frame, "touchend");
    expect(v.onCommit).not.toHaveBeenCalled();
    expect(trackLeft(v.track)).toBe(0);

    drag(v.frame);
    const before = trackLeft(v.track);
    const addListener = vi.spyOn(v.frame, "addEventListener");
    v.render("all");
    expect(trackLeft(v.track)).toBe(before);
    expect(addListener).not.toHaveBeenCalled();
    touch(v.frame, "touchend");
    expect(v.onCommit).toHaveBeenCalledExactlyOnceWith("ink");
  });

  it("discards an unfinished session when hidden and revealed at the same width", () => {
    const { frame, onCommit, render } = renderPager();
    drag(frame);
    expect(frame.dataset.calligraphyPagerScrolling).toBe("true");

    render("all", false);
    panelHeights.all = 1200;
    render("all", true);

    expect(frame.scrollLeft).toBe(0);
    expect(frame.dataset.calligraphyPagerScrolling).toBe("false");
    expect(frame.style.height).toBe("1200px");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("cancels height work at zero width and realigns the committed category on reveal", () => {
    const { frame, onCommit, render } = renderPager();
    render("ink");
    const writeHeight = vi.spyOn(frame.style, "height", "set");
    panelHeights.ink = 1000;
    act(() => resizeObservers[0]?.trigger());
    pagerWidth = 0;
    act(() => resizeObservers[0]?.trigger());
    act(() => vi.runOnlyPendingTimers());
    expect(writeHeight).not.toHaveBeenCalled();

    pagerWidth = 520;
    offsets = [0, 520, 1040];
    act(() => resizeObservers[0]?.trigger());
    expect(trackLeft(frame.firstElementChild as HTMLElement)).toBe(-520);
    expect(frame.style.height).toBe("600px");
    act(() => vi.runOnlyPendingTimers());
    expect(frame.style.height).toBe("1000px");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("disconnects and cancels pending height work while hidden, then observes again", () => {
    const { frame, render } = renderPager();
    const previousObserver = resizeObservers[0]!;
    const writeHeight = vi.spyOn(frame.style, "height", "set");
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    panelHeights.all = 1200;
    act(() => previousObserver.trigger());
    render("all", false);
    act(() => previousObserver.trigger());
    act(() => vi.runOnlyPendingTimers());

    expect(previousObserver.observed.size).toBe(0);
    expect(writeHeight).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(frame.style.height).toBe("900px");

    render("all", true);
    expect(frame.style.height).toBe("1200px");
    expect(resizeObservers[1]?.observed.has(frame)).toBe(true);
    act(() => resizeObservers[1]?.trigger());
    expect(requestFrame).toHaveBeenCalledOnce();
  });

  it("rejects observer and animation callbacks retained past unmount", () => {
    const { frame, unmount } = renderPager();
    const observer = resizeObservers[0]!;
    const writeHeight = vi.spyOn(frame.style, "height", "set");
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    panelHeights.all = 1200;
    act(() => observer.trigger());
    const staleFrameCallback = requestFrame.mock.calls[0]![0];
    const heightFrameId = requestFrame.mock.results[0]!.value;

    unmount();
    act(() => observer.trigger());
    act(() => staleFrameCallback(performance.now()));
    act(() => vi.runOnlyPendingTimers());

    expect(observer.observed.size).toBe(0);
    // Embla also cancels its own animation token on destroy. The original
    // queued height work must still be cancelled exactly once.
    expect(
      cancelFrame.mock.calls.filter(([id]) => id === heightFrameId),
    ).toHaveLength(1);
    expect(requestFrame).toHaveBeenCalledOnce();
    expect(writeHeight).not.toHaveBeenCalled();
    expect(frame.style.height).toBe("900px");
    expect(vi.getTimerCount()).toBe(0);
  });
});
