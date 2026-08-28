// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogDetailExperience } from "./catalog-detail-experience";

import type { Root } from "react-dom/client";
import type { MediaId } from "@moya/contracts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

describe("CatalogDetailExperience", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves the desired Detail scroll through a temporary viewport clamp", () => {
    let notifyResize: ResizeObserverCallback | undefined;
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = callback;
      }

      disconnect() {}
      observe() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    let frameId = 0;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) =>
      frames.delete(id),
    );
    const flushFrames = () => {
      act(() => {
        while (frames.size > 0) {
          const pending = [...frames.values()];
          frames.clear();
          for (const callback of pending) callback(0);
        }
      });
    };
    const onScrollTopChange = vi.fn();
    const properties = {
      activeViewerMediaId: null,
      backButtonRef: createRef<HTMLButtonElement>(),
      catalogId: "catalog-detail",
      initialScrollTop: 0,
      onBack: vi.fn(),
      onCloseViewer: vi.fn(),
      onOpenViewer: vi.fn(),
      onScrollTopChange,
      onViewerMediaChange: vi.fn(),
      platform: "tablet" as const,
      state: { state: "loading" as const },
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() =>
      root.render(
        <CatalogDetailExperience {...properties} orientation="landscape" />,
      ),
    );
    const scroller = container.querySelector<HTMLElement>(
      "[data-detail-scroll]",
    );
    if (scroller === null) throw new Error("Missing Detail scroll container");
    scroller.scrollTop = 180;
    act(() => scroller.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(onScrollTopChange).toHaveBeenLastCalledWith(180);
    flushFrames();

    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 834 },
      scrollHeight: { configurable: true, value: 970 },
    });
    act(() => notifyResize?.([], {} as ResizeObserver));
    scroller.scrollTop = 136;
    act(() => scroller.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(onScrollTopChange).not.toHaveBeenCalledWith(136);

    Object.defineProperties(scroller, {
      clientHeight: { configurable: true, value: 834 },
      scrollHeight: { configurable: true, value: 1258 },
    });
    act(() => notifyResize?.([], {} as ResizeObserver));
    scroller.scrollTop = 167;
    act(() => scroller.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(onScrollTopChange).not.toHaveBeenCalledWith(167);
    flushFrames();

    expect(scroller.scrollTop).toBe(180);

    const pointerEvent = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperties(event, {
        clientX: { value: x },
        clientY: { value: y },
        isPrimary: { value: true },
        pointerId: { value: 1 },
      });
      return event;
    };
    act(() => {
      scroller.dispatchEvent(pointerEvent("pointerdown", 30, 120));
      scroller.dispatchEvent(pointerEvent("pointermove", 32, 90));
      scroller.scrollTop = 120;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    expect(onScrollTopChange).toHaveBeenLastCalledWith(120);
  });

  it("opens the exact media and restores Detail scroll and current image focus", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(performance.now());
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    const onOpenViewer = vi.fn();
    const onCloseViewer = vi.fn();
    const state = {
      detail: {
        aliases: [],
        facts: [],
        id: "catalog-detail",
        kind: "inscription" as const,
        media: [
          {
            alt: "详情图像",
            height: 600,
            id: "media-one" as MediaId,
            kind: "image" as const,
            src: "https://example.test/media-one.jpg",
            width: 400,
          },
        ],
        source: "qa" as const,
        sourceCitations: [],
        title: "资料",
      },
      state: "loaded" as const,
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const render = (activeViewerMediaId: string | null) =>
      root.render(
        <CatalogDetailExperience
          activeViewerMediaId={activeViewerMediaId}
          backButtonRef={createRef<HTMLButtonElement>()}
          catalogId="catalog-detail"
          initialScrollTop={0}
          onBack={vi.fn()}
          onCloseViewer={onCloseViewer}
          onOpenViewer={onOpenViewer}
          onScrollTopChange={vi.fn()}
          onViewerMediaChange={vi.fn()}
          orientation="portrait"
          platform="phone"
          state={state}
        />,
      );
    act(() => render(null));
    const scroller = container.querySelector<HTMLElement>(
      "[data-detail-scroll]",
    )!;
    scroller.scrollTop = 90;
    const opener = container.querySelector<HTMLButtonElement>(
      "[data-detail-main-image]",
    )!;
    act(() => opener.click());
    expect(onOpenViewer).toHaveBeenCalledWith("media-one");

    act(() => render("media-one"));
    expect(
      container.querySelector("[data-detail-viewer]")?.hasAttribute("open"),
    ).toBe(true);
    scroller.scrollTop = 0;
    act(() => render(null));
    expect(scroller.scrollTop).toBe(90);
    expect(document.activeElement).toBe(opener);
  });

  it("rejects a direct media identifier outside the loaded Catalog", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    const onCloseViewer = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() =>
      root.render(
        <CatalogDetailExperience
          activeViewerMediaId="foreign-media"
          backButtonRef={createRef<HTMLButtonElement>()}
          catalogId="catalog-detail"
          initialScrollTop={0}
          onBack={vi.fn()}
          onCloseViewer={onCloseViewer}
          onOpenViewer={vi.fn()}
          onScrollTopChange={vi.fn()}
          onViewerMediaChange={vi.fn()}
          orientation="portrait"
          platform="phone"
          state={{
            detail: {
              aliases: [],
              facts: [],
              id: "catalog-detail",
              kind: "inscription",
              media: [],
              source: "qa",
              sourceCitations: [],
              title: "资料",
            },
            state: "loaded",
          }}
        />,
      ),
    );
    expect(onCloseViewer).toHaveBeenCalledOnce();
  });
});
