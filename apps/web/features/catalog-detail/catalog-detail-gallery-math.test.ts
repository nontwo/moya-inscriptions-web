import { describe, expect, it } from "vitest";

import { canOpenCatalogMediaFocus } from "./catalog-media-gallery";

import {
  classifyFocusWheel,
  containedImagePanBounds,
  dynamicFocusMaxScale,
  edgeCarouselDelta,
  lockGalleryGestureAxis,
  recentPointerVelocity,
  shouldCommitGallerySwipe,
  shouldSuppressFocusOpen,
  wheelGestureDelta,
  zoomFocusAt,
} from "./catalog-detail-gallery-math";

describe("Catalog detail gallery interaction math", () => {
  it("locks only intentional horizontal or vertical gestures", () => {
    expect(lockGalleryGestureAxis(8, 2)).toBeNull();
    expect(lockGalleryGestureAxis(42, 8)).toBe("horizontal");
    expect(lockGalleryGestureAxis(8, 42)).toBe("vertical");
  });

  it("commits eligible horizontal swipes and rebounds ineligible swipes", () => {
    expect(
      shouldCommitGallerySwipe({
        deltaX: -72,
        deltaY: 4,
        duration: 180,
        index: 0,
        total: 3,
        width: 320,
      }),
    ).toBe(true);
    expect(
      shouldCommitGallerySwipe({
        deltaX: -24,
        deltaY: 4,
        duration: 240,
        index: 0,
        total: 3,
        width: 320,
      }),
    ).toBe(false);
    expect(
      shouldCommitGallerySwipe({
        deltaX: -100,
        deltaY: 4,
        duration: 120,
        index: 2,
        total: 3,
        width: 320,
      }),
    ).toBe(false);
  });

  it("derives pan limits from contained image geometry", () => {
    expect(
      containedImagePanBounds({
        naturalHeight: 1400,
        naturalWidth: 360,
        scale: 2,
        stageHeight: 600,
        stageWidth: 320,
      }),
    ).toMatchObject({
      fitHeight: 600,
      fitWidth: 154.28571428571428,
      maxX: 0,
      maxY: 300,
    });
  });

  it("classifies wheel input and retains trackpad movement for idle settling", () => {
    expect(
      classifyFocusWheel({
        ctrlKey: true,
        deltaMode: 0,
        deltaX: 0,
        deltaY: -2,
        metaKey: false,
        scale: 1,
      }),
    ).toBe("zoom");
    expect(
      classifyFocusWheel({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 12,
        deltaY: 2,
        metaKey: false,
        scale: 1,
      }),
    ).toBe("page");
    expect(
      classifyFocusWheel({
        ctrlKey: false,
        deltaMode: 0,
        deltaX: 2,
        deltaY: 12,
        metaKey: false,
        scale: 2,
      }),
    ).toBe("pan");
    expect(wheelGestureDelta({ deltaMode: 0, deltaX: -32 })).toBe(-32);
    expect(wheelGestureDelta({ deltaMode: 1, deltaX: -2 })).toBe(-32);
  });

  it("keeps the image point under the zoom origin and derives a dynamic max", () => {
    expect(
      dynamicFocusMaxScale({
        naturalHeight: 1200,
        naturalWidth: 1600,
        stageHeight: 400,
        stageWidth: 400,
      }),
    ).toBe(4);
    expect(
      dynamicFocusMaxScale({
        naturalHeight: 4000,
        naturalWidth: 6000,
        stageHeight: 400,
        stageWidth: 400,
      }),
    ).toBe(8);
    expect(
      zoomFocusAt({
        maxScale: 8,
        naturalHeight: 400,
        naturalWidth: 400,
        originX: 300,
        originY: 200,
        panX: 0,
        panY: 0,
        scale: 1,
        stageHeight: 400,
        stageWidth: 400,
        targetScale: 2,
      }),
    ).toEqual({ scale: 2, x: -100, y: 0 });
  });

  it("keeps edge excess for a later commit or rebound instead of paging immediately", () => {
    expect(edgeCarouselDelta({ attemptedPanX: -150, boundedPanX: -120 })).toBe(
      -30,
    );
    expect(edgeCarouselDelta({ attemptedPanX: 90, boundedPanX: 90 })).toBe(0);
    expect(
      shouldCommitGallerySwipe({
        deltaX: -30,
        deltaY: 1,
        duration: 180,
        index: 0,
        total: 3,
        width: 320,
      }),
    ).toBe(false);
    expect(
      shouldCommitGallerySwipe({
        deltaX: -72,
        deltaY: 1,
        duration: 180,
        index: 0,
        total: 3,
        width: 320,
      }),
    ).toBe(true);
  });

  it("uses a recent pointer sample for a flick and total velocity after idle", () => {
    expect(
      recentPointerVelocity({
        currentTime: 110,
        currentX: -80,
        lastTime: 100,
        lastX: -70,
        startTime: 0,
        startX: 0,
      }),
    ).toBe(-1);
    expect(
      recentPointerVelocity({
        currentTime: 200,
        currentX: -80,
        lastTime: 100,
        lastX: -70,
        startTime: 0,
        startX: 0,
      }),
    ).toBe(-0.4);
  });

  it("suppresses the synthetic reopen click immediately after closing the viewer", () => {
    expect(shouldSuppressFocusOpen(1000, 1200)).toBe(true);
    expect(shouldSuppressFocusOpen(1000, 1350)).toBe(false);
  });

  it("does not open the Focus Viewer for failed Public media", () => {
    expect(canOpenCatalogMediaFocus(true)).toBe(false);
    expect(canOpenCatalogMediaFocus(false)).toBe(true);
  });
});
