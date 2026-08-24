import { describe, expect, it } from "vitest";

import {
  detectDeviceClass,
  readRuntimeDeviceClass,
  resolvePresentationOrientation,
  resolvePresentationPlatform,
  resolveRuntimePresentationPlatform,
} from "./device-platform";

describe("current T02 device classification compatibility", () => {
  it.each([
    [
      "iPhone-like phone",
      { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
      "phone",
    ],
    [
      "Android Mobile phone",
      { userAgent: "Mozilla/5.0 (Linux; Android 15) Mobile Safari/537.36" },
      "phone",
    ],
    [
      "Android non-Mobile tablet",
      { userAgent: "Mozilla/5.0 (Linux; Android 15) Safari/537.36" },
      "tablet",
    ],
    [
      "iPad tablet",
      { userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" },
      "tablet",
    ],
    [
      "iPadOS Macintosh multi-touch tablet",
      {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        maxTouchPoints: 5,
      },
      "tablet",
    ],
    [
      "ordinary desktop",
      {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        maxTouchPoints: 0,
      },
      "desktop",
    ],
    ["desktop fallback", {}, "desktop"],
    [
      "User-Agent Client Hint phone",
      { userAgent: "Mozilla/5.0", userAgentData: { mobile: true } },
      "phone",
    ],
  ] as const)("classifies a %s", (_, input, expected) => {
    expect(detectDeviceClass(input)).toBe(expected);
  });

  it("keeps tablet detection ahead of a mobile client hint", () => {
    expect(
      detectDeviceClass({
        userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)",
        userAgentData: { mobile: true },
      }),
    ).toBe("tablet");
  });
});

describe("Product Shell runtime platform helpers", () => {
  it("keeps real phones on phone and touch-Mac iPads below PC", () => {
    expect(
      resolveRuntimePresentationPlatform(
        { userAgent: "Mozilla/5.0 (iPhone) Mobile" },
        1_200,
      ),
    ).toBe("phone");
    expect(
      resolveRuntimePresentationPlatform(
        {
          maxTouchPoints: 5,
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
        },
        1_366,
      ),
    ).toBe("tablet");
  });

  it("preserves Client Hint data while reading the runtime device class", () => {
    expect(
      readRuntimeDeviceClass({
        userAgent: "Mozilla/5.0",
        userAgentData: { mobile: true },
      }),
    ).toBe("phone");
  });

  it.each([
    [390, 844, "portrait"],
    [1_024, 768, "landscape"],
    [800, 800, "portrait"],
  ] as const)("resolves %sx%s as %s", (width, height, expectedOrientation) => {
    expect(resolvePresentationOrientation(width, height)).toBe(
      expectedOrientation,
    );
  });
});

describe("current T02 presentation platform compatibility", () => {
  it.each([320, 768, 896, 1440])(
    "keeps a phone-class device on phone at width %s",
    (width) => {
      expect(resolvePresentationPlatform("phone", width)).toBe("phone");
    },
  );

  it.each([
    [767, "phone"],
    [768, "tablet"],
    [1440, "tablet"],
  ] as const)("resolves a tablet at width %s to %s", (width, expected) => {
    expect(resolvePresentationPlatform("tablet", width)).toBe(expected);
  });

  it.each([
    [767, "phone"],
    [768, "tablet"],
    [895, "tablet"],
    [896, "pc"],
    [1440, "pc"],
  ] as const)("resolves a desktop at width %s to %s", (width, expected) => {
    expect(resolvePresentationPlatform("desktop", width)).toBe(expected);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "uses the current wide fallback for non-finite width %s",
    (width) => {
      expect(resolvePresentationPlatform("phone", width)).toBe("phone");
      expect(resolvePresentationPlatform("tablet", width)).toBe("tablet");
      expect(resolvePresentationPlatform("desktop", width)).toBe("pc");
    },
  );
});
