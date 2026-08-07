import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

type PreviewDom = {
  window: Window & typeof globalThis;
};

const jsdomModule = "jsdom";
const { JSDOM } = (await import(jsdomModule)) as {
  JSDOM: new (
    source: string,
    options: {
      pretendToBeVisual: boolean;
      runScripts: "outside-only";
      url: string;
    },
  ) => PreviewDom;
};

const previewRoot = new URL(
  "../../../docs/prototypes/mobile-preview/",
  import.meta.url,
);
const html = await readFile(new URL("index.html", previewRoot), "utf8");
const script = await readFile(new URL("preview.js", previewRoot), "utf8");
const previewCss = await readFile(new URL("preview.css", previewRoot), "utf8");

const openWindows: Window[] = [];

const renderPreview = (preferences: Record<string, string> = {}) => {
  const withoutExternalScript = html.replace(
    /<script type="module" src="\.\/preview\.js"><\/script>/,
    "",
  );
  const dom = new JSDOM(withoutExternalScript, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "http://localhost/docs/prototypes/mobile-preview/",
  });
  openWindows.push(dom.window);
  for (const [key, value] of Object.entries(preferences)) {
    dom.window.localStorage.setItem(key, value);
  }
  dom.window.eval(script);
  return dom;
};

afterEach(() => {
  for (const window of openWindows.splice(0)) window.close();
});

describe("mobile application preview", () => {
  it("starts on the discovery screen without visible branding or catalogue content", () => {
    const dom = renderPreview();
    const document = dom.window.document;

    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.dataset.homeLayout).toBe("double");
    expect(
      document.querySelector<HTMLElement>('[data-view="home"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="discover"]')
        ?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="nearby"]')?.hidden,
    ).toBe(true);
    expect(document.querySelector(".preview-hero")).toBeNull();
    expect(document.querySelectorAll(".yoyi-logo")).toHaveLength(2);
    expect(
      document.querySelector("[data-loading-screen] .yoyi-logo"),
    ).toBeTruthy();
    expect(
      document.querySelector("[data-loading-screen] .app-loading__motto")
        ?.textContent,
    ).toContain("志于道，据于德，依于仁，游于艺");
    expect(
      document.querySelector("[data-bottom-navigation] .yoyi-logo"),
    ).toBeTruthy();
    expect(
      document
        .querySelector("[data-bottom-navigation] .yoyi-logo")
        ?.closest(".app-nav-brand"),
    ).toBeTruthy();
    expect(document.querySelectorAll("[data-primary-view]")).toHaveLength(3);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.textContent,
    ).toContain("发现");
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.textContent,
    ).toContain("附近");
    expect(document.querySelector('[data-label="tab-discover"]')).toBeNull();
    expect(document.querySelector('[data-label="tab-nearby"]')).toBeNull();
    expect(document.querySelectorAll("[data-open-settings]")).toHaveLength(3);
    expect(document.querySelector("[data-theme-cycle]")).toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-view="settings"]')?.hidden,
    ).toBe(true);
    expect(html.indexOf("yoyi.theme-preference")).toBeLessThan(
      html.indexOf("theme.css"),
    );
  });

  it("switches top-level views, filters search, and filters calligraphy cards", () => {
    const dom = renderPreview();
    const document = dom.window.document;

    const inscriptionButton = document.querySelector<HTMLElement>(
      '[data-primary-view="inscriptions"]',
    );
    inscriptionButton?.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="home"]')?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);

    const input = document.querySelector<HTMLInputElement>(
      "[data-inscription-search]",
    );
    if (!input) throw new Error("search input not found");
    input.value = "不存在";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    expect(
      document.querySelector<HTMLElement>("[data-search-empty]")?.hidden,
    ).toBe(false);
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-search-text]")].every(
        (item) => item.hidden,
      ),
    ).toBe(true);

    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    document
      .querySelector<HTMLElement>('[data-calligraphy-category="rubbing"]')
      ?.click();
    const inkCards = [
      ...document.querySelectorAll<HTMLElement>('[data-category="ink"]'),
    ];
    const rubbingCards = [
      ...document.querySelectorAll<HTMLElement>('[data-category="rubbing"]'),
    ];
    expect(inkCards.every((card) => card.hidden)).toBe(true);
    expect(rubbingCards.every((card) => !card.hidden)).toBe(true);
  });

  it("opens settings from every primary view and returns to its source", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    for (const view of ["home", "inscriptions", "calligraphy"]) {
      document
        .querySelector<HTMLElement>(`[data-primary-view="${view}"]`)
        ?.click();
      document
        .querySelector<HTMLElement>(
          `[data-view="${view}"] [data-open-settings]`,
        )
        ?.click();
      expect(
        document.querySelector<HTMLElement>('[data-view="settings"]')?.hidden,
      ).toBe(false);
      expect(
        document.querySelector<HTMLElement>("[data-bottom-navigation]")?.hidden,
      ).toBe(true);
      document.querySelector<HTMLElement>("[data-settings-back]")?.click();
      await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
      expect(
        document.querySelector<HTMLElement>(`[data-view="${view}"]`)?.hidden,
      ).toBe(false);
    }
  });

  it("persists explicit theme and home feed layout choices", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    document.querySelector<HTMLElement>("[data-open-settings]")?.click();

    const dark = document.querySelector<HTMLInputElement>(
      '[data-theme-option][value="dark"]',
    );
    const single = document.querySelector<HTMLInputElement>(
      '[data-layout-option][value="single"]',
    );
    if (!dark || !single) throw new Error("settings options not found");
    dark.checked = true;
    dark.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    single.checked = true;
    single.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.homeLayout).toBe("single");
    expect(dom.window.localStorage.getItem("yoyi.theme-preference")).toBe(
      "dark",
    );
    expect(dom.window.localStorage.getItem("yoyi.home-feed-layout")).toBe(
      "single",
    );
    expect(previewCss).toContain(
      '[data-home-layout="single"] [data-view="home"] .app-masonry',
    );

    const system = document.querySelector<HTMLInputElement>(
      '[data-theme-option][value="system"]',
    );
    if (!system) throw new Error("system theme option not found");
    system.checked = true;
    system.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(dom.window.localStorage.getItem("yoyi.theme-preference")).toBe(
      "system",
    );
  });

  it("restores valid preferences and falls back from invalid stored values", () => {
    const stored = renderPreview({
      "yoyi.home-feed-layout": "single",
      "yoyi.theme-preference": "dark",
    });
    expect(stored.window.document.documentElement.dataset.theme).toBe("dark");
    expect(stored.window.document.documentElement.dataset.homeLayout).toBe(
      "single",
    );
    expect(
      stored.window.document.querySelector<HTMLInputElement>(
        '[data-theme-option][value="dark"]',
      )?.checked,
    ).toBe(true);

    const invalid = renderPreview({
      "yoyi.home-feed-layout": "three",
      "yoyi.theme-preference": "sepia",
    });
    expect(
      invalid.window.document.documentElement.hasAttribute("data-theme"),
    ).toBe(false);
    expect(invalid.window.document.documentElement.dataset.homeLayout).toBe(
      "double",
    );
  });

  it("opens a detail level, hides the bottom navigation, and returns", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const homeScroll = document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    if (!homeScroll) throw new Error("home scroll container not found");
    homeScroll.scrollTop = 120;

    document.querySelector<HTMLElement>("[data-open-detail]")?.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>("[data-bottom-navigation]")?.hidden,
    ).toBe(true);
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "山门北壁题记",
    );

    document.querySelector<HTMLElement>("[data-detail-back]")?.click();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 50));
    expect(
      document.querySelector<HTMLElement>('[data-view="home"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>("[data-bottom-navigation]")?.hidden,
    ).toBe(false);
    expect(homeScroll.scrollTop).toBe(120);
  });

  it("declares tablet and desktop responsive layout rules without new features", () => {
    expect(previewCss).toContain("@media (min-width: 48rem)");
    expect(previewCss).toContain("@media (min-width: 56rem)");
    expect(previewCss).toContain("@media (min-width: 64rem)");
    expect(previewCss).toContain("@media (min-width: 90rem)");
    expect(previewCss).toContain("orientation: landscape");
    expect(previewCss).toContain("var(--yoyi-container-content)");
    expect(previewCss).toContain("var(--yoyi-container-reading)");
    expect(previewCss).toContain(".app-nav-brand");
    expect(html).toContain('data-primary-view="home"');
    expect(html).toContain('data-primary-view="inscriptions"');
    expect(html).toContain('data-primary-view="calligraphy"');
    expect(html).toContain("yoyi.theme-preference");
    expect(html).toContain("yoyi.home-feed-layout");
    expect(html).not.toMatch(/关注|收藏|评论|登录|账号|地图/);
  });
});
