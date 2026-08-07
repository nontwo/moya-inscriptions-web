import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  darkTheme,
  lightTheme,
  motion,
  semanticColorNames,
  typography,
  typographyNames,
} from "@moya/design-tokens";

const luminance = (hex: string) => {
  const channels = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (linear[0] ?? 0) +
    0.7152 * (linear[1] ?? 0) +
    0.0722 * (linear[2] ?? 0)
  );
};

const contrast = (foreground: string, background: string) => {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe("design tokens", () => {
  it("exports complete and symmetric light/dark themes", () => {
    expect(Object.keys(lightTheme).sort()).toEqual(
      [...semanticColorNames].sort(),
    );
    expect(Object.keys(darkTheme).sort()).toEqual(
      [...semanticColorNames].sort(),
    );
    expect(Object.keys(typography).sort()).toEqual([...typographyNames].sort());
    expect(motion.duration.loadingLogo).toBe("720ms");
  });

  it("keeps essential text and accent contrast at 4.5:1 or better", () => {
    for (const [theme, name] of [
      [lightTheme, "light"],
      [darkTheme, "dark"],
    ] as const) {
      for (const token of [
        "text-primary",
        "text-secondary",
        "text-tertiary",
        "seal-red",
      ] as const) {
        expect(
          contrast(theme[token], theme["background-page"]),
          `${name} ${token}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("contains explicit and system theme selectors", async () => {
    const css = await readFile(
      new URL("../../../packages/design-tokens/src/theme.css", import.meta.url),
      "utf8",
    );
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root:not([data-theme="light"])');
  });
});
