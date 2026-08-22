import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repoRoot = new URL("../../../", import.meta.url);

async function collectFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: URL[] = [];
  for (const entry of entries) {
    if ([".next", "coverage", "dist", "node_modules"].includes(entry.name)) {
      continue;
    }
    const url = new URL(
      entry.name + (entry.isDirectory() ? "/" : ""),
      directory,
    );
    if (entry.isDirectory()) files.push(...(await collectFiles(url)));
    else files.push(url);
  }
  return files;
}

async function readSources(paths: string[], pattern: RegExp) {
  const sources: string[] = [];
  for (const path of paths) {
    const files = await collectFiles(new URL(path, repoRoot));
    for (const file of files) {
      if (pattern.test(file.pathname))
        sources.push(await readFile(file, "utf8"));
    }
  }
  return sources.join("\n");
}

describe("design-system material boundary", () => {
  it("keeps browser Glass parameters inside tokens and shared UI", async () => {
    const featureSources = await readSources(
      ["apps/", "docs/prototypes/mobile-preview/"],
      /\.(?:css|html|js|ts|tsx)$/,
    );
    expect(featureSources).not.toMatch(/backdrop-filter\s*:/i);
    expect(featureSources).not.toMatch(
      /--yoyi-(?:blur|material-glass)-[^:]+\s*:/i,
    );
    expect(featureSources).not.toMatch(/\bAppleGlass\w*/);

    const uiCss = await readFile(
      new URL("packages/ui/src/styles.css", repoRoot),
      "utf8",
    );
    expect(uiCss).toContain(".yoyi-functional-glass");
    expect(uiCss).toContain("backdrop-filter: blur(");
  });

  it("keeps UI material state out of public contracts", async () => {
    const contracts = await readSources(
      ["packages/contracts/"],
      /\.(?:ts|tsx|json|yaml|yml)$/,
    );
    expect(contracts).not.toMatch(/glassVariant|backdropBlur|uiMaterial/);
  });

  it("does not apply Functional Glass to archive content", async () => {
    const uiCss = await readFile(
      new URL("packages/ui/src/styles.css", repoRoot),
      "utf8",
    );
    const prototypeHtml = await readFile(
      new URL("docs/prototypes/mobile-preview/index.html", repoRoot),
      "utf8",
    );
    expect(uiCss).not.toMatch(
      /\.yoyi-(?:card|image-card|discovery-card)[^{,]*\.yoyi-functional-glass/,
    );
    expect(prototypeHtml).not.toMatch(
      /class="[^"]*(?:app-card|app-topic-card)[^"]*yoyi-functional-glass/,
    );
  });

  it("freezes the four primary destinations and reserved profile entry", async () => {
    const prototypeHtml = await readFile(
      new URL("docs/prototypes/mobile-preview/index.html", repoRoot),
      "utf8",
    );
    const ids = [...prototypeHtml.matchAll(/data-primary-view="([^"]+)"/g)].map(
      ([, id]) => id,
    );
    expect(ids).toEqual(["home", "inscriptions", "create", "calligraphy"]);
    expect(prototypeHtml).toContain('data-nav-action="profile"');
  });
});
