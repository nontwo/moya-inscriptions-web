import { describe, expect, it } from "vitest";

import {
  homePagerProgress,
  isExplicitHorizontalHomeWheel,
  isHomePagerAtOffset,
  resolveHomePagerSettledIndex,
} from "./home-feed-pager-motion";

describe("Home native pager motion", () => {
  it("derives and clamps continuous tab progress from native scroll", () => {
    const offsets = [0, 412, 830];
    expect(homePagerProgress(-20, offsets)).toBe(0);
    expect(homePagerProgress(206, offsets)).toBe(0.5);
    expect(homePagerProgress(621, offsets)).toBe(1.5);
    expect(homePagerProgress(1_200, offsets)).toBe(2);
    expect(homePagerProgress(50, [])).toBe(0);
  });

  it("uses the nearest actual panel offset as the settled truth", () => {
    const offsets = [0, 412, 830];
    expect(resolveHomePagerSettledIndex(0, offsets)).toBe(0);
    expect(resolveHomePagerSettledIndex(390, offsets)).toBe(1);
    expect(resolveHomePagerSettledIndex(620, offsets)).toBe(1);
    expect(resolveHomePagerSettledIndex(700, offsets)).toBe(2);
    expect(resolveHomePagerSettledIndex(1_200, offsets)).toBe(2);
  });

  it("recognizes a settled snap point within the pixel tolerance", () => {
    expect(isHomePagerAtOffset(410.2, 412)).toBe(true);
    expect(isHomePagerAtOffset(409, 412)).toBe(false);
  });

  it("accepts only explicit horizontal PC wheel input", () => {
    expect(isExplicitHorizontalHomeWheel(40, 4)).toBe(true);
    expect(isExplicitHorizontalHomeWheel(4, 40)).toBe(false);
    expect(isExplicitHorizontalHomeWheel(40, 38)).toBe(false);
    expect(isExplicitHorizontalHomeWheel(40, 4, true)).toBe(false);
  });
});
