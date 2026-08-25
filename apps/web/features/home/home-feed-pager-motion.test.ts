import { describe, expect, it } from "vitest";

import {
  homePagerProgress,
  isExplicitHorizontalHomeWheel,
  isHomePagerAtIndex,
  resolveHomePagerSettledIndex,
} from "./home-feed-pager-motion";

describe("Home native pager motion", () => {
  it("derives and clamps continuous tab progress from native scroll", () => {
    expect(homePagerProgress(-20, 400, 2)).toBe(0);
    expect(homePagerProgress(200, 400, 2)).toBe(0.5);
    expect(homePagerProgress(1_200, 400, 2)).toBe(2);
    expect(homePagerProgress(50, 0, 2)).toBe(2);
  });

  it("settles a native gesture to at most one adjacent feed", () => {
    expect(resolveHomePagerSettledIndex(0, 2, 390, 400)).toBe(1);
    expect(resolveHomePagerSettledIndex(0, 2, 800, 400)).toBe(1);
    expect(resolveHomePagerSettledIndex(1, 2, 0, 400)).toBe(0);
    expect(resolveHomePagerSettledIndex(1, 2, 800, 400)).toBe(2);
    expect(resolveHomePagerSettledIndex(2, 2, 0, 400)).toBe(1);
  });

  it("allows a tab request to target any valid feed", () => {
    expect(resolveHomePagerSettledIndex(0, 2, 0, 400, 2)).toBe(2);
    expect(resolveHomePagerSettledIndex(2, 2, 800, 400, -1)).toBe(0);
    expect(resolveHomePagerSettledIndex(0, 2, 0, 400, 9)).toBe(2);
  });

  it("recognizes a settled snap point within the pixel tolerance", () => {
    expect(isHomePagerAtIndex(399.4, 400, 1)).toBe(true);
    expect(isHomePagerAtIndex(397, 400, 1)).toBe(false);
  });

  it("accepts only explicit horizontal PC wheel input", () => {
    expect(isExplicitHorizontalHomeWheel(40, 4)).toBe(true);
    expect(isExplicitHorizontalHomeWheel(4, 40)).toBe(false);
    expect(isExplicitHorizontalHomeWheel(40, 38)).toBe(false);
    expect(isExplicitHorizontalHomeWheel(40, 4, true)).toBe(false);
  });
});
