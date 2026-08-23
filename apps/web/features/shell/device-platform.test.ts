import { describe, expect, it } from "vitest";

import {
  detectDeviceClass,
  resolvePresentationPlatform,
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
