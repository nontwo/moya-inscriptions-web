import { describe, expect, it } from "vitest";

import {
  horizontalPagerProgress,
  isExplicitHorizontalWheel,
  isHorizontalPagerAtOffset,
  resolveHorizontalPagerSettledIndex,
} from "./horizontal-pager-motion";

describe("shared horizontal pager motion over arbitrary panel counts", () => {
  const fourOffsets = [0, 375, 750, 1125];

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
