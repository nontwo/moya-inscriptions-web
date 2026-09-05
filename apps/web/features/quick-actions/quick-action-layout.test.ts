import { describe, expect, it } from "vitest";

import {
  resolveQuickActionCandidate,
  resolveQuickActionLayout,
} from "./quick-action-layout";

const viewport = { height: 844, width: 390 };

describe("quick action adaptive layout", () => {
  it.each([
    [{ x: 24, y: 24 }, "lower-right"],
    [{ x: 366, y: 24 }, "lower-left"],
    [{ x: 24, y: 820 }, "upper-right"],
    [{ x: 366, y: 820 }, "upper-left"],
    [{ x: 195, y: 700 }, "above"],
    [{ x: 195, y: 144 }, "below"],
  ] as const)("keeps the fan visible at %o", (anchor, direction) => {
    const layout = resolveQuickActionLayout(anchor, viewport);

    expect(layout.direction).toBe(direction);
    expect(layout.positions.map(({ action }) => action)).toEqual([
      "like",
      "favorite",
      "share",
    ]);
    for (const position of layout.positions) {
      expect(position.x).toBeGreaterThanOrEqual(48);
      expect(position.x).toBeLessThanOrEqual(342);
      expect(position.y).toBeGreaterThanOrEqual(48);
      expect(position.y).toBeLessThanOrEqual(796);
    }
  });

  it("uses a larger hit area, a center dead zone and hysteresis", () => {
    const layout = resolveQuickActionLayout({ x: 195, y: 500 }, viewport);
    const favorite = layout.positions[1]!;

    expect(layout.hitRadius).toBe(32);
    expect(
      resolveQuickActionCandidate({ x: 195, y: 500 }, layout, "favorite"),
    ).toBeNull();
    expect(
      resolveQuickActionCandidate(
        { x: favorite.x + 20, y: favorite.y },
        layout,
        null,
      ),
    ).toBe("favorite");
    expect(
      resolveQuickActionCandidate(
        { x: favorite.x + 39, y: favorite.y },
        layout,
        "favorite",
      ),
    ).toBe("favorite");
  });
});
