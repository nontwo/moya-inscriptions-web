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
const devicePlatformScript = await readFile(
  new URL("device-platform.js", previewRoot),
  "utf8",
);
const script = await readFile(new URL("preview.js", previewRoot), "utf8");
const topicsFixture = await readFile(
  new URL("fixtures/topics.placeholder.js", previewRoot),
  "utf8",
);
const previewCss = await readFile(new URL("preview.css", previewRoot), "utf8");
const tabletCss = await readFile(
  new URL("preview.tablet.css", previewRoot),
  "utf8",
);
const pcCss = await readFile(new URL("preview.pc.css", previewRoot), "utf8");

const openWindows: Window[] = [];

const phoneUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";
const tabletUserAgent =
  "Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Safari/537.36";
const ipadUserAgent =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const ipadDesktopUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Safari/605.1.15";
const desktopUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36";

type DeviceOptions = {
  maxTouchPoints?: number;
  mobile?: boolean;
  userAgent?: string;
  viewportWidth?: number;
};

const installDeviceEnvironment = (
  window: Window & typeof globalThis,
  {
    maxTouchPoints = 5,
    mobile = true,
    userAgent = phoneUserAgent,
    viewportWidth = 390,
  }: DeviceOptions = {},
) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
    writable: true,
  });
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(window.navigator, "maxTouchPoints", {
    configurable: true,
    value: maxTouchPoints,
  });
  Object.defineProperty(window.navigator, "userAgentData", {
    configurable: true,
    value: { mobile },
  });
};

const clickAndWaitForHistory = async (
  window: Window & typeof globalThis,
  target: HTMLElement,
) => {
  const popstate = new Promise<void>((resolve) => {
    window.addEventListener("popstate", () => resolve(), { once: true });
  });

  target.click();
  await popstate;
  await new Promise<void>((resolve) =>
    window.requestAnimationFrame(() => resolve()),
  );
};

const renderPreview = (
  preferences: Record<string, string> = {},
  deviceOptions: DeviceOptions = {},
) => {
  const withoutExternalScript = html
    .replace(/<script src="\.\/device-platform\.js"><\/script>/, "")
    .replace(
      /<script src="\.\/fixtures\/topics\.placeholder\.js"><\/script>/,
      "",
    )
    .replace(/<script(?: type="module")? src="\.\/preview\.js"><\/script>/, "");
  const dom = new JSDOM(withoutExternalScript, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "http://localhost/docs/prototypes/mobile-preview/",
  });
  openWindows.push(dom.window);
  installDeviceEnvironment(dom.window, deviceOptions);
  for (const [key, value] of Object.entries(preferences)) {
    dom.window.localStorage.setItem(key, value);
  }
  dom.window.eval(devicePlatformScript);
  dom.window.eval(topicsFixture);
  dom.window.eval(script);
  return dom;
};

const setViewportWidth = (dom: PreviewDom, viewportWidth: number) => {
  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
    writable: true,
  });
  dom.window.dispatchEvent(new dom.window.Event("resize"));
};

const activePlatformStyles = (document: Document) =>
  [...document.querySelectorAll<HTMLLinkElement>("[data-platform-stylesheet]")]
    .filter((link) => link.media === "all")
    .map((link) => link.dataset.platformStylesheet);

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
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="topics"]')
        ?.textContent,
    ).toContain("专题");
    expect(document.querySelector(".app-home-motto")?.textContent).toContain(
      "志于道，据于德，依于仁，游于艺",
    );
    expect(document.querySelectorAll("[data-open-topic]")).toHaveLength(3);
    expect(document.querySelector('[data-label="tab-discover"]')).toBeNull();
    expect(document.querySelector('[data-label="tab-nearby"]')).toBeNull();
    expect(document.querySelectorAll("[data-open-settings]")).toHaveLength(3);
    expect(document.querySelector("[data-calligraphy-filter]")).toBeTruthy();
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

    const calligraphyFilter = document.querySelector<HTMLInputElement>(
      "[data-calligraphy-filter]",
    );
    if (!calligraphyFilter) throw new Error("calligraphy filter not found");
    calligraphyFilter.value = "不存在的书帖";
    calligraphyFilter.dispatchEvent(
      new dom.window.Event("input", { bubbles: true }),
    );
    expect(
      document.querySelector<HTMLElement>("[data-calligraphy-filter-empty]")
        ?.hidden,
    ).toBe(false);
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          "[data-view='calligraphy'] [data-category]",
        ),
      ].every((card) => card.hidden),
    ).toBe(true);

    document
      .querySelector<HTMLElement>('[data-calligraphy-category="all"]')
      ?.click();
    calligraphyFilter.value = "兰亭";
    calligraphyFilter.dispatchEvent(
      new dom.window.Event("input", { bubbles: true }),
    );
    expect(
      document.querySelector<HTMLElement>(
        '[data-content-id="calligraphy-lanting"]',
      )?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>(
        '[data-content-id="calligraphy-yanqinli"]',
      )?.hidden,
    ).toBe(true);
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
      const backButton = document.querySelector<HTMLElement>(
        "[data-settings-back]",
      );
      if (!backButton) throw new Error("settings back button not found");
      await clickAndWaitForHistory(dom.window, backButton);
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

  it("combines UA detection with viewport caps for phone, tablet, and desktop", () => {
    const phone = renderPreview({}, { viewportWidth: 1200 });
    expect(phone.window.document.documentElement.dataset.deviceClass).toBe(
      "phone",
    );
    expect(phone.window.document.documentElement.dataset.platform).toBe(
      "phone",
    );
    expect(activePlatformStyles(phone.window.document)).toEqual(["phone"]);

    const narrowTablet = renderPreview(
      {},
      {
        mobile: false,
        userAgent: tabletUserAgent,
        viewportWidth: 600,
      },
    );
    expect(
      narrowTablet.window.document.documentElement.dataset.deviceClass,
    ).toBe("tablet");
    expect(narrowTablet.window.document.documentElement.dataset.platform).toBe(
      "phone",
    );

    const wideTablet = renderPreview(
      {},
      {
        mobile: false,
        userAgent: tabletUserAgent,
        viewportWidth: 1366,
      },
    );
    expect(wideTablet.window.document.documentElement.dataset.platform).toBe(
      "tablet",
    );
    expect(activePlatformStyles(wideTablet.window.document)).toEqual([
      "tablet",
    ]);

    const classicIpad = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: false,
        userAgent: ipadUserAgent,
        viewportWidth: 834,
      },
    );
    expect(
      classicIpad.window.document.documentElement.dataset.deviceClass,
    ).toBe("tablet");
    expect(classicIpad.window.document.documentElement.dataset.platform).toBe(
      "tablet",
    );

    const ipadDesktopUa = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: false,
        userAgent: ipadDesktopUserAgent,
        viewportWidth: 1024,
      },
    );
    expect(
      ipadDesktopUa.window.document.documentElement.dataset.deviceClass,
    ).toBe("tablet");
    expect(ipadDesktopUa.window.document.documentElement.dataset.platform).toBe(
      "tablet",
    );

    for (const [viewportWidth, platform] of [
      [767, "phone"],
      [768, "tablet"],
      [895, "tablet"],
      [896, "pc"],
    ] as const) {
      const desktop = renderPreview(
        {},
        {
          maxTouchPoints: 0,
          mobile: false,
          userAgent: desktopUserAgent,
          viewportWidth,
        },
      );
      expect(desktop.window.document.documentElement.dataset.deviceClass).toBe(
        "desktop",
      );
      expect(desktop.window.document.documentElement.dataset.platform).toBe(
        platform,
      );
      expect(activePlatformStyles(desktop.window.document)).toEqual([platform]);
    }
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

    const backButton =
      document.querySelector<HTMLElement>("[data-detail-back]");
    if (!backButton) throw new Error("detail back button not found");
    await clickAndWaitForHistory(dom.window, backButton);
    expect(
      document.querySelector<HTMLElement>('[data-view="home"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>("[data-bottom-navigation]")?.hidden,
    ).toBe(false);
    expect(homeScroll.scrollTop).toBe(120);
  });

  it("isolates phone, tablet, and PC rules behind platform stylesheets", () => {
    expect(previewCss).not.toContain("@media (min-width: 48rem)");
    expect(tabletCss).toContain("@media (min-width: 48rem)");
    expect(tabletCss).toContain("@media (min-width: 56rem)");
    expect(tabletCss).not.toContain("@media (min-width: 64rem)");
    expect(tabletCss).not.toContain("@media (min-width: 90rem)");
    expect(pcCss).toContain("@media (min-width: 56rem)");
    expect(pcCss).toContain("@media (min-width: 64rem)");
    expect(pcCss).toContain("@media (min-width: 90rem)");
    expect(tabletCss).toContain(
      "/* PC (>=56rem): copy tablet-landscape rail only",
    );
    expect(tabletCss).toContain("orientation: landscape");
    expect(tabletCss).toContain("calc(88px + env(safe-area-inset-left))");
    expect(pcCss).toContain("calc(164px + env(safe-area-inset-left))");
    expect(pcCss).toContain("min-height: 58px");
    expect(pcCss).toContain("border-width: 9px 0 9px 10px");
    expect(pcCss).toContain('[data-setting-group="home-layout"]');
    expect(tabletCss).toContain("var(--yoyi-container-reading)");
    expect(pcCss).toContain("var(--yoyi-container-reading)");
    for (const css of [previewCss, tabletCss, pcCss]) {
      expect(css).toContain(".app-nav-brand");
      expect(css).toContain(".app-inscriptions-layout");
      expect(css).toContain(".app-inscriptions-preview");
      expect(css).toContain("--app-calligraphy-scale");
      expect(css).toContain("--app-motto-font");
    }
    expect(html).toContain("app-inscriptions-layout");
    expect(html).toContain("data-inscription-preview");
    expect(html).toContain("app-card__meta");
    expect(html).toContain('data-shell="list-head"');
    expect(html).toContain('data-shell="pagination"');
    expect(html).toContain('data-preview-tab="intro"');
    expect(html).toContain("data-shell-control");
    expect(html).toContain('data-primary-view="inscriptions"');
    expect(html).toContain('data-primary-view="calligraphy"');
    expect(html).toContain("yoyi.theme-preference");
    expect(html).toContain("yoyi.home-feed-layout");
    expect(html).toContain('data-home-feed="topics"');
    expect(html).toContain("app-home-motto");
    expect(html).toContain('data-placeholder="topics-v1"');
    expect(html).toContain('data-view="topic-column"');
    expect(html).toContain('data-setting-group="home-layout"');
    expect(html).toContain('src="./device-platform.js"');
    expect(html).toContain('data-platform-stylesheet="phone"');
    expect(html).toContain('data-platform-stylesheet="tablet"');
    expect(html).toContain('data-platform-stylesheet="pc"');
    expect(html).not.toContain("data-platform-gate");
    expect(previewCss).toContain(".app-home-motto");
    expect(previewCss).toContain(".app-topics__grid");
    expect(html).toContain("收藏");
    expect(html).not.toMatch(/关注|评论|登录|账号|地图/);
  });

  it("opens an editorial topic column from the topics feed", () => {
    const dom = renderPreview();
    const document = dom.window.document;

    document.querySelector<HTMLElement>('[data-home-feed="topics"]')?.click();
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="topics"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector("[data-open-topic]")?.getAttribute("data-kind"),
    ).toBe("editorialTopic");

    document.querySelector<HTMLElement>("[data-open-topic]")?.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="topic-column"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>("[data-bottom-navigation]")?.hidden,
    ).toBe(true);
    expect(
      document.querySelector("[data-topic-column-body]")?.textContent,
    ).toContain("专题/策展");
    expect(document.querySelector(".app-topic-video")).toBeTruthy();

    document.querySelector<HTMLElement>("[data-topic-back]")?.click();
  });

  it("keeps inscriptions beside the preview in the PC shell", () => {
    const dom = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportWidth: 1024,
      },
    );
    const document = dom.window.document;

    expect(document.documentElement.dataset.platform).toBe("pc");

    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();

    expect(
      document.querySelector<HTMLElement>("[data-inscription-preview]")?.hidden,
    ).toBe(false);

    document
      .querySelector<HTMLElement>(
        '[data-view="inscriptions"] [data-content-id="inscription-yunfeng"]',
      )
      ?.click();

    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "云峰山题名",
    );
    expect(
      document.querySelector("[data-inscription-preview-title]")?.textContent,
    ).toBe("云峰山题名");
  });

  it("moves an open inscription detail across the 896px shell boundary", () => {
    const dom = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportWidth: 895,
      },
    );
    const document = dom.window.document;

    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    document
      .querySelector<HTMLElement>(
        '[data-view="inscriptions"] [data-content-id="inscription-yunfeng"]',
      )
      ?.click();
    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);

    setViewportWidth(dom, 896);
    expect(document.documentElement.dataset.platform).toBe("pc");
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>("[data-inscription-preview-content]")
        ?.hidden,
    ).toBe(false);

    setViewportWidth(dom, 895);
    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
  });
});
