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
      path.join(repositoryRoot, "apps/web/features/product-application"),
      path.join(repositoryRoot, "apps/web/features/detail"),
      path.join(repositoryRoot, "apps/web/sources"),
    ];
    const violations: string[] = [];
    for (const root of roots) {
      for (const file of await collectSourceFiles(root)) {
        const source = await readFile(file, "utf8");
        if (
          /(?:^|[/])app\/dev|development-data|apps\/web\/qa|\.\.\/qa\/|features\/qa|docs\/prototypes/u.test(
            source,
          )
        ) {
          violations.push(path.relative(repositoryRoot, file));
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("adds only the bounded MIG-D1 Detail and MIG-D2 Viewer without Gallery", async () => {
    const preview = await readFile(
      path.join(
        repositoryRoot,
        "apps/web/features/product-preview/t02p-product-preview.tsx",
      ),
      "utf8",
    );
    expect(preview).toMatch(/CatalogDetail|renderDetailOverlay/u);
    expect(preview).not.toMatch(/Gallery/u);
    expect(preview).toContain("TopicDetail");

    const detailRoot = path.join(repositoryRoot, "apps/web/features/detail");
    const detailStyles = await readFile(
      path.join(detailRoot, "catalog-detail.module.css"),
      "utf8",
    );
    const violations: string[] = [];
    for (const file of await collectSourceFiles(detailRoot)) {
      const source = await readFile(file, "utf8");
      if (
        /gallery|transcription|historicalContext|scholarlyResearch|\bonRetry\b|>重试</u.test(
          source,
        )
      ) {
        violations.push(path.relative(repositoryRoot, file));
      }
    }
    expect(violations).toEqual([]);
    const viewer = await readFile(
      path.join(detailRoot, "catalog-viewer.tsx"),
      "utf8",
    );
    expect(viewer).toMatch(/CatalogViewer|data-detail-viewer/u);
    expect(viewer).not.toMatch(/apps\/web\/qa|docs\/prototypes/u);
    expect(detailStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.mediaTrack,[\s\S]*transition-duration: 1ms;/u,
    );
  });

  it("uses the accepted React preview at Formal root while preserving the Catalog redirect", async () => {
    const formal = await readFile(
      path.join(repositoryRoot, "apps/web/app/page.tsx"),
      "utf8",
    );
    const catalogRedirect = await readFile(
      path.join(repositoryRoot, "apps/web/app/catalog/[catalogId]/route.ts"),
      "utf8",
    );
    expect(formal).toContain("T02pProductPreview");
    expect(formal).not.toMatch(
      /readT02Document|t02-static-files|(?:^|[/])app\/dev|development-data|features\/qa|docs\/prototypes/u,
    );
    expect(catalogRedirect).not.toMatch(
      /T02pProductPreview|HomeScreen|TopicDetail|apps\/web\/qa|features\/qa/u,
    );
    expect(catalogRedirect).toContain("redirect");
    expect(catalogRedirect).toContain("307");
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

  it("keeps the Home pager native and independent from Primary gesture machinery", async () => {
    const pager = await readFile(
      path.join(repositoryRoot, "apps/web/features/home/home-feed-pager.tsx"),
      "utf8",
    );
    const styles = await readFile(
      path.join(
        repositoryRoot,
        "apps/web/features/home/home-screen.module.css",
      ),
      "utf8",
    );
    const home = await readFile(
      path.join(repositoryRoot, "apps/web/features/home/home-screen.tsx"),
      "utf8",
    );
    const productShell = await readFile(
      path.join(
        repositoryRoot,
        "apps/web/features/product-shell/product-shell.tsx",
      ),
      "utf8",
    );
    const productStyles = await readFile(
      path.join(
        repositoryRoot,
        "apps/web/features/product-shell/product-shell.module.css",
      ),
      "utf8",
    );

    expect(pager).not.toMatch(
      /setPointerCapture|releasePointerCapture|pointermove|translate3d/u,
    );
    expect(pager).not.toMatch(
      /addEventListener\(["'](?:pointer|touch)|spring|resistance/u,
    );
    expect(pager).not.toMatch(
      /HOME_PAGER_SCROLL_IDLE_MS|setTimeout\([^)]*settle/u,
    );
    expect(pager).not.toMatch(/clientWidth\s*\*\s*(?:index|targetIndex)/u);
    expect(pager).toContain('"onscrollend" in frame');
    expect(pager).toContain("panel.offsetLeft");
    expect(pager).toContain("internalCommitIndexRef");
    expect(pager).toContain("generationRef");
    expect(pager).toContain("HOME_PAGER_FALLBACK_STABLE_FRAMES");
    expect(pager).not.toMatch(/primary-navigation|PrimaryNavigationPager/u);
    expect(home).not.toMatch(/history|popstate/u);
    expect(productShell).toContain("registerActiveHomeScrollElement");
    expect(productShell).toContain('addEventListener("popstate"');
    expect(styles).toMatch(
      /\.pagerFrame \{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x mandatory;[^}]*touch-action: pan-x pan-y;/su,
    );
    expect(styles).toMatch(
      /\.feedPanel \{[^}]*scroll-snap-align: start;[^}]*scroll-snap-stop: always;/su,
    );
    expect(styles).toMatch(/\.pagerTrack \{[^}]*gap: 0;[^}]*padding: 0;/su);
    expect(styles).toMatch(
      /data-home-pager-platform="phone"\] \.feedPanel,[\s\S]*data-home-pager-platform="tablet"\] \.feedPanel \{[^}]*height: 100%;[^}]*overflow-y: auto;[^}]*overscroll-behavior-y: contain;[^}]*-webkit-overflow-scrolling: touch;/u,
    );
    expect(styles.match(/(?:^|\n)\.feedPanel \{[^}]*\}/u)?.[0]).not.toContain(
      "overflow-y: auto",
    );
    expect(productStyles).toMatch(
      /data-primary-destination="home"\][\s\S]*overflow: hidden;/u,
    );
  });

  it("scopes the new PC card treatment to R03 masonry and preserves deferred browse spacing", async () => {
    const styles = await readFile(
      path.join(
        repositoryRoot,
        "apps/web/features/home/home-screen.module.css",
      ),
      "utf8",
    );
    expect(styles).not.toContain(
      ':global([data-primary-shell][data-platform="pc"]) .feedCard {',
    );
    expect(styles).toContain(
      ':global([data-primary-shell][data-platform="pc"]) .masonry .feedCard {',
    );
    expect(styles).toMatch(
      /data-platform="tablet"\]\) \.feed \{\s+column-gap: var\(--yoyi-space-5\);/u,
    );
    expect(styles).toMatch(
      /data-platform="pc"\]\) \.feed \.feedCard \{\s+margin-bottom: var\(--yoyi-space-5\);/u,
    );
    expect(styles).toMatch(/\.screenHeader h2 \{[^}]*line-height: 1\.3;/u);
    expect(styles).toMatch(
      /:global\(html\[data-home-layout="single"\]\) \.feed \{\s+column-count: 1;/u,
    );
  });
});
