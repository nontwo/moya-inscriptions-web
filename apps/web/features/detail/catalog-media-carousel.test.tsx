// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CatalogMediaCarousel,
  resolveCarouselAxis,
  shouldCommitCarouselSwipe,
} from "./catalog-media-carousel";

import type { Root } from "react-dom/client";
import type { MediaId, PublicMedia } from "@moya/contracts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const media = [1, 2, 3].map((index): PublicMedia => ({
  alt: `图像 ${index}`,
  height: 600,
  id: `media-${index}` as MediaId,
  kind: "image",
  src: `https://example.test/${index}.jpg`,
  width: 400,
}));
const roots: Root[] = [];

const pointerEvent = (
  type: string,
  properties: Record<string, number | boolean>,
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  return event;
};

const touchEvent = (type: string, activeTouches: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", {
    configurable: true,
    value: Array.from({ length: activeTouches }, () => ({})),
  });
  return event;
};

const renderCarousel = (activeIndex = 0) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onActiveIndexChange = vi.fn();
  const onOpenViewer = vi.fn();
  act(() =>
    root.render(
      <CatalogMediaCarousel
        activeIndex={activeIndex}
        media={media}
        onActiveIndexChange={onActiveIndexChange}
        onOpenViewer={onOpenViewer}
        platform="phone"
      />,
    ),
  );
  const stage = container.querySelector<HTMLElement>(
    "[data-detail-main-stage]",
  )!;
  Object.defineProperty(stage, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width: 300 }),
  });
  Object.defineProperty(stage, "clientWidth", {
    configurable: true,
    value: 300,
  });
  return { container, onActiveIndexChange, onOpenViewer, stage };
};

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe("CatalogMediaCarousel", () => {
  it("keeps the single-media state free of inactive Carousel controls", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    act(() =>
      root.render(
        <CatalogMediaCarousel
          activeIndex={0}
          media={media.slice(0, 1)}
          onActiveIndexChange={vi.fn()}
          onOpenViewer={vi.fn()}
          platform="phone"
        />,
      ),
    );
    expect(container.querySelectorAll("[data-detail-media-dot]")).toHaveLength(
      0,
    );
    expect(container.querySelector("[data-detail-media-index]")).toBeNull();
  });

  it("locks only decisive horizontal gestures and applies the bounded threshold", () => {
    expect(resolveCarouselAxis(6, 2)).toBeNull();
    expect(resolveCarouselAxis(20, 4)).toBe("horizontal");
    expect(resolveCarouselAxis(12, 20)).toBe("vertical");
    expect(shouldCommitCarouselSwipe(47, 200, 0)).toBe(false);
    expect(shouldCommitCarouselSwipe(48, 200, 0)).toBe(true);
    expect(shouldCommitCarouselSwipe(4, 300, 0.56)).toBe(true);
  });

  it("commits one direct swipe, while pointer cancel and lost capture commit zero", () => {
    const { onActiveIndexChange, stage } = renderCarousel();
    act(() => {
      stage.dispatchEvent(
        pointerEvent("pointerdown", {
          button: 0,
          clientX: 180,
          clientY: 80,
          isPrimary: true,
          pointerId: 1,
          timeStamp: 0,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 100,
          clientY: 82,
          pointerId: 1,
          timeStamp: 20,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointerup", {
          clientX: 100,
          clientY: 82,
          pointerId: 1,
          timeStamp: 40,
        }),
      );
    });
    expect(onActiveIndexChange).toHaveBeenCalledOnce();
    expect(onActiveIndexChange).toHaveBeenCalledWith(1);

    onActiveIndexChange.mockClear();
    act(() => {
      stage.dispatchEvent(
        pointerEvent("pointerdown", {
          button: 0,
          clientX: 180,
          clientY: 80,
          isPrimary: true,
          pointerId: 2,
          timeStamp: 50,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 90,
          clientY: 82,
          pointerId: 2,
          timeStamp: 70,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointercancel", { pointerId: 2, timeStamp: 80 }),
      );
      stage.dispatchEvent(
        pointerEvent("lostpointercapture", { pointerId: 2, timeStamp: 81 }),
      );
    });
    expect(onActiveIndexChange).not.toHaveBeenCalled();

    act(() => {
      stage.dispatchEvent(
        pointerEvent("pointerdown", {
          button: 0,
          clientX: 180,
          clientY: 80,
          isPrimary: true,
          pointerId: 3,
          timeStamp: 90,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 90,
          clientY: 82,
          pointerId: 3,
          timeStamp: 110,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("lostpointercapture", {
          pointerId: 3,
          timeStamp: 120,
        }),
      );
    });
    expect(onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("ignores a child capture-transfer loss and commits the pointer swipe", () => {
    const { container, onActiveIndexChange } = renderCarousel();
    const opener = container.querySelector<HTMLButtonElement>(
      "[data-detail-main-image]",
    )!;

    act(() => {
      opener.dispatchEvent(
        pointerEvent("pointerdown", {
          button: 0,
          clientX: 180,
          clientY: 80,
          isPrimary: true,
          pointerId: 4,
          timeStamp: 0,
        }),
      );
      opener.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 150,
          clientY: 82,
          pointerId: 4,
          timeStamp: 10,
        }),
      );
      opener.dispatchEvent(
        pointerEvent("lostpointercapture", {
          clientX: 150,
          clientY: 82,
          pointerId: 4,
          timeStamp: 11,
        }),
      );
      opener.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 100,
          clientY: 82,
          pointerId: 4,
          timeStamp: 20,
        }),
      );
      opener.dispatchEvent(
        pointerEvent("pointerup", {
          clientX: 100,
          clientY: 82,
          pointerId: 4,
          timeStamp: 30,
        }),
      );
    });

    expect(onActiveIndexChange).toHaveBeenCalledOnce();
    expect(onActiveIndexChange).toHaveBeenCalledWith(1);
  });

  it("commits native touch paging only after release and rolls back cancel", () => {
    vi.useFakeTimers();
    const first = renderCarousel();
    expect(first.stage.dataset.nativePaging).toBe("true");

    act(() => {
      first.stage.dispatchEvent(touchEvent("touchstart", 1));
      first.stage.scrollLeft = 300;
      first.stage.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(first.onActiveIndexChange).not.toHaveBeenCalled();

    act(() => {
      first.stage.dispatchEvent(touchEvent("touchend", 0));
      vi.advanceTimersByTime(121);
    });
    expect(first.onActiveIndexChange).toHaveBeenCalledOnce();
    expect(first.onActiveIndexChange).toHaveBeenCalledWith(1);

    const canceled = renderCarousel();
    act(() => {
      canceled.stage.dispatchEvent(touchEvent("touchstart", 1));
      canceled.stage.scrollLeft = 300;
      canceled.stage.dispatchEvent(new Event("scroll", { bubbles: true }));
      canceled.stage.dispatchEvent(touchEvent("touchcancel", 0));
      vi.advanceTimersByTime(500);
    });
    expect(canceled.stage.scrollLeft).toBe(0);
    expect(canceled.onActiveIndexChange).not.toHaveBeenCalled();
  });

  it("opens only the active image and suppresses a drag-generated click", () => {
    const { container, onOpenViewer, stage } = renderCarousel();
    const opener = container.querySelector<HTMLButtonElement>(
      "[data-detail-main-image]",
    )!;
    act(() => opener.click());
    expect(onOpenViewer).toHaveBeenCalledWith(0, opener);
    onOpenViewer.mockClear();

    act(() => {
      stage.dispatchEvent(
        pointerEvent("pointerdown", {
          button: 0,
          clientX: 180,
          clientY: 80,
          isPrimary: true,
          pointerId: 10,
          timeStamp: 0,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 100,
          clientY: 82,
          pointerId: 10,
          timeStamp: 20,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointerup", {
          clientX: 100,
          clientY: 82,
          pointerId: 10,
          timeStamp: 40,
        }),
      );
      opener.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
    });
    expect(onOpenViewer).not.toHaveBeenCalled();

    act(() => opener.click());
    expect(onOpenViewer).toHaveBeenCalledWith(0, opener);
  });

  it("keeps edge controls bounded and exposes dots, counter, and failed media", () => {
    const { container, onActiveIndexChange } = renderCarousel();
    expect(container.querySelectorAll("[data-detail-media-dot]")).toHaveLength(
      3,
    );
    expect(
      container.querySelector("[data-detail-media-index]")?.textContent,
    ).toContain("1 / 3");
    act(() =>
      (
        container.querySelector(
          "[data-detail-media-previous]",
        ) as HTMLButtonElement
      ).click(),
    );
    expect(onActiveIndexChange).not.toHaveBeenCalled();
    act(() =>
      container
        .querySelector("img")
        ?.dispatchEvent(new Event("error", { bubbles: true })),
    );
    expect(
      container.querySelector('[data-detail-media-state="failed"]'),
    ).not.toBeNull();
  });
});
