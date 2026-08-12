import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const uiRoot = new URL("../../../packages/ui/src/", import.meta.url);

const collectSource = async (directory: URL): Promise<string> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents: string[] = [];
  for (const entry of entries) {
    if (entry.name === "assets") continue;
    const url = new URL(
      entry.name + (entry.isDirectory() ? "/" : ""),
      directory,
    );
    if (entry.isDirectory()) contents.push(await collectSource(url));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      contents.push(await readFile(url, "utf8"));
    }
  }
  return contents.join("\n");
};

describe("UI styles and architecture", () => {
  it("includes responsive, safe-area, theme, and reduced-motion rules", async () => {
    const css = await readFile(new URL("styles.css", uiRoot), "utf8");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("@media (min-width: 48rem)");
    expect(css).toContain("@media (min-width: 56rem)");
    expect(css).toContain("@media (min-width: 90rem)");
    expect(css).toContain("orientation: landscape");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain('[data-motion="reduced"]');
    expect(css).toContain("paper-dark-subtle.svg");
    expect(css).toContain("var(--yoyi-container-content)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("has no API, database, or formal contract dependency", async () => {
    const source = await collectSource(uiRoot);
    expect(source).not.toMatch(
      /\bfetch\s*\(|axios|postgres|from\s+["']pg["']/i,
    );
    expect(source).not.toContain("@moya/data-access");
    expect(source).not.toContain("@moya/contracts");
    expect(source).not.toContain("apps/web");
  });

  it("does not own application routing, storage, repositories, or mock data", async () => {
    const source = await collectSource(uiRoot);
    expect(source).not.toMatch(/localStorage|sessionStorage|\bhistory\b/);
    expect(source).not.toMatch(/Repository|mock(?:Data|Repository)/i);
    expect(source).not.toMatch(/next\/(?:router|navigation)/);
  });
});
