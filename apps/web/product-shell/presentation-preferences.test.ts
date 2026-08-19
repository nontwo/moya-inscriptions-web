import { describe, expect, it } from "vitest";

import {
  contentWallLayoutPreferenceKey,
  contentWallLayoutPreferences,
  presentationPreferenceBootstrap,
  themePreferenceKey,
  themePreferences,
} from "./presentation-preferences";

describe("shared presentation preferences", () => {
  it("keeps the approved storage compatibility and generic ownership", () => {
    expect(themePreferenceKey).toBe("yoyi.theme-preference");
    expect(contentWallLayoutPreferenceKey).toBe("yoyi.home-feed-layout");
    expect(themePreferences).toEqual(["light", "dark", "system"]);
    expect(contentWallLayoutPreferences).toEqual(["single", "double"]);
    expect(presentationPreferenceBootstrap).toContain("contentWallLayout");
    expect(presentationPreferenceBootstrap).not.toContain("fetch(");
  });
});
