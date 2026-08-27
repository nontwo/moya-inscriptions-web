import { describe, expect, it } from "vitest";

import {
  layoutHomeMasonry,
  resolveHomeMasonryColumns,
} from "./catalog-masonry-layout";

describe("resolveHomeMasonryColumns", () => {
  it.each(["phone", "tablet"] as const)(
    "uses the explicit Home preference on %s",
    (platform) => {
      expect(resolveHomeMasonryColumns(900, 20, platform, "single")).toBe(1);
      expect(resolveHomeMasonryColumns(900, 20, platform, "double")).toBe(2);
    },
  );

  it("ignores the Home preference and adapts PC from three to eight columns", () => {
    expect(resolveHomeMasonryColumns(600, 20, "pc", "single")).toBe(3);
    expect(resolveHomeMasonryColumns(1_024, 20, "pc", "single")).toBe(4);
    expect(resolveHomeMasonryColumns(1_440, 20, "pc", "double")).toBe(6);
    expect(resolveHomeMasonryColumns(3_000, 20, "pc", "double")).toBe(8);
  });
});

describe("layoutHomeMasonry", () => {
  it("places normal cards deterministically into the shortest column", () => {
    const result = layoutHomeMasonry(
      [{ height: 100 }, { height: 80 }, { height: 120 }],
      220,
      2,
      20,
    );

    expect(result.positions).toEqual([
      { height: 100, width: 100, x: 0, y: 0 },
      { height: 80, width: 100, x: 120, y: 0 },
      { height: 120, width: 100, x: 120, y: 100 },
    ]);
    expect(result.height).toBe(220);
    expect(
      layoutHomeMasonry(
        [{ height: 100 }, { height: 80 }, { height: 120 }],
        220,
        2,
        20,
      ),
    ).toEqual(result);
  });

  it("spans the full width and resets every column below the spanning card", () => {
    const result = layoutHomeMasonry(
      [
        { height: 100 },
        { height: 80 },
        { height: 50, spanAll: true },
        { height: 40 },
      ],
      220,
      2,
      20,
    );

    expect(result.positions).toEqual([
      { height: 100, width: 100, x: 0, y: 0 },
      { height: 80, width: 100, x: 120, y: 0 },
      { height: 50, width: 220, x: 0, y: 120 },
      { height: 40, width: 100, x: 0, y: 190 },
    ]);
    expect(result.height).toBe(230);
  });

  it("never places a card outside the measured container", () => {
    const width = 760;
    const result = layoutHomeMasonry(
      Array.from({ length: 18 }, (_, index) => ({
        height: 80 + ((index * 47) % 190),
      })),
      width,
      3,
      20,
    );

    for (const position of result.positions) {
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x + position.width).toBeLessThanOrEqual(width);
      expect(position.y).toBeGreaterThanOrEqual(0);
    }

    for (let left = 0; left < result.positions.length; left += 1) {
      for (let right = left + 1; right < result.positions.length; right += 1) {
        const a = result.positions[left]!;
        const b = result.positions[right]!;
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlaps).toBe(false);
      }
    }
  });
});
