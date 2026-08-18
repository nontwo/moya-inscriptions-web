import { describe, expect, it } from "vitest";

import { masonryColumnCount } from "./home-masonry";

describe("T02-authoritative Home masonry columns", () => {
  it("preserves the phone and tablet single/double preference", () => {
    expect(
      masonryColumnCount({
        width: 390,
        gap: 8,
        desktop: false,
        layout: "single",
      }),
    ).toBe(1);
    expect(
      masonryColumnCount({
        width: 390,
        gap: 8,
        desktop: false,
        layout: "double",
      }),
    ).toBe(2);
    expect(
      masonryColumnCount({
        width: 834,
        gap: 12,
        desktop: false,
        layout: "double",
      }),
    ).toBe(2);
  });

  it("keeps desktop content-driven between three and eight columns", () => {
    const widths = [920, 1500, 2500];
    const single = widths.map((width) =>
      masonryColumnCount({
        width,
        gap: 16,
        desktop: true,
        layout: "single",
      }),
    );
    const double = widths.map((width) =>
      masonryColumnCount({
        width,
        gap: 16,
        desktop: true,
        layout: "double",
      }),
    );

    expect(single).toEqual(double);
    expect(single.every((columns) => columns >= 3 && columns <= 8)).toBe(true);
    expect(single).toEqual([...single].sort((left, right) => left - right));
  });
});
