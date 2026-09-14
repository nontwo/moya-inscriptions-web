// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogMediaCarousel } from "./catalog-media-carousel";
import { CatalogViewer } from "./catalog-viewer";

import type { Root } from "react-dom/client";
import type { DetailMediaPresentation } from "./catalog-detail-presentation";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const itemId = (digit: string) => `item-${digit.repeat(32)}`;
const media: DetailMediaPresentation[] = [
  {
    id: itemId("a"),
    src: `/api/community/publishing/media/${itemId("a")}/display/base`,
    alt: "实况作品",
    width: 400,
    height: 300,
    live: {
      motionSrc: `/api/community/publishing/media/${itemId("a")}/motion/base`,
      hasAudio: true,
    },
  },
  {
    id: itemId("b"),
    src: `/api/community/publishing/media/${itemId("b")}/display/base`,
    alt: "静态作品",
    width: 400,
    height: 300,
  },
  {
    id: itemId("c"),
    src: `/api/community/publishing/media/${itemId("c")}/display/base`,
    alt: "第二张实况",
    width: 400,
    height: 300,
    live: {
      motionSrc: `/api/community/publishing/media/${itemId("c")}/motion/base`,
      hasAudio: false,
    },
  },
];

const roots: Root[] = [];
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

const pointerEvent = (type: string, properties: Record<string, number>) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({
    button: 0,
    isPrimary: true,
    ...properties,
  }))
    Object.defineProperty(event, key, { configurable: true, value });
  return event;
};

const mount = () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  return { container, root };
};

beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  Object.defineProperties(HTMLMediaElement.prototype, {
    play: { configurable: true, value: play },
    pause: { configurable: true, value: pause },
    load: { configurable: true, value: vi.fn() },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Live media in the Detail carousel", () => {
  const renderCarousel = (activeIndex: number, motionSuspended = false) => {
    const { container, root } = mount();
    const onOpenViewer = vi.fn();
    const onActiveIndexChange = vi.fn();
    const draw = (index: number, suspended: boolean) =>
      act(() =>
        root.render(
          <CatalogMediaCarousel
            activeIndex={index}
            media={media}
            motionSuspended={suspended}
            onActiveIndexChange={onActiveIndexChange}
            onOpenViewer={onOpenViewer}
            platform="phone"
          />,
        ),
      );
    draw(activeIndex, motionSuspended);
    const stage = container.querySelector<HTMLElement>(
      "[data-detail-main-stage]",
    )!;
    Object.defineProperty(stage, "clientWidth", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 300 }),
    });
    const slide = (id: string) =>
      container.querySelector<HTMLElement>(`[data-media-id="${id}"]`)!;
    return {
      container,
      draw,
      onActiveIndexChange,
      onOpenViewer,
      slide,
      stage,
    };
  };

  it("shows the explicit control on Live slides only and loads only the active motion", async () => {
    const view = renderCarousel(0);
    const live = view.slide(itemId("a"));
    const still = view.slide(itemId("b"));
    expect(live.querySelector("[data-live-photo-play]")?.textContent).toBe(
      "播放实况",
    );
    expect(still.querySelector("[data-live-photo]")).toBeNull();
    // An inactive Live slide keeps its still and owns no video element.
    expect(
      view.slide(itemId("c")).querySelector("[data-live-video]"),
    ).toBeNull();
    expect(view.container.querySelectorAll("[data-live-video]")).toHaveLength(
      1,
    );

    await act(async () =>
      live.querySelector<HTMLButtonElement>("[data-live-photo-play]")!.click(),
    );
    expect(play).toHaveBeenCalledOnce();
    expect(live.querySelector("[data-live-video]")?.getAttribute("src")).toBe(
      media[0]!.live!.motionSrc,
    );
    // Playing never opens the Viewer; the still's own button still does.
    expect(view.onOpenViewer).not.toHaveBeenCalled();
  });

  it("stops the motion when the slide stops being active or the Viewer covers it", async () => {
    const view = renderCarousel(0);
    const live = view.slide(itemId("a"));
    await act(async () =>
      live.querySelector<HTMLButtonElement>("[data-live-photo-play]")!.click(),
    );
    const video = live.querySelector<HTMLVideoElement>("[data-live-video]")!;
    view.draw(0, true);
    expect(pause).toHaveBeenCalled();
    expect(video.hasAttribute("src")).toBe(false);
    expect(live.querySelector("[data-live-video]")).toBeNull();

    view.draw(0, false);
    await act(async () =>
      live.querySelector<HTMLButtonElement>("[data-live-photo-play]")!.click(),
    );
    const next = live.querySelector<HTMLVideoElement>("[data-live-video]")!;
    expect(next.hasAttribute("src")).toBe(true);
    view.draw(1, false);
    expect(next.hasAttribute("src")).toBe(false);
    expect(view.container.querySelector("[data-live-video]")).toBeNull();
  });

  it("keeps swipes working and ignores pointers that start on the Live control", () => {
    const view = renderCarousel(0);
    const control = view
      .slide(itemId("a"))
      .querySelector("[data-live-photo-play]")!;
    act(() => {
      control.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 180,
          clientY: 80,
          pointerId: 1,
        }),
      );
      view.stage.dispatchEvent(
        pointerEvent("pointermove", { clientX: 90, clientY: 82, pointerId: 1 }),
      );
      view.stage.dispatchEvent(
        pointerEvent("pointerup", { clientX: 90, clientY: 82, pointerId: 1 }),
      );
    });
    expect(view.onActiveIndexChange).not.toHaveBeenCalled();

    const image = view.slide(itemId("a")).querySelector("img")!;
    act(() => {
      image.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 180,
          clientY: 80,
          pointerId: 2,
        }),
      );
      view.stage.dispatchEvent(
        pointerEvent("pointermove", { clientX: 90, clientY: 82, pointerId: 2 }),
      );
      view.stage.dispatchEvent(
        pointerEvent("pointerup", { clientX: 90, clientY: 82, pointerId: 2 }),
      );
    });
    expect(view.onActiveIndexChange).toHaveBeenCalledExactlyOnceWith(1);
  });
});

describe("Live media in the Viewer", () => {
  const renderViewer = (index: number, open = true) => {
    const { container, root } = mount();
    const onClose = vi.fn();
    const draw = (nextIndex: number, nextOpen: boolean) =>
      act(() =>
        root.render(
          <CatalogViewer
            index={nextIndex}
            media={media}
            onClose={onClose}
            onIndexChange={vi.fn()}
            open={nextOpen}
            platform="phone"
          />,
        ),
      );
    draw(index, open);
    return { container, draw, onClose };
  };

  it("offers the control on the current item only and never touches peers' motion", () => {
    const view = renderViewer(1);
    // Peers (both Live) show stills; the current static item has no control.
    expect(view.container.querySelectorAll("[data-live-video]")).toHaveLength(
      0,
    );
    view.draw(0, true);
    expect(view.container.querySelectorAll("[data-live-video]")).toHaveLength(
      1,
    );
    const current = view.container.querySelector("[data-detail-viewer-image]")!;
    expect(current.closest("[data-live-photo]")).not.toBeNull();
  });

  it("plays from the control without closing the Viewer and stops when the Viewer closes", async () => {
    const view = renderViewer(0);
    const stage = view.container.querySelector<HTMLElement>(
      "[data-viewer-scale]",
    )!;
    const control = view.container.querySelector<HTMLButtonElement>(
      "[data-viewer-scale] [data-live-photo-play]",
    )!;
    expect(control.closest("[data-detail-viewer-control]")).not.toBeNull();
    act(() => {
      control.dispatchEvent(
        pointerEvent("pointerdown", { clientX: 20, clientY: 20, pointerId: 1 }),
      );
      stage.dispatchEvent(
        pointerEvent("pointerup", { clientX: 20, clientY: 20, pointerId: 1 }),
      );
    });
    await act(async () => control.click());
    expect(view.onClose).not.toHaveBeenCalled();
    const video =
      view.container.querySelector<HTMLVideoElement>("[data-live-video]")!;
    expect(video.getAttribute("src")).toBe(media[0]!.live!.motionSrc);
    expect(video.muted).toBe(true);

    view.draw(0, false);
    expect(pause).toHaveBeenCalled();
    expect(video.hasAttribute("src")).toBe(false);
    expect(view.container.querySelector("[data-live-video]")).toBeNull();
  });
});
