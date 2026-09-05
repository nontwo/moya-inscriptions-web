// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogMasonry } from "./catalog-masonry";

import type { Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const observers: TestResizeObserver[] = [];
let measurable = true;
let containerWidth = 600;
let heights: Record<string, number>;

class TestResizeObserver implements ResizeObserver {
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  trigger() {
    this.callback([], this);
  }
}

const renderMasonry = (initialItems = ["a", "b", "c", "d"]) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const renderItem = vi.fn((item: string, onMediaSettled: () => void) => (
    <button data-test-card={item} onClick={onMediaSettled} type="button">
      {item}
    </button>
  ));
  const render = (items = initialItems) => {
    act(() => {
      root.render(
        <CatalogMasonry
          feedLayout="double"
          getKey={(item) => item}
          items={items}
          platform="phone"
          renderItem={renderItem}
        />,
      );
    });
  };
  render();
  const masonry = container.querySelector<HTMLElement>("[data-home-masonry]")!;
  const unmount = () => {
    roots.splice(roots.indexOf(root), 1);
    act(() => root.unmount());
  };
  return { container, masonry, render, renderItem, unmount };
};

describe("CatalogMasonry measurement lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    measurable = true;
    containerWidth = 600;
    heights = { a: 100, b: 200, c: 150, d: 180, e: 240 };
    observers.length = 0;
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const item =
          this.querySelector<HTMLElement>("[data-test-card]")?.dataset.testCard;
        const width = measurable
          ? this.hasAttribute("data-home-masonry")
            ? containerWidth
            : Number.parseFloat(this.style.width) || 0
          : 0;
        const height =
          measurable && this.hasAttribute("data-home-masonry-item")
            ? (heights[item ?? ""] ?? 0)
            : 0;
        return {
          x: 0,
          y: 0,
          width,
          height,
          top: 0,
          left: 0,
          right: width,
          bottom: height,
          toJSON: () => ({}),
        };
      },
    );
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    );
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) =>
      window.clearTimeout(id),
    );
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("does not replace a measured layout with zero-height items during a hidden rerender", () => {
    const { masonry, render } = renderMasonry();
    expect(masonry.style.height).toBe("392px");
    const positions = Array.from(masonry.children, (item) =>
      item.getAttribute("style"),
    );

    measurable = false;
    render();
    act(() => observers[0]?.trigger());

    expect(masonry.style.height).toBe("392px");
    expect(
      Array.from(masonry.children, (item) => item.getAttribute("style")),
    ).toEqual(positions);
  });

  it("remeasures changed content after a same-width reveal without a parent rerender", () => {
    const { masonry, render } = renderMasonry();
    measurable = false;
    render();
    act(() => observers[0]?.trigger());
    heights.d = 300;

    measurable = true;
    act(() => observers[0]?.trigger());

    expect(masonry.style.height).toBe("512px");
    expect(masonry.dataset.layoutReady).toBe("true");
  });

  it("remeasures media settled while hidden even when reveal keeps the same width", () => {
    const { container, masonry } = renderMasonry();
    measurable = false;
    act(() => observers[0]?.trigger());
    heights.d = 300;
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-test-card="d"]')!
        .click(),
    );
    act(() => vi.runOnlyPendingTimers());
    expect(masonry.style.height).toBe("392px");

    measurable = true;
    act(() => observers[0]?.trigger());
    expect(masonry.style.height).toBe("512px");
  });

  it("does not rerender or keep scheduling for repeated unchanged observer measurements", () => {
    const { masonry, renderItem } = renderMasonry();
    renderItem.mockClear();
    act(() => observers[0]?.trigger());
    act(() => observers[0]?.trigger());
    act(() => observers[0]?.trigger());

    expect(renderItem).not.toHaveBeenCalled();
    expect(masonry.style.height).toBe("392px");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects observer callbacks and pending media work after unmount", () => {
    const { container, masonry, renderItem, unmount } = renderMasonry();
    const observer = observers[0]!;
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-test-card="d"]')!
        .click(),
    );
    unmount();
    renderItem.mockClear();
    const measure = vi.spyOn(masonry, "getBoundingClientRect");
    measure.mockClear();
    containerWidth = 800;
    act(() => observer.trigger());
    act(() => vi.runOnlyPendingTimers());

    expect(observer.disconnected).toBe(true);
    expect(measure).not.toHaveBeenCalled();
    expect(renderItem).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the new width and pending item set after hidden resize", () => {
    const { masonry, render } = renderMasonry();
    measurable = false;
    containerWidth = 420;
    render(["a", "b", "e"]);
    act(() => observers[0]?.trigger());

    measurable = true;
    act(() => observers[0]?.trigger());

    expect(masonry.style.height).toBe("352px");
    expect(masonry.children).toHaveLength(3);
    expect((masonry.children[0] as HTMLElement).style.width).toBe("204px");
    expect(masonry.dataset.layoutReady).toBe("true");
  });

  it("measures an initially hidden list on first reveal", () => {
    measurable = false;
    const { masonry } = renderMasonry();
    expect(masonry.dataset.layoutReady).toBe("false");

    measurable = true;
    act(() => observers[0]?.trigger());

    expect(masonry.style.height).toBe("392px");
    expect(masonry.dataset.layoutReady).toBe("true");
  });

  it("keeps visible media and empty-list updates working", () => {
    const { container, masonry, render } = renderMasonry();
    heights.d = 300;
    act(() =>
      container
        .querySelector<HTMLButtonElement>('[data-test-card="d"]')!
        .click(),
    );
    act(() => vi.runOnlyPendingTimers());
    expect(masonry.style.height).toBe("512px");

    render([]);
    expect(masonry.children).toHaveLength(0);
    expect(masonry.style.height).toBe("0px");
    expect(masonry.dataset.layoutReady).toBe("true");
  });
});
