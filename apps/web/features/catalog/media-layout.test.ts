import { describe, expect, it } from "vitest";

import {
  CATALOG_ULTRA_WIDE_ASPECT_RATIO,
  isUltraWideCatalogMedia,
} from "./media-layout";

describe("isUltraWideCatalogMedia", () => {
  it("keeps the Owner-approved inclusive 2.4 boundary", () => {
    expect(CATALOG_ULTRA_WIDE_ASPECT_RATIO).toBe(2.4);
    expect(isUltraWideCatalogMedia({ height: 1_000, width: 2_399 })).toBe(
      false,
    );
    expect(isUltraWideCatalogMedia({ height: 1_000, width: 2_400 })).toBe(true);
    expect(isUltraWideCatalogMedia({ height: 280, width: 960 })).toBe(true);
  });

  it.each([
    undefined,
    { height: 0, width: 960 },
    { height: -1, width: 960 },
    { height: 280, width: 0 },
    { height: 280, width: -1 },
    { height: Number.NaN, width: 960 },
    { height: 280, width: Number.POSITIVE_INFINITY },
  ])("returns false for missing or invalid dimensions: %o", (media) => {
    expect(isUltraWideCatalogMedia(media)).toBe(false);
  });
});
