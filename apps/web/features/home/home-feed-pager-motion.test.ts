import { describe, expect, it } from "vitest";

import {
  HOME_PAGER_AXIS_LOCK_PX,
  HOME_PAGER_DISTANCE_RATIO,
  isExplicitHorizontalHomeWheel,
  resistHomePagerEdge,
  resolveHomePagerAxis,
  resolveHomePagerTarget,
} from "./home-feed-pager-motion";

describe("Home internal pager motion", () => {
  it("waits for the intent threshold and rejects diagonal input", () => {
    expect(resolveHomePagerAxis(HOME_PAGER_AXIS_LOCK_PX - 1, 0)).toBeNull();
    expect(resolveHomePagerAxis(18, 4)).toBe("horizontal");
    expect(resolveHomePagerAxis(4, 18)).toBe("vertical");
    expect(resolveHomePagerAxis(18, 17)).toBeNull();
  });

  it("uses edge resistance only beyond the first and last feed", () => {
    expect(resistHomePagerEdge(100, 0, 2)).toBe(25);
    expect(resistHomePagerEdge(-100, 2, 2)).toBe(-25);
    expect(resistHomePagerEdge(-100, 0, 2)).toBe(-100);
    expect(resistHomePagerEdge(100, 1, 2)).toBe(100);
  });

  it("commits at most one adjacent feed by distance or matching velocity", () => {
    const width = 400;
    const qualified = width * HOME_PAGER_DISTANCE_RATIO;
    expect(resolveHomePagerTarget(1, 2, -qualified, width, 0)).toBe(2);
    expect(resolveHomePagerTarget(1, 2, qualified, width, 0)).toBe(0);
    expect(resolveHomePagerTarget(1, 2, -20, width, -0.8)).toBe(2);
    expect(resolveHomePagerTarget(1, 2, -20, width, 0.8)).toBe(1);
    expect(resolveHomePagerTarget(0, 2, qualified, width, 0)).toBe(0);
    expect(resolveHomePagerTarget(2, 2, -qualified, width, 0)).toBe(2);
  });

  it("accepts only explicit horizontal PC wheel input", () => {
    expect(isExplicitHorizontalHomeWheel(40, 4)).toBe(true);
    expect(isExplicitHorizontalHomeWheel(4, 40)).toBe(false);
    expect(isExplicitHorizontalHomeWheel(40, 38)).toBe(false);
    expect(isExplicitHorizontalHomeWheel(40, 4, true)).toBe(false);
  });
});
