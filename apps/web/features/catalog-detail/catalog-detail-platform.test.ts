import { describe, expect, it } from "vitest";

import {
  detectCatalogDetailDeviceClass,
  hasCatalogDetailPcControls,
  resolveCatalogDetailComposition,
  resolveCatalogDetailPlatform,
} from "./catalog-detail-platform";

describe("Catalog detail platform resolution", () => {
  it("keeps physical phones in phone composition at landscape widths", () => {
    const deviceClass = detectCatalogDetailDeviceClass({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });

    expect(resolveCatalogDetailPlatform(deviceClass, 844)).toBe("phone");
    expect(resolveCatalogDetailComposition("phone", true)).toBe(
      "compact-stacked",
    );
  });

  it("keeps iPadOS devices in tablet composition above the desktop width", () => {
    const deviceClass = detectCatalogDetailDeviceClass({
      maxTouchPoints: 5,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
    });

    expect(resolveCatalogDetailPlatform(deviceClass, 1024)).toBe("tablet");
    expect(resolveCatalogDetailComposition("tablet", true)).toBe(
      "compact-split",
    );
  });

  it("uses the 768 and 896 desktop thresholds", () => {
    expect(resolveCatalogDetailPlatform("desktop", 767)).toBe("phone");
    expect(resolveCatalogDetailPlatform("desktop", 768)).toBe("tablet");
    expect(resolveCatalogDetailPlatform("desktop", 895)).toBe("tablet");
    expect(resolveCatalogDetailPlatform("desktop", 896)).toBe("pc");
    expect(resolveCatalogDetailComposition("tablet", false)).toBe(
      "wide-stacked",
    );
    expect(resolveCatalogDetailComposition("pc", false)).toBe("expanded-split");
  });

  it("uses the resolved platform rather than hover capability for PC controls", () => {
    expect(hasCatalogDetailPcControls("phone")).toBe(false);
    expect(hasCatalogDetailPcControls("tablet")).toBe(false);
    expect(hasCatalogDetailPcControls("pc")).toBe(true);
  });
});
