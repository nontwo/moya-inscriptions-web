import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { repositoryRoot } from "./workspace-scanner.js";

const collectSourceFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(target)));
    else if (
      /\.[cm]?[jt]sx?$/u.test(entry.name) &&
      !/\.test\./u.test(entry.name)
    ) {
      files.push(target);
    }
  }
  return files;
};

describe("T02 R03 architecture boundaries", () => {
  it("keeps Product Home, Topics, and source composition independent from Development QA", async () => {
    const roots = [
      path.join(repositoryRoot, "apps/web/features/home"),
      path.join(repositoryRoot, "apps/web/features/topics"),
      path.join(repositoryRoot, "apps/web/features/product-shell"),
      path.join(repositoryRoot, "apps/web/features/product-preview"),
      path.join(repositoryRoot, "apps/web/sources"),
    ];
    const violations: string[] = [];
    for (const root of roots) {
      for (const file of await collectSourceFiles(root)) {
        const source = await readFile(file, "utf8");
        if (
          /apps\/web\/qa|\.\.\/qa\/|features\/qa|docs\/prototypes/u.test(source)
        ) {
          violations.push(path.relative(repositoryRoot, file));
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps Catalog Detail, Carousel, and Viewer outside the R03 composition", async () => {
    const preview = await readFile(
      path.join(
        repositoryRoot,
        "apps/web/features/product-preview/t02p-product-preview.tsx",
      ),
      "utf8",
    );
    expect(preview).not.toMatch(
      /features\/detail|CatalogDetail|Carousel|Viewer/u,
    );
    expect(preview).toContain("TopicDetail");
  });

  it("leaves Formal root and Catalog redirect outside the React preview", async () => {
    const formal = await readFile(
      path.join(repositoryRoot, "apps/web/app/route.ts"),
      "utf8",
    );
    const catalogRedirect = await readFile(
      path.join(repositoryRoot, "apps/web/app/catalog/[catalogId]/route.ts"),
      "utf8",
    );
    for (const source of [formal, catalogRedirect]) {
      expect(source).not.toMatch(/T02pProductPreview|HomeScreen|TopicDetail/u);
      expect(source).not.toMatch(/apps\/web\/qa|features\/qa/u);
    }
    expect(catalogRedirect).toContain("redirect");
  });

  it("contains no committed machine-specific IPv4 origin in R03 runtime composition", async () => {
    const roots = [
      path.join(repositoryRoot, "apps/web/features/home"),
      path.join(repositoryRoot, "apps/web/features/topics"),
      path.join(repositoryRoot, "apps/web/sources"),
      path.join(repositoryRoot, "apps/web/qa/home"),
    ];
    const violations: string[] = [];
    for (const root of roots) {
      for (const file of await collectSourceFiles(root)) {
        const source = await readFile(file, "utf8");
        if (
          /https?:\/\/(?!127\.0\.0\.1)(?:\d{1,3}\.){3}\d{1,3}/u.test(source)
        ) {
          violations.push(path.relative(repositoryRoot, file));
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
