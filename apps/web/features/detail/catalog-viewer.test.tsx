// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CatalogViewer,
  clampViewerTransform,
  resolveViewerAxis,
  shouldCommitViewerSwipe,
  viewerFit,
  viewerPanBounds,
} from "./catalog-viewer";

import type { Root } from "react-dom/client";
import type { MediaId, PublicMedia } from "@moya/contracts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const media = [1, 2, 3].map((index): PublicMedia => ({
  alt: `查看图像 ${index}`,
  height: index === 1 ? 600 : 400,
  id: `media-${index}` as MediaId,
  kind: "image",
  src: `https://example.test/${index}.jpg`,
  width: index === 1 ? 400 : 600,
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

const renderViewer = (properties?: {
  readonly index?: number;
  readonly selectedMedia?: readonly PublicMedia[];
}) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onClose = vi.fn();
  const onIndexChange = vi.fn();
  act(() =>
    root.render(
      <CatalogViewer
        index={properties?.index ?? 0}
        media={properties?.selectedMedia ?? media}
        onClose={onClose}
        onIndexChange={onIndexChange}
        open
        platform="phone"
      />,
    ),
  );
  const viewer = container.querySelector<HTMLDialogElement>(
    "[data-detail-viewer]",
  )!;
  const stage = container.querySelector<HTMLElement>("[data-viewer-scale]")!;
  Object.defineProperties(stage, {
    clientHeight: { configurable: true, value: 600 },
    clientWidth: { configurable: true, value: 400 },
    getBoundingClientRect: {
      configurable: true,
      value: () => ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
      }),
    },
  });
  return { container, onClose, onIndexChange, stage, viewer };
};

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({ matches: false })),
  });
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CatalogViewer geometry", () => {
  it("locks a decisive axis and applies the accepted release threshold", () => {
    expect(resolveViewerAxis(6, 2)).toBeNull();
    expect(resolveViewerAxis(20, 4)).toBe("horizontal");
    expect(resolveViewerAxis(4, 20)).toBe("vertical");
    expect(resolveViewerAxis(20, 18)).toBeNull();
    expect(shouldCommitViewerSwipe(47, 0, 200, 0)).toBe(false);
    expect(shouldCommitViewerSwipe(48, 0, 200, 0)).toBe(true);
    expect(shouldCommitViewerSwipe(4, 0, 300, 0.56)).toBe(true);
    expect(shouldCommitViewerSwipe(60, 80, 200, 1)).toBe(false);
  });

  it("contains media, bounds scale, and clamps pan to the zoomed image", () => {
    const fit = viewerFit(400, 800, 600, 600);
    expect(fit).toMatchObject({ height: 600, width: 300 });
    expect(fit.maxScale).toBe(4);
    expect(viewerPanBounds(fit, 2)).toEqual({ x: 0, y: 300 });
    expect(clampViewerTransform(fit, { scale: 9, x: 500, y: -2_000 })).toEqual({
      scale: 4,
      x: 300,
      y: -900,
    });
  });
});

describe("CatalogViewer", () => {
  it("mounts one full-screen modal without the obsolete visible close button", () => {
    const { container, viewer } = renderViewer();
    expect(viewer.hasAttribute("open")).toBe(true);
    expect(viewer.getAttribute("aria-modal")).toBe("true");
    expect(
      container.querySelectorAll("[data-detail-viewer-image]"),
    ).toHaveLength(1);
    expect(container.textContent).not.toContain("关闭图像查看");
    expect(
      container.querySelectorAll("[data-detail-viewer-index]"),
    ).toHaveLength(1);
  });

  it("keeps single media free of pager controls and reports a truthful failure", () => {
    const { container } = renderViewer({ selectedMedia: media.slice(0, 1) });
    expect(container.querySelector("[data-detail-viewer-index]")).toBeNull();
    const image = container.querySelector<HTMLImageElement>(
      "[data-detail-viewer-image]",
    )!;
    act(() => image.dispatchEvent(new Event("error", { bubbles: true })));
    expect(
      container.querySelector("[data-detail-viewer-media-state='failed']")
        ?.textContent,
    ).toContain("图像无法加载");
    expect(container.querySelector("[data-detail-viewer-image]")).toBeNull();
  });

  it("cancels interrupted paging without changing media or closing", () => {
    const { onClose, onIndexChange, stage } = renderViewer();
    act(() => {
      stage.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 320,
          clientY: 300,
          pointerId: 1,
          timeStamp: 0,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 80,
          clientY: 300,
          pointerId: 1,
          timeStamp: 20,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointercancel", {
          clientX: 80,
          clientY: 300,
          pointerId: 1,
          timeStamp: 30,
        }),
      );
    });
    expect(onIndexChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      stage
        .querySelector("[data-detail-viewer-track]")
        ?.getAttribute("data-dragging"),
    ).toBeNull();
  });

  it("supports pinch zoom, bounded paging, keyboard, and unmoved tap close", () => {
    const { onClose, onIndexChange, stage, viewer } = renderViewer();
    act(() => {
      stage.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 150,
          clientY: 300,
          pointerId: 1,
          timeStamp: 0,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 250,
          clientY: 300,
          pointerId: 2,
          timeStamp: 1,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointermove", {
          clientX: 350,
          clientY: 300,
          pointerId: 2,
          timeStamp: 10,
        }),
      );
    });
    expect(stage.dataset.viewerScale).toBe("zoomed");
    act(() => {
      stage.dispatchEvent(
        pointerEvent("pointerup", {
          clientX: 350,
          clientY: 300,
          pointerId: 2,
          timeStamp: 20,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointerup", {
          clientX: 150,
          clientY: 300,
          pointerId: 1,
          timeStamp: 21,
        }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      viewer.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      );
      vi.advanceTimersByTime(220);
    });
    expect(onIndexChange).toHaveBeenCalledWith(1);

    act(() => {
      stage.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 200,
          clientY: 300,
          pointerId: 3,
          timeStamp: 30,
        }),
      );
      stage.dispatchEvent(
        pointerEvent("pointerup", {
          clientX: 200,
          clientY: 300,
          pointerId: 3,
          timeStamp: 31,
        }),
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
