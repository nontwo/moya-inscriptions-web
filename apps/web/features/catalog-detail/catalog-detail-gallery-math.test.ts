import { describe, expect, it } from "vitest";

import {
  containedImagePanBounds,
  lockGalleryGestureAxis,
  shouldCommitGallerySwipe,
  shouldSuppressFocusOpen,
  zoomedEdgePageStep,
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

  it("allows paging only after a zoomed image reaches the appropriate pan edge", () => {
    expect(zoomedEdgePageStep({ deltaX: -30, maxX: 120, panX: -120 })).toBe(1);
    expect(zoomedEdgePageStep({ deltaX: 30, maxX: 120, panX: 120 })).toBe(-1);
    expect(
      zoomedEdgePageStep({ deltaX: -30, maxX: 120, panX: -90 }),
    ).toBeUndefined();
  });

  it("suppresses the synthetic reopen click immediately after closing the viewer", () => {
    expect(shouldSuppressFocusOpen(1000, 1200)).toBe(true);
    expect(shouldSuppressFocusOpen(1000, 1350)).toBe(false);
  });
});
