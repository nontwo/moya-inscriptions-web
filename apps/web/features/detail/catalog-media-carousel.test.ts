import { describe, expect, it } from "vitest";

import {
  MEDIA_CAROUSEL_AXIS_LOCK_PX,
  MEDIA_CAROUSEL_FLING_PX_PER_MS,
  MEDIA_CAROUSEL_SWIPE_DISTANCE_PX,
  resolveCarouselAxis,
  shouldCommitCarouselSwipe,
} from "./catalog-media-carousel";

describe("CatalogMediaCarousel gesture contract", () => {
  it("locks only after the accepted distance and horizontal ratio", () => {
    expect(resolveCarouselAxis(MEDIA_CAROUSEL_AXIS_LOCK_PX - 1, 0)).toBeNull();
    expect(resolveCarouselAxis(24, 10)).toBe("horizontal");
    expect(resolveCarouselAxis(10, 24)).toBe("vertical");
    expect(resolveCarouselAxis(16, 15)).toBe("vertical");
  });

  it("commits by the accepted distance or fling velocity", () => {
    expect(
      shouldCommitCarouselSwipe(MEDIA_CAROUSEL_SWIPE_DISTANCE_PX, 200, 0),
    ).toBe(true);
    expect(shouldCommitCarouselSwipe(60, 390, 0)).toBe(false);
    expect(shouldCommitCarouselSwipe(70.2, 390, 0)).toBe(true);
    expect(
      shouldCommitCarouselSwipe(12, 390, MEDIA_CAROUSEL_FLING_PX_PER_MS),
    ).toBe(true);
  });
});
