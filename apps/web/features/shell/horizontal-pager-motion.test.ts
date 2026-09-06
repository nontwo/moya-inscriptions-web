import { describe, expect, it } from "vitest";

import {
  horizontalPagerProgress,
  isExplicitHorizontalWheel,
  isHorizontalPagerAtOffset,
  resolveHorizontalPagerSettledIndex,
  resolvePagerDirection,
  resolvePagerRelease,
  pagerSettleProgress,
} from "./horizontal-pager-motion";

describe("shared horizontal pager motion over arbitrary panel counts", () => {
  const fourOffsets = [0, 375, 750, 1125];

  it("requires 12px and strictly dominant horizontal intent, then keeps the chosen axis", () => {
    expect(resolvePagerDirection("pending", 11.9, 0)).toBe("pending");
    expect(resolvePagerDirection("pending", 12, 8)).toBe("pending");
    expect(resolvePagerDirection("pending", 12, 7)).toBe("horizontal");
    expect(resolvePagerDirection("pending", 12, 12)).toBe("vertical");
    expect(resolvePagerDirection("vertical", 200, 20)).toBe("vertical");
    expect(resolvePagerDirection("horizontal", 5, 200)).toBe("horizontal");
  });

  it("uses the nearest page for slow releases and bounds a flick to one adjacent page", () => {
    expect(resolvePagerRelease(500, fourOffsets, 1, 0)).toBe(1);
    expect(resolvePagerRelease(600, fourOffsets, 1, 0)).toBe(2);
    expect(resolvePagerRelease(420, fourOffsets, 1, 0.6)).toBe(2);
    expect(resolvePagerRelease(390, fourOffsets, 1, 0.6)).toBe(1);
    expect(resolvePagerRelease(1000, fourOffsets, 0, 2)).toBe(1);
    expect(resolvePagerRelease(-100, fourOffsets, 0, -2)).toBe(0);
  });

  it("has a monotonic bounded 120ms settle without a second trailing wait", () => {
    expect(pagerSettleProgress(-1)).toBe(0);
    expect(pagerSettleProgress(0)).toBe(0);
    expect(pagerSettleProgress(60)).toBe(0.875);
    expect(pagerSettleProgress(119)).toBeLessThan(1);
    expect(pagerSettleProgress(120)).toBe(1);
    expect(pagerSettleProgress(500)).toBe(1);
  });

  it("reports fractional progress independently of settled indices across four panels", () => {
    expect(horizontalPagerProgress(937.5, fourOffsets)).toBe(2.5);
    expect(resolveHorizontalPagerSettledIndex(1000, fourOffsets)).toBe(3);
    expect(isHorizontalPagerAtOffset(1000, 1125)).toBe(false);
    expect(isHorizontalPagerAtOffset(1124, 1125)).toBe(true);
  });

  it("clamps overscroll instead of wrapping at either edge", () => {
    expect(horizontalPagerProgress(-75, fourOffsets)).toBe(0);
    expect(horizontalPagerProgress(1300, fourOffsets)).toBe(3);
    expect(resolveHorizontalPagerSettledIndex(-20, fourOffsets)).toBe(0);
    expect(resolveHorizontalPagerSettledIndex(1300, fourOffsets)).toBe(3);
  });

  it("uses measured offsets after resize instead of assuming equal viewport arithmetic", () => {
    const resizedOffsets = [0, 389.5, 780, 1170.5];
    expect(horizontalPagerProgress(975.25, resizedOffsets)).toBe(2.5);
    expect(resolveHorizontalPagerSettledIndex(1170, resizedOffsets)).toBe(3);
  });

  it("keeps vertical reading and browser zoom distinct from horizontal input", () => {
    expect(isExplicitHorizontalWheel(2, 180)).toBe(false);
    expect(isExplicitHorizontalWheel(50, 48)).toBe(false);
    expect(isExplicitHorizontalWheel(70, 0, true)).toBe(false);
    expect(isExplicitHorizontalWheel(80, 3)).toBe(true);
  });
});
