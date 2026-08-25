// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeFeedPager } from "./home-feed-pager";

import type { Root } from "react-dom/client";
import type { HomeFeed } from "./home-feed";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

const renderPager = (
  onCommit = vi.fn<(feed: HomeFeed) => void>(),
  platform: "phone" | "tablet" | "pc" = "phone",
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <HomeFeedPager
        activeFeed="discover"
        onCommit={onCommit}
        panels={{
          discover: <button type="button">Discover action</button>,
          nearby: <p>Nearby panel</p>,
          topics: <p>Topics panel</p>,
        }}
        platform={platform}
      />,
    );
  });
  const frame = container.querySelector<HTMLElement>("[data-home-feed-pager]")!;
  Object.defineProperty(frame, "clientWidth", {
    configurable: true,
    value: 400,
  });
  Object.defineProperty(frame, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  return { container, frame, onCommit };
};

const dispatchPointer = (
  target: HTMLElement,
  type: string,
  clientX: number,
  clientY: number,
  timeStamp: number,
  pointerId = 1,
  isPrimary = true,
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperties(event, {
    isPrimary: { value: isPrimary },
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
    timeStamp: { value: timeStamp },
  });
  act(() => target.dispatchEvent(event));
  return event;
};

describe("HomeFeedPager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
      value: vi.fn(() => ({ matches: false })),
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

  it("follows only the Home content after horizontal lock and commits once after release", () => {
    const { container, frame, onCommit } = renderPager();
    const track = container.querySelector<HTMLElement>(
      "[data-home-feed-track]",
    )!;
    const discover = container.querySelector<HTMLElement>(
      '[data-home-feed-panel="discover"]',
    )!;
    const focus = container.querySelector<HTMLButtonElement>("button")!;
    const activation = vi.fn();
    focus.addEventListener("click", activation);
    focus.focus();
    const historyBefore = window.history.state;
    const urlBefore = window.location.href;

    dispatchPointer(frame, "pointerdown", 320, 100, 10);
    dispatchPointer(frame, "pointermove", 120, 104, 110);

    expect(frame.dataset.homePagerFollowing).toBe("true");
    expect(discover.getAttribute("aria-hidden")).toBe("false");
    expect(discover.hasAttribute("hidden")).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
    expect(window.history.state).toBe(historyBefore);
    expect(window.location.href).toBe(urlBefore);
    expect(document.activeElement).toBe(focus);
    expect(track.style.transform).toContain("-200px");

    dispatchPointer(frame, "pointerup", 120, 104, 130);
    expect(onCommit).not.toHaveBeenCalled();
    act(() => focus.click());
    expect(activation).not.toHaveBeenCalled();
    act(() => focus.click());
    expect(activation).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(380));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });

  it("prepares the accepted neighboring track on pointerdown before movement", () => {
    const { container, frame, onCommit } = renderPager();
    const nearby = container.querySelector<HTMLElement>(
      '[data-home-feed-panel="nearby"]',
    )!;
    const topics = container.querySelector<HTMLElement>(
      '[data-home-feed-panel="topics"]',
    )!;

    dispatchPointer(frame, "pointerdown", 320, 100, 10);

    expect(frame.dataset.homePagerFollowing).toBe("true");
    expect(nearby.hasAttribute("hidden")).toBe(false);
    expect(topics.hasAttribute("hidden")).toBe(false);
    expect(nearby.hasAttribute("inert")).toBe(true);
    expect(topics.hasAttribute("inert")).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();

    dispatchPointer(frame, "pointerup", 320, 100, 20);
    expect(frame.dataset.homePagerFollowing).toBe("false");
    expect(nearby.hasAttribute("hidden")).toBe(true);
    expect(topics.hasAttribute("hidden")).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("keeps tracking touch move and release after the pointer leaves the pager", () => {
    const { frame, onCommit } = renderPager();

    dispatchPointer(frame, "pointerdown", 320, 100, 10);
    dispatchPointer(document.body, "pointermove", 120, 102, 110);

    expect(frame.dataset.homePagerFollowing).toBe("true");
    expect(onCommit).not.toHaveBeenCalled();

    dispatchPointer(document.body, "pointerup", 120, 102, 130);
    act(() => vi.advanceTimersByTime(380));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });

  it.each(["pointercancel", "lostpointercapture"])(
    "rebounds with zero commit on %s",
    (eventType) => {
      const { frame, onCommit } = renderPager();
      dispatchPointer(frame, "pointerdown", 320, 100, 10);
      dispatchPointer(frame, "pointermove", 120, 102, 100);
      act(() => frame.dispatchEvent(new Event(eventType, { bubbles: true })));
      act(() => vi.runAllTimers());
      expect(onCommit).not.toHaveBeenCalled();
      expect(frame.dataset.homePagerFollowing).toBe("false");
    },
  );

  it("interrupts on a second pointer outside the pager and cleans tracking", () => {
    const { frame, onCommit } = renderPager();
    dispatchPointer(frame, "pointerdown", 320, 100, 10);
    dispatchPointer(document.body, "pointermove", 220, 102, 20);
    expect(frame.dataset.homePagerFollowing).toBe("true");

    dispatchPointer(document.body, "pointerdown", 300, 100, 30, 2, false);
    act(() => vi.runAllTimers());
    dispatchPointer(document.body, "pointermove", 100, 102, 40);
    dispatchPointer(document.body, "pointerup", 100, 102, 50);
    act(() => vi.runAllTimers());
    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.dataset.homePagerFollowing).toBe("false");

    dispatchPointer(frame, "pointerdown", 320, 100, 500, 3);
    dispatchPointer(document.body, "pointermove", 120, 102, 580, 3);
    dispatchPointer(document.body, "pointerup", 120, 102, 600, 3);
    act(() => vi.advanceTimersByTime(380));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });

  it("leaves diagonal input native", () => {
    const { frame, onCommit } = renderPager();
    dispatchPointer(frame, "pointerdown", 320, 100, 500);
    const diagonal = dispatchPointer(frame, "pointermove", 270, 52, 550);
    dispatchPointer(frame, "pointerup", 270, 52, 570);
    expect(diagonal.defaultPrevented).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("ignores a new swipe while cancellation is rebounding", () => {
    const { frame, onCommit } = renderPager();
    dispatchPointer(frame, "pointerdown", 320, 100, 10);
    dispatchPointer(document.body, "pointermove", 220, 102, 30);
    act(() =>
      window.dispatchEvent(new Event("pointercancel", { bubbles: true })),
    );

    dispatchPointer(frame, "pointerdown", 320, 100, 40, 2);
    dispatchPointer(document.body, "pointermove", 120, 102, 80, 2);
    dispatchPointer(document.body, "pointerup", 120, 102, 100, 2);
    act(() => vi.runAllTimers());

    expect(onCommit).not.toHaveBeenCalled();
    expect(frame.dataset.homePagerFollowing).toBe("false");
  });

  it("ignores a new swipe while a release is settling", () => {
    const { frame, onCommit } = renderPager();
    dispatchPointer(frame, "pointerdown", 320, 100, 10);
    dispatchPointer(document.body, "pointermove", 120, 102, 90);
    dispatchPointer(document.body, "pointerup", 120, 102, 110);

    dispatchPointer(frame, "pointerdown", 320, 100, 120, 2);
    dispatchPointer(document.body, "pointermove", 120, 102, 160, 2);
    dispatchPointer(document.body, "pointerup", 120, 102, 180, 2);
    act(() => vi.runAllTimers());

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
    expect(frame.dataset.homePagerFollowing).toBe("false");
  });

  it("settles immediately under reduced motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    const { frame, onCommit } = renderPager();
    dispatchPointer(frame, "pointerdown", 320, 100, 10);
    dispatchPointer(frame, "pointermove", 120, 100, 100);
    dispatchPointer(frame, "pointerup", 120, 100, 120);
    expect(onCommit).toHaveBeenCalledOnce();
    expect(frame.dataset.homePagerFollowing).toBe("false");
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
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("nearby");
  });
});
