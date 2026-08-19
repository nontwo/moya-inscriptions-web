import { describe, expect, it } from "vitest";

import { detectDeviceClass, resolveProductPlatform } from "./device-platform";

describe("physical device and product platform classification", () => {
  it("keeps physical phones on phone at every width", () => {
    const device = detectDeviceClass({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      mobileHint: true,
    });
    expect(device).toBe("phone");
    expect(resolveProductPlatform(device, 390)).toBe("phone");
    expect(resolveProductPlatform(device, 932)).toBe("phone");
  });

  it("allows tablets to downgrade but never upgrade to PC", () => {
    const device = detectDeviceClass({
      userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)",
      maxTouchPoints: 5,
    });
    expect(device).toBe("tablet");
    expect(resolveProductPlatform(device, 767)).toBe("phone");
    expect(resolveProductPlatform(device, 834)).toBe("tablet");
    expect(resolveProductPlatform(device, 1194)).toBe("tablet");
  });

  it("uses the approved desktop-UA boundaries", () => {
    const device = detectDeviceClass({ userAgent: "Mozilla/5.0 (Macintosh)" });
    expect(device).toBe("desktop");
    expect(resolveProductPlatform(device, 767)).toBe("phone");
    expect(resolveProductPlatform(device, 768)).toBe("tablet");
    expect(resolveProductPlatform(device, 895)).toBe("tablet");
    expect(resolveProductPlatform(device, 896)).toBe("pc");
  });
});
