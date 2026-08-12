import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

type PreviewDom = {
  window: Window & typeof globalThis;
};

type DesktopController = {
  setDesktop: (matches: boolean) => void;
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
const topicsFixture = await readFile(
  new URL("fixtures/topics.placeholder.js", previewRoot),
  "utf8",
);
const previewCss = await readFile(new URL("preview.css", previewRoot), "utf8");

const openWindows: Window[] = [];
const desktopControllers = new WeakMap<Window, DesktopController>();

const installMatchMedia = (
  window: Window,
  {
    desktop = false,
    desktopPlatform = desktop,
  }: { desktop?: boolean; desktopPlatform?: boolean } = {},
) => {
  const mediaQueries: Array<{
    listeners: Set<(event: MediaQueryListEvent) => void>;
    media: string;
  }> = [];
  let desktopShell = desktop;
  let pcPlatform = desktopPlatform;

  const matchesQuery = (media: string) => {
    if (media.includes("64rem")) return desktopShell;
    if (media.includes("56rem") || media.includes("48rem")) {
      return pcPlatform || desktopShell;
    }
    return false;
  };

  window.matchMedia = ((query: string) => {
    const media = String(query);
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    mediaQueries.push({ listeners, media });
    return {
      get matches() {
        return matchesQuery(media);
      },
      media,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener(
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) {
        if (type === "change") listeners.add(listener);
      },
      removeEventListener(
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) {
        if (type === "change") listeners.delete(listener);
      },
      dispatchEvent() {
        return false;
      },
    } as MediaQueryList;
  }) as typeof window.matchMedia;
  const controller = {
    setDesktop(matches: boolean) {
      desktopShell = matches;
      pcPlatform = matches;
      mediaQueries.forEach(({ listeners, media }) => {
        const event = {
          matches: matchesQuery(media),
          media,
        } as MediaQueryListEvent;
        listeners.forEach((listener) => listener(event));
      });
    },
  };
  desktopControllers.set(window, controller);
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
  {
    desktop = false,
    desktopPlatform = desktop,
  }: { desktop?: boolean; desktopPlatform?: boolean } = {},
) => {
  const withoutExternalScript = html
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
  installMatchMedia(dom.window, { desktop, desktopPlatform });
  for (const [key, value] of Object.entries(preferences)) {
    dom.window.localStorage.setItem(key, value);
  }
  dom.window.eval(topicsFixture);
  dom.window.eval(script);
  return dom;
};

afterEach(() => {
  for (const window of openWindows.splice(0)) window.close();
});

describe("dual-shell interaction preview", () => {
  it("starts in the compact shell and removes the desktop shell from interaction", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const compact = document.querySelector<HTMLElement>(
      '[data-shell-root="compact"]',
    );
    const desktop = document.querySelector<HTMLElement>(
      '[data-shell-root="desktop"]',
    );

    expect(document.documentElement.dataset.activeShell).toBe("compact");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.dataset.homeLayout).toBe("double");
    expect(compact?.getAttribute("aria-hidden")).toBe("false");
    expect(compact?.hasAttribute("inert")).toBe(false);
    expect(desktop?.getAttribute("aria-hidden")).toBe("true");
    expect(desktop?.hasAttribute("inert")).toBe(true);
    expect(
      compact?.querySelector<HTMLElement>('[data-view="home"]')?.hidden,
    ).toBe(false);
    expect(
      compact?.querySelector<HTMLElement>('[data-feed-panel="discover"]')
        ?.hidden,
    ).toBe(false);
    expect(
      compact?.querySelector<HTMLElement>('[data-feed-panel="nearby"]')?.hidden,
    ).toBe(true);
    expect(
      document.querySelector("[data-loading-screen] .app-loading__motto")
        ?.textContent,
    ).toContain("志于道，据于德，依于仁，游于艺");
    expect(
      compact?.querySelector("[data-bottom-navigation] .yoyi-logo"),
    ).toBeTruthy();
    expect(
      compact
        ?.querySelector("[data-bottom-navigation] .yoyi-logo")
        ?.closest(".app-nav-brand"),
    ).toBeTruthy();
    expect(compact?.querySelectorAll("[data-primary-view]")).toHaveLength(3);
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
    expect(compact?.querySelectorAll("[data-open-settings]")).toHaveLength(3);
    expect(document.querySelector("[data-calligraphy-filter]")).toBeTruthy();
    expect(document.querySelector("[data-theme-cycle]")).toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-view="settings"]')?.hidden,
    ).toBe(true);
    expect(html.indexOf("yoyi.theme-preference")).toBeLessThan(
      html.indexOf("theme.css"),
    );
  });

  it("activates the archived desktop composition at the 1024px shell", async () => {
    const dom = renderPreview({}, { desktop: true });
    const document = dom.window.document;
    const compact = document.querySelector<HTMLElement>(
      '[data-shell-root="compact"]',
    );
    const desktop = document.querySelector<HTMLElement>(
      '[data-shell-root="desktop"]',
    );

    expect(document.documentElement.dataset.activeShell).toBe("desktop");
    expect(compact?.getAttribute("aria-hidden")).toBe("true");
    expect(compact?.hasAttribute("inert")).toBe(true);
    expect(desktop?.getAttribute("aria-hidden")).toBe("false");
    expect(desktop?.hasAttribute("inert")).toBe(false);
    expect(desktop?.querySelector(".desktop-brand__name")?.textContent).toBe(
      "由艺",
    );
    expect(desktop?.querySelectorAll("[data-prototype-stat]")).toHaveLength(3);
    expect(
      [...(desktop?.querySelectorAll("[data-prototype-stat]") ?? [])].map(
        (stat) => stat.textContent,
      ),
    ).toEqual(["8", "6", "8"]);
    expect(desktop?.textContent).toContain("原型数据");
    expect(desktop?.querySelectorAll("[data-quick-action]")).toHaveLength(4);
    for (const label of ["朝代浏览", "地区浏览", "书体分类", "时间轴"]) {
      expect(desktop?.textContent).toContain(label);
    }

    desktop?.querySelector<HTMLElement>("[data-focus-search]")?.click();
    await new Promise<void>((resolve) =>
      dom.window.requestAnimationFrame(() => resolve()),
    );
    expect(document.activeElement).toBe(
      desktop?.querySelector(
        '[data-view="inscriptions"] [data-inscription-search]',
      ),
    );
  });

  it("synchronizes primary navigation, search, and calligraphy filters", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const compact = document.querySelector<HTMLElement>(
      '[data-shell-root="compact"]',
    );

    compact
      ?.querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    expect(
      document.querySelectorAll<HTMLElement>('[data-view="home"]')[0]?.hidden,
    ).toBe(true);
    expect(
      [
        ...document.querySelectorAll<HTMLElement>('[data-view="inscriptions"]'),
      ].every((view) => !view.hidden),
    ).toBe(true);

    const input = compact?.querySelector<HTMLInputElement>(
      "[data-inscription-search]",
    );
    if (!input) throw new Error("compact search input not found");
    input.value = "不存在";
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          "[data-inscription-search]",
        ),
      ].every((search) => search.value === "不存在"),
    ).toBe(true);
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-search-text]")].every(
        (item) => item.hidden,
      ),
    ).toBe(true);
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-search-empty]")].every(
        (empty) => !empty.hidden,
      ),
    ).toBe(true);

    compact
      ?.querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    compact
      ?.querySelector<HTMLElement>('[data-calligraphy-category="rubbing"]')
      ?.click();
    const inkCards = [
      ...(compact?.querySelectorAll<HTMLElement>('[data-category="ink"]') ??
        []),
    ];
    const rubbingCards = [
      ...(compact?.querySelectorAll<HTMLElement>('[data-category="rubbing"]') ??
        []),
    ];
    expect(inkCards.every((card) => card.hidden)).toBe(true);
    expect(rubbingCards.every((card) => !card.hidden)).toBe(true);

    const calligraphyFilter = compact?.querySelector<HTMLInputElement>(
      "[data-calligraphy-filter]",
    );
    if (!calligraphyFilter) throw new Error("calligraphy filter not found");
    calligraphyFilter.value = "不存在的书帖";
    calligraphyFilter.dispatchEvent(
      new dom.window.Event("input", { bubbles: true }),
    );
    expect(
      compact?.querySelector<HTMLElement>("[data-calligraphy-filter-empty]")
        ?.hidden,
    ).toBe(false);
    expect(
      [
        ...(compact?.querySelectorAll<HTMLElement>(
          "[data-view='calligraphy'] [data-category]",
        ) ?? []),
      ].every((card) => card.hidden),
    ).toBe(true);

    compact
      ?.querySelector<HTMLElement>('[data-calligraphy-category="all"]')
      ?.click();
    calligraphyFilter.value = "兰亭";
    calligraphyFilter.dispatchEvent(
      new dom.window.Event("input", { bubbles: true }),
    );
    expect(
      compact?.querySelector<HTMLElement>(
        '[data-content-id="calligraphy-lanting"]',
      )?.hidden,
    ).toBe(false);
    expect(
      compact?.querySelector<HTMLElement>(
        '[data-content-id="calligraphy-yanqinli"]',
      )?.hidden,
    ).toBe(true);
  });

  it("shares settings preferences across both shells", () => {
    const dom = renderPreview({}, { desktop: true });
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>(
        '[data-shell-root="desktop"] [data-open-settings]',
      )
      ?.click();

    const dark = document.querySelector<HTMLInputElement>(
      '[data-shell-root="desktop"] [data-theme-option][value="dark"]',
    );
    const single = document.querySelector<HTMLInputElement>(
      '[data-shell-root="desktop"] [data-layout-option][value="single"]',
    );
    if (!dark || !single) throw new Error("desktop settings options not found");
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
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          '[data-theme-option][value="dark"]',
        ),
      ].every((option) => option.checked),
    ).toBe(true);
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          '[data-layout-option][value="single"]',
        ),
      ].every((option) => option.checked),
    ).toBe(true);
  });

  it("restores valid preferences and rejects invalid stored values", () => {
    const stored = renderPreview({
      "yoyi.home-feed-layout": "single",
      "yoyi.theme-preference": "dark",
    });
    expect(stored.window.document.documentElement.dataset.theme).toBe("dark");
    expect(stored.window.document.documentElement.dataset.homeLayout).toBe(
      "single",
    );

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

  it("opens synchronized detail content and returns with deterministic history", async () => {
    const dom = renderPreview({}, { desktop: true });
    const document = dom.window.document;
    const desktop = document.querySelector<HTMLElement>(
      '[data-shell-root="desktop"]',
    );
    desktop
      ?.querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    desktop
      ?.querySelector<HTMLElement>(
        '[data-view="inscriptions"] [data-content-id="inscription-yunfeng"]',
      )
      ?.click();

    expect(
      [...document.querySelectorAll<HTMLElement>('[data-view="detail"]')].every(
        (view) => !view.hidden,
      ),
    ).toBe(true);
    expect(
      [...document.querySelectorAll("[data-detail-title]")].every(
        (title) => title.textContent === "云峰山题名",
      ),
    ).toBe(true);
    expect(document.querySelector("[data-detail-meta]")?.textContent).toContain(
      "北魏",
    );

    const back = desktop?.querySelector<HTMLElement>("[data-detail-back]");
    if (!back) throw new Error("desktop detail back button not found");
    await clickAndWaitForHistory(dom.window, back);
    expect(
      desktop?.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);
  });

  it("opens the compact editorial topic and falls back safely at the desktop shell", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const compact = document.querySelector<HTMLElement>(
      '[data-shell-root="compact"]',
    );

    compact?.querySelector<HTMLElement>('[data-home-feed="topics"]')?.click();
    expect(
      compact?.querySelector<HTMLElement>('[data-feed-panel="topics"]')?.hidden,
    ).toBe(false);
    expect(
      compact?.querySelector("[data-open-topic]")?.getAttribute("data-kind"),
    ).toBe("editorialTopic");

    compact?.querySelector<HTMLElement>("[data-open-topic]")?.click();
    expect(
      compact?.querySelector<HTMLElement>('[data-view="topic-column"]')?.hidden,
    ).toBe(false);
    expect(
      compact?.querySelector<HTMLElement>("[data-bottom-navigation]")?.hidden,
    ).toBe(true);
    expect(
      compact?.querySelector("[data-topic-column-body]")?.textContent,
    ).toContain("专题/策展");
    expect(compact?.querySelector(".app-topic-video")).toBeTruthy();

    const controller = desktopControllers.get(dom.window);
    if (!controller) throw new Error("desktop controller not found");
    controller.setDesktop(true);
    expect(document.documentElement.dataset.activeShell).toBe("desktop");
    expect(
      document.querySelector<HTMLElement>(
        '[data-shell-root="desktop"] [data-view="home"]',
      )?.hidden,
    ).toBe(false);
  });

  it("marks the 896px compact range as pc and opens detail without split", () => {
    const dom = renderPreview({}, { desktopPlatform: true });
    const document = dom.window.document;
    const compact = document.querySelector<HTMLElement>(
      '[data-shell-root="compact"]',
    );

    expect(document.documentElement.dataset.platform).toBe("pc");
    expect(document.documentElement.dataset.activeShell).toBe("compact");

    compact
      ?.querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    expect(
      compact?.querySelector<HTMLElement>("[data-inscription-preview]")?.hidden,
    ).toBe(true);

    compact
      ?.querySelector<HTMLElement>(
        '[data-view="inscriptions"] [data-content-id="inscription-yunfeng"]',
      )
      ?.click();
    expect(
      compact?.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
    expect(
      compact?.querySelector<HTMLElement>("[data-detail-title]")?.textContent,
    ).toBe("云峰山题名");
  });

  it("returns from settings to each source view with deterministic history", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const compact = document.querySelector<HTMLElement>(
      '[data-shell-root="compact"]',
    );

    for (const view of ["home", "inscriptions", "calligraphy"]) {
      compact
        ?.querySelector<HTMLElement>(`[data-primary-view="${view}"]`)
        ?.click();
      compact
        ?.querySelector<HTMLElement>(
          `[data-view="${view}"] [data-open-settings]`,
        )
        ?.click();
      expect(
        compact?.querySelector<HTMLElement>('[data-view="settings"]')?.hidden,
      ).toBe(false);
      const back = compact?.querySelector<HTMLElement>("[data-settings-back]");
      if (!back) throw new Error("compact settings back button not found");
      await clickAndWaitForHistory(dom.window, back);
      expect(
        compact?.querySelector<HTMLElement>(`[data-view="${view}"]`)?.hidden,
      ).toBe(false);
    }
  });

  it("announces unavailable archived quick actions accessibly", () => {
    const dom = renderPreview({}, { desktop: true });
    const document = dom.window.document;
    const action = document.querySelector<HTMLElement>(
      '[data-shell-root="desktop"] [data-quick-action="朝代浏览"]',
    );
    const status = document.querySelector<HTMLElement>(
      '[data-shell-root="desktop"] [data-temporary-status]',
    );

    action?.click();
    expect(status?.hidden).toBe(false);
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("朝代浏览：原型暂未实现");
  });

  it("preserves page, filters, query, and preferences across 1023 to 1024", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const compact = document.querySelector<HTMLElement>(
      '[data-shell-root="compact"]',
    );
    compact
      ?.querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    compact
      ?.querySelector<HTMLElement>('[data-calligraphy-category="ink"]')
      ?.click();
    const compactSearch = compact?.querySelector<HTMLInputElement>(
      "[data-inscription-search]",
    );
    if (!compactSearch) throw new Error("compact search input not found");
    compactSearch.value = "云峰";
    compactSearch.dispatchEvent(
      new dom.window.Event("input", { bubbles: true }),
    );

    const controller = desktopControllers.get(dom.window);
    if (!controller) throw new Error("desktop controller not found");
    controller.setDesktop(true);

    const desktop = document.querySelector<HTMLElement>(
      '[data-shell-root="desktop"]',
    );
    expect(document.documentElement.dataset.activeShell).toBe("desktop");
    expect(compact?.hasAttribute("inert")).toBe(true);
    expect(desktop?.hasAttribute("inert")).toBe(false);
    expect(
      desktop?.querySelector<HTMLElement>('[data-view="calligraphy"]')?.hidden,
    ).toBe(false);
    expect(
      desktop?.querySelector<HTMLInputElement>("[data-inscription-search]")
        ?.value,
    ).toBe("云峰");
    expect(
      desktop
        ?.querySelector<HTMLInputElement>('[data-calligraphy-category="ink"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("documents the tablet exception and desktop shell breakpoint", () => {
    expect(previewCss).toContain("@media (min-width: 48rem)");
    expect(previewCss).toContain("max-width: 63.99875rem");
    expect(previewCss).toContain("@media (min-width: 64rem)");
    expect(previewCss).toContain("orientation: landscape");
    expect(previewCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(previewCss).toContain("scroll-behavior: auto");
    expect(previewCss).toContain(".desktop-app");
    expect(previewCss).toContain(".mobile-app");
    expect(previewCss).toContain("var(--yoyi-color-seal-red)");
    expect(previewCss).toContain("var(--yoyi-container-content)");
    expect(previewCss).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(html).toContain('data-shell-root="compact"');
    expect(html).toContain('data-shell-root="desktop"');
    expect(html).toContain('data-primary-view="home"');
    expect(html).toContain('data-primary-view="inscriptions"');
    expect(html).toContain('data-primary-view="calligraphy"');
    expect(html).toContain('data-home-feed="topics"');
    expect(html).toContain('data-placeholder="topics-v1"');
    expect(html).toContain('data-view="topic-column"');
    expect(previewCss).toContain(".app-home-motto");
    expect(previewCss).toContain(".app-topics__grid");
    expect(html).not.toMatch(/关注|评论|登录|账号|地图/);
    expect(html).toContain("yoyi.theme-preference");
    expect(html).toContain("yoyi.home-feed-layout");
  });
});
