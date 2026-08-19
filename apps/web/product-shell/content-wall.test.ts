import { describe, expect, it } from "vitest";

import { contentWallColumnCount } from "./content-wall";

describe("shared Home/Calligraphy content wall", () => {
  it("uses the shared single/double preference outside PC", () => {
    expect(
      contentWallColumnCount({
        width: 390,
        gap: 8,
        platform: "phone",
        layout: "single",
      }),
    ).toBe(1);
    expect(
      contentWallColumnCount({
        width: 390,
        gap: 8,
        platform: "phone",
        layout: "double",
      }),
    ).toBe(2);
    expect(
      contentWallColumnCount({
        width: 834,
        gap: 12,
        platform: "tablet",
        layout: "single",
      }),
    ).toBe(1);
    expect(
      contentWallColumnCount({
        width: 834,
        gap: 12,
        platform: "tablet",
        layout: "double",
      }),
    ).toBe(2);
  });

  it("keeps PC content-driven and independent from the preference", () => {
    const single = contentWallColumnCount({
      width: 1440,
      gap: 16,
      platform: "pc",
      layout: "single",
    });
    const double = contentWallColumnCount({
      width: 1440,
      gap: 16,
      platform: "pc",
      layout: "double",
    });
    expect(single).toBe(double);
    expect(single).toBeGreaterThanOrEqual(3);
    expect(single).toBeLessThanOrEqual(8);
  });
});
