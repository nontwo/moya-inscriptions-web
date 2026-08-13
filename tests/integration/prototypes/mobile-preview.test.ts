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
const homeFeedFixture = await readFile(
  new URL("fixtures/home-feed.placeholder.js", previewRoot),
  "utf8",
);
const topicsFixture = await readFile(
  new URL("fixtures/topics.placeholder.js", previewRoot),
  "utf8",
);
const sharedCss = await readFile(
  new URL("preview.shared.css", previewRoot),
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

const topLevelCssChunks = (source: string) => {
  const chunks: string[] = [];
  let depth = 0;
  let start = 0;
  let inComment = false;
  let quote = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (character === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && character === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        chunks.push(source.slice(start, index + 1).trim());
        start = index + 1;
      }
    }
  }

  return chunks;
};

const normalizeCssChunk = (chunk: string) =>
  chunk.replace(/^(?:\/\*[\s\S]*?\*\/\s*)+/, "").trim();

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
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: new window.EventTarget(),
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
  prepareWindow?: (window: Window & typeof globalThis) => void,
) => {
  const withoutExternalScript = html
    .replace(/<script src="\.\/device-platform\.js"><\/script>/, "")
    .replace(
      /<script src="\.\/fixtures\/home-feed\.placeholder\.js"><\/script>/,
      "",
    )
    .replace(
      /<script src="\.\/fixtures\/topics\.placeholder\.js"><\/script>/,
      "",
    )
    .replace(
      /<script(?: type="module")? src="\.\/preview\.js(?:\?[^"]*)?"><\/script>/,
      "",
    );
  const dom = new JSDOM(withoutExternalScript, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url: "http://localhost/docs/prototypes/mobile-preview/",
  });
  openWindows.push(dom.window);
  installDeviceEnvironment(dom.window, deviceOptions);
  prepareWindow?.(dom.window);
  for (const [key, value] of Object.entries(preferences)) {
    dom.window.localStorage.setItem(key, value);
  }
  dom.window.eval(devicePlatformScript);
  dom.window.eval(homeFeedFixture);
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

const setViewportWidthWithoutEvent = (
  dom: PreviewDom,
  viewportWidth: number,
) => {
  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
    writable: true,
  });
};

type PointerOptions = {
  clientX: number;
  clientY: number;
  isPrimary?: boolean;
  pointerId?: number;
  pointerType?: string;
  timeStamp?: number;
};

const dispatchPointer = (
  window: Window & typeof globalThis,
  target: Element,
  type: string,
  {
    clientX,
    clientY,
    isPrimary = true,
    pointerId = 1,
    pointerType = "touch",
    timeStamp,
  }: PointerOptions,
) => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX,
    clientY,
    isPrimary,
    pointerId,
    pointerType,
  });
  if (timeStamp !== undefined) {
    Object.defineProperty(event, "timeStamp", {
      configurable: true,
      value: timeStamp,
    });
  }
  target.dispatchEvent(event);
};

const swipe = (
  window: Window & typeof globalThis,
  target: Element,
  start: { x: number; y: number },
  end: { x: number; y: number },
  pointerType = "touch",
  durationMs = 400,
) => {
  const startTime = 1_000;
  dispatchPointer(window, target, "pointerdown", {
    clientX: start.x,
    clientY: start.y,
    pointerType,
    timeStamp: startTime,
  });
  dispatchPointer(window, target, "pointermove", {
    clientX: end.x,
    clientY: end.y,
    pointerType,
    timeStamp: startTime + durationMs * 0.8,
  });
  dispatchPointer(window, target, "pointerup", {
    clientX: end.x,
    clientY: end.y,
    pointerType,
    timeStamp: startTime + durationMs,
  });
};

const dispatchWheel = (
  window: Window & typeof globalThis,
  target: Element,
  {
    deltaX = 0,
    deltaY = 0,
    ctrlKey = false,
  }: { deltaX?: number; deltaY?: number; ctrlKey?: boolean },
) => {
  const event = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey,
    deltaX,
    deltaY,
  });
  target.dispatchEvent(event);
};

const pagerTranslateX = (track: HTMLElement) => {
  const match = track.style.transform.match(
    /translate3d\((-?[\d.]+)px, 0(?:px)?, 0(?:px)?\)/,
  );
  if (!match)
    throw new Error(`unexpected pager transform: ${track.style.transform}`);
  return Number(match[1]);
};

const waitForAnimationFrames = async (window: Window, count: number) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
  }
};

const installControlledAnimationFrames = (
  window: Window & typeof globalThis,
) => {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      const id = nextId;
      nextId += 1;
      callbacks.set(id, callback);
      return id;
    },
  });
  Object.defineProperty(window, "cancelAnimationFrame", {
    configurable: true,
    value: (id: number) => callbacks.delete(id),
  });

  const step = (timestamp: number) => {
    const current = [...callbacks.values()];
    callbacks.clear();
    current.forEach((callback) => callback(timestamp));
  };

  const runUntilIdle = (frameDurationMs: number, maximumTimeMs = 2_000) => {
    let timestamp = 0;
    while (callbacks.size > 0 && timestamp <= maximumTimeMs) {
      step(timestamp);
      timestamp += frameDurationMs;
    }
    if (callbacks.size > 0) {
      throw new Error(`animation still running after ${maximumTimeMs}ms`);
    }
    return Math.max(0, timestamp - frameDurationMs);
  };

  return {
    pending: () => callbacks.size,
    runUntilIdle,
    step,
  };
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
    ).toBe(false);
    expect(
      document
        .querySelector<HTMLElement>('[data-feed-panel="nearby"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.content,
    ).toContain("user-scalable=no");
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
      document
        .querySelector("[data-bottom-navigation]")
        ?.classList.contains("yoyi-functional-glass"),
    ).toBe(true);
    expect(
      document
        .querySelector("[data-bottom-navigation]")
        ?.getAttribute("data-minimize-behavior"),
    ).toBe("on-scroll-down");
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
    expect(document.querySelector(".app-home-motto")).toBeNull();
    expect(
      document.querySelectorAll(
        '[data-feed-panel="discover"] [data-open-detail]',
      ),
    ).toHaveLength(12);
    expect(
      document.querySelectorAll(
        '[data-feed-panel="nearby"] [data-open-detail]',
      ),
    ).toHaveLength(12);
    for (const feed of ["discover", "nearby"]) {
      const page = document.querySelector<HTMLElement>(
        `[data-feed-panel="${feed}"]`,
      );
      expect(page?.classList.contains("app-masonry")).toBe(false);
      expect(
        page?.querySelector(`:scope > [data-feed-grid="${feed}"]`),
      ).toBeTruthy();
    }
    expect(document.querySelectorAll("[data-open-topic]")).toHaveLength(8);
    const topicRecords = (
      dom.window as unknown as {
        YOYI_TOPICS_PLACEHOLDER: { topicCards: Array<{ blocks: unknown[] }> };
      }
    ).YOYI_TOPICS_PLACEHOLDER.topicCards;
    expect(topicRecords.every((topic) => topic.blocks.length >= 4)).toBe(true);
    const contentIds = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-pager="home"] [data-content-id]',
      ),
    ].map((element) => element.dataset.contentId);
    expect(new Set(contentIds).size).toBe(contentIds.length);
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

  it("opens every supplemental home card with the existing detail behavior", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const supplementalCards = (
      dom.window as unknown as {
        YOYI_HOME_FEED_PLACEHOLDER: {
          feedCards: Record<string, Array<{ id: string; title: string }>>;
        };
      }
    ).YOYI_HOME_FEED_PLACEHOLDER.feedCards;

    Object.values(supplementalCards)
      .flat()
      .forEach((card) => {
        document
          .querySelector<HTMLElement>(`[data-content-id="${card.id}"]`)
          ?.click();
        expect(
          document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
        ).toBe(false);
        expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
          card.title,
        );
      });
  });

  it("keeps immediate vertical scrolling on first feed and topic entry", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const feedCases = [
      { feed: "discover", scrollTop: 54 },
      { feed: "nearby", scrollTop: 96 },
      { feed: "topics", scrollTop: 138 },
    ];

    for (const { feed, scrollTop } of feedCases) {
      document
        .querySelector<HTMLElement>(`[data-home-feed="${feed}"]`)
        ?.click();
      const page = document.querySelector<HTMLElement>(
        `[data-feed-panel="${feed}"]`,
      );
      if (!page) throw new Error(`${feed} page missing`);
      page.scrollTop = scrollTop;
      page.dispatchEvent(new dom.window.Event("scroll"));
      await waitForAnimationFrames(dom.window, 2);
      expect(page.scrollTop).toBe(scrollTop);
    }

    document.querySelector<HTMLElement>("[data-open-topic]")?.click();
    const topicBody = document.querySelector<HTMLElement>(
      "[data-topic-column-body]",
    );
    if (!topicBody) throw new Error("topic body missing");
    topicBody.scrollTop = 72;
    topicBody.dispatchEvent(new dom.window.Event("scroll"));
    await waitForAnimationFrames(dom.window, 2);
    expect(topicBody.scrollTop).toBe(72);
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
    const activeRubbingPage = document.querySelector<HTMLElement>(
      '[data-pager="calligraphy"] [data-pager-page="rubbing"]',
    );
    expect(activeRubbingPage?.getAttribute("aria-hidden")).toBe("false");
    expect(
      [
        ...(activeRubbingPage?.querySelectorAll<HTMLElement>(
          '[data-category="rubbing"]',
        ) ?? []),
      ].every((card) => !card.hidden),
    ).toBe(true);
    expect(
      activeRubbingPage?.querySelector('[data-category="ink"]'),
    ).toBeNull();

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

  it("follows the finger and settles home pages at the 50 percent boundary", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const homeScroll = document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    const homeTrack =
      homeScroll?.querySelector<HTMLElement>("[data-pager-track]");
    const discoverCard = document.querySelector<HTMLElement>(
      '[data-content-id="discover-cliff-gate"]',
    );
    if (!homeScroll || !homeTrack || !discoverCard) {
      throw new Error("home swipe surface missing");
    }

    dispatchPointer(dom.window, discoverCard, "pointerdown", {
      clientX: 300,
      clientY: 160,
      timeStamp: 1_000,
    });
    dispatchPointer(dom.window, discoverCard, "pointermove", {
      clientX: 202.5,
      clientY: 162,
      timeStamp: 1_320,
    });
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-97.5);
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="discover"]')
        ?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="nearby"]')?.hidden,
    ).toBe(false);
    dispatchPointer(dom.window, discoverCard, "pointerup", {
      clientX: 202.5,
      clientY: 162,
      timeStamp: 1_400,
    });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");
    await waitForAnimationFrames(dom.window, 40);

    swipe(dom.window, discoverCard, { x: 300, y: 160 }, { x: 108.9, y: 160 });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");
    await waitForAnimationFrames(dom.window, 40);

    swipe(dom.window, discoverCard, { x: 300, y: 160 }, { x: 105, y: 160 });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");
    await waitForAnimationFrames(dom.window, 40);

    swipe(dom.window, discoverCard, { x: 300, y: 160 }, { x: 101.1, y: 160 });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.classList,
    ).toContain("is-selected");
    discoverCard.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(true);
    await waitForAnimationFrames(dom.window, 40);
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-390);

    swipe(dom.window, homeScroll, { x: 390, y: 160 }, { x: 0, y: 160 });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="topics"]')
        ?.classList,
    ).toContain("is-selected");
    await waitForAnimationFrames(dom.window, 40);
    dispatchPointer(dom.window, homeScroll, "pointerdown", {
      clientX: 300,
      clientY: 160,
      timeStamp: 2_000,
    });
    dispatchPointer(dom.window, homeScroll, "pointermove", {
      clientX: 100,
      clientY: 160,
      timeStamp: 2_320,
    });
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-830);
    dispatchPointer(dom.window, homeScroll, "pointerup", {
      clientX: 100,
      clientY: 160,
      timeStamp: 2_400,
    });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="topics"]')
        ?.classList,
    ).toContain("is-selected");
    await waitForAnimationFrames(dom.window, 40);

    swipe(dom.window, homeScroll, { x: 0, y: 160 }, { x: 390, y: 160 });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.classList,
    ).toContain("is-selected");
  });

  it("uses smoothed release velocity for light flicks and caps extreme input", () => {
    const slowDom = renderPreview();
    const slowSurface = slowDom.window.document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    if (!slowSurface) throw new Error("slow swipe surface missing");
    swipe(
      slowDom.window,
      slowSurface,
      { x: 300, y: 160 },
      { x: 183, y: 160 },
      "touch",
      500,
    );
    expect(
      slowDom.window.document.querySelector<HTMLElement>(
        '[data-home-feed="discover"]',
      )?.classList,
    ).toContain("is-selected");

    const fastDom = renderPreview();
    const fastSurface = fastDom.window.document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    const fastTrack =
      fastSurface?.querySelector<HTMLElement>("[data-pager-track]");
    if (!fastSurface || !fastTrack) {
      throw new Error("fast swipe surface missing");
    }
    const frames = installControlledAnimationFrames(fastDom.window);
    swipe(
      fastDom.window,
      fastSurface,
      { x: 300, y: 160 },
      { x: 183, y: 160 },
      "touch",
      1,
    );
    expect(
      fastDom.window.document.querySelector<HTMLElement>(
        '[data-home-feed="nearby"]',
      )?.classList,
    ).toContain("is-selected");
    expect(frames.pending()).toBeGreaterThan(0);
    frames.step(0);
    expect(pagerTranslateX(fastTrack)).toBeLessThan(-117);
    expect(pagerTranslateX(fastTrack)).toBeGreaterThan(-180);

    const edgeDom = renderPreview();
    const edgeSurface = edgeDom.window.document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    if (!edgeSurface) throw new Error("edge swipe surface missing");
    swipe(
      edgeDom.window,
      edgeSurface,
      { x: 180, y: 160 },
      { x: 230, y: 160 },
      "touch",
      1,
    );
    expect(
      edgeDom.window.document.querySelector<HTMLElement>(
        '[data-home-feed="discover"]',
      )?.classList,
    ).toContain("is-selected");
  });

  it("lets a new touch catch an in-flight spring without a position jump", () => {
    const dom = renderPreview();
    const surface = dom.window.document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    const track = surface?.querySelector<HTMLElement>("[data-pager-track]");
    if (!surface || !track) throw new Error("home pager missing");
    const frames = installControlledAnimationFrames(dom.window);

    swipe(dom.window, surface, { x: 300, y: 160 }, { x: 101.1, y: 160 });
    frames.step(0);
    frames.step(1000 / 60);
    const caughtOffset = pagerTranslateX(track);
    expect(frames.pending()).toBe(1);

    dispatchPointer(dom.window, surface, "pointerdown", {
      clientX: 200,
      clientY: 160,
      timeStamp: 2_000,
    });
    expect(frames.pending()).toBe(0);
    expect(pagerTranslateX(track)).toBeCloseTo(caughtOffset);
    dispatchPointer(dom.window, surface, "pointermove", {
      clientX: 220,
      clientY: 160,
      timeStamp: 2_080,
    });
    expect(pagerTranslateX(track)).toBeCloseTo(caughtOffset + 20);
    dispatchPointer(dom.window, surface, "pointermove", {
      clientX: 300,
      clientY: 160,
      timeStamp: 2_500,
    });
    dispatchPointer(dom.window, surface, "pointerup", {
      clientX: 300,
      clientY: 160,
      timeStamp: 2_600,
    });
    expect(
      dom.window.document.querySelector<HTMLElement>(
        '[data-home-feed="discover"]',
      )?.classList,
    ).toContain("is-selected");
  });

  it("converges consistently at 60Hz, 120Hz, and after long frames", () => {
    const settleAtCadence = (frameDurationMs: number) => {
      const dom = renderPreview();
      const surface = dom.window.document.querySelector<HTMLElement>(
        '[data-scroll-view="home"]',
      );
      const track = surface?.querySelector<HTMLElement>("[data-pager-track]");
      if (!surface || !track) throw new Error("home pager missing");
      const frames = installControlledAnimationFrames(dom.window);
      swipe(dom.window, surface, { x: 300, y: 160 }, { x: 101.1, y: 160 });
      const settledAt = frames.runUntilIdle(frameDurationMs);
      expect(pagerTranslateX(track)).toBeCloseTo(-390);
      expect(track.classList).not.toContain("is-settling");
      return settledAt;
    };

    expect(settleAtCadence(1000 / 60)).toBeLessThanOrEqual(520 + 1000 / 60);
    expect(settleAtCadence(1000 / 120)).toBeLessThanOrEqual(520 + 1000 / 120);
    expect(settleAtCadence(120)).toBeLessThanOrEqual(640);
  });

  it("snaps immediately when reduced motion is requested", () => {
    const dom = renderPreview();
    Object.defineProperty(dom.window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
      }),
    });
    const surface = dom.window.document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    const track = surface?.querySelector<HTMLElement>("[data-pager-track]");
    if (!surface || !track) throw new Error("home pager missing");

    swipe(dom.window, surface, { x: 300, y: 160 }, { x: 101.1, y: 160 });
    expect(pagerTranslateX(track)).toBeCloseTo(-390);
    expect(track.classList).not.toContain("is-settling");
  });

  it("switches calligraphy categories without losing search or scroll state", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    const calligraphyScroll = document.querySelector<HTMLElement>(
      '[data-scroll-key="calligraphy:all"]',
    );
    const calligraphyFilter = document.querySelector<HTMLInputElement>(
      "[data-calligraphy-filter]",
    );
    const allPage = document.querySelector<HTMLElement>(
      '[data-scroll-key="calligraphy:all"]',
    );
    const inkPage = document.querySelector<HTMLElement>(
      '[data-scroll-key="calligraphy:ink"]',
    );
    const rubbingPage = document.querySelector<HTMLElement>(
      '[data-scroll-key="calligraphy:rubbing"]',
    );
    if (
      !calligraphyScroll ||
      !calligraphyFilter ||
      !allPage ||
      !inkPage ||
      !rubbingPage
    ) {
      throw new Error("calligraphy swipe surface missing");
    }
    calligraphyFilter.value = "唐";
    calligraphyFilter.dispatchEvent(
      new dom.window.Event("input", { bubbles: true }),
    );
    allPage.scrollTop = 96;
    allPage.dispatchEvent(new dom.window.Event("scroll"));

    swipe(dom.window, calligraphyScroll, { x: 300, y: 180 }, { x: 90, y: 185 });
    expect(
      document.querySelector<HTMLElement>('[data-calligraphy-category="ink"]')
        ?.classList,
    ).toContain("is-selected");
    expect(calligraphyFilter.value).toBe("唐");
    expect(allPage.scrollTop).toBe(96);
    expect(inkPage.getAttribute("aria-hidden")).toBe("false");
    expect(
      [...inkPage.querySelectorAll<HTMLElement>("[data-category]")].every(
        (card) => card.dataset.category === "ink",
      ),
    ).toBe(true);
    await waitForAnimationFrames(dom.window, 40);
    inkPage.scrollTop = 42;
    inkPage.dispatchEvent(new dom.window.Event("scroll"));

    swipe(dom.window, calligraphyScroll, { x: 300, y: 180 }, { x: 90, y: 185 });
    expect(
      document.querySelector<HTMLElement>(
        '[data-calligraphy-category="rubbing"]',
      )?.classList,
    ).toContain("is-selected");
    await waitForAnimationFrames(dom.window, 40);
    swipe(dom.window, calligraphyScroll, { x: 90, y: 180 }, { x: 300, y: 185 });
    expect(
      document.querySelector<HTMLElement>('[data-calligraphy-category="ink"]')
        ?.classList,
    ).toContain("is-selected");
    expect(inkPage.scrollTop).toBe(42);
    expect(rubbingPage.getAttribute("aria-hidden")).toBe("true");
  });

  it("ignores short, vertical, multi-touch, mouse, and PC swipe gestures", () => {
    const dom = renderPreview();
    const homeScroll = dom.window.document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    if (!homeScroll) throw new Error("home swipe surface missing");

    swipe(dom.window, homeScroll, { x: 250, y: 160 }, { x: 220, y: 160 });
    swipe(dom.window, homeScroll, { x: 250, y: 100 }, { x: 190, y: 210 });
    swipe(
      dom.window,
      homeScroll,
      { x: 250, y: 160 },
      { x: 150, y: 160 },
      "mouse",
    );
    dispatchPointer(dom.window, homeScroll, "pointerdown", {
      clientX: 250,
      clientY: 160,
      pointerId: 1,
    });
    dispatchPointer(dom.window, homeScroll, "pointerdown", {
      clientX: 240,
      clientY: 160,
      isPrimary: false,
      pointerId: 2,
    });
    dispatchPointer(dom.window, homeScroll, "pointerup", {
      clientX: 140,
      clientY: 160,
      isPrimary: false,
      pointerId: 2,
    });
    dispatchPointer(dom.window, homeScroll, "pointerup", {
      clientX: 150,
      clientY: 160,
      pointerId: 1,
    });
    expect(
      dom.window.document.querySelector<HTMLElement>(
        '[data-home-feed="discover"]',
      )?.classList,
    ).toContain("is-selected");

    const desktopDom = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportWidth: 1024,
      },
    );
    const desktopHomeScroll =
      desktopDom.window.document.querySelector<HTMLElement>(
        '[data-scroll-view="home"]',
      );
    if (!desktopHomeScroll) throw new Error("desktop home surface missing");
    swipe(
      desktopDom.window,
      desktopHomeScroll,
      { x: 250, y: 160 },
      { x: 150, y: 160 },
    );
    expect(
      desktopDom.window.document.querySelector<HTMLElement>(
        '[data-home-feed="discover"]',
      )?.classList,
    ).toContain("is-selected");
  });

  it("follows PC home and calligraphy pages with horizontal wheel pans", async () => {
    const desktopDom = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportWidth: 1024,
      },
    );
    const document = desktopDom.window.document;
    const homeScroll = document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    const homeTrack =
      homeScroll?.querySelector<HTMLElement>("[data-pager-track]");
    if (!homeScroll || !homeTrack) throw new Error("desktop home surface missing");
    expect(document.documentElement.dataset.platform).toBe("pc");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 80, deltaY: 0 });
    expect(homeScroll.classList).toContain("is-pager-following");
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-80, 0);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 0, deltaY: 160 });
    dispatchWheel(desktopDom.window, homeScroll, {
      ctrlKey: true,
      deltaX: 160,
      deltaY: 0,
    });
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-80, 0);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 600, deltaY: 0 });
    await new Promise<void>((resolve) => {
      desktopDom.window.setTimeout(() => resolve(), 60);
    });
    await waitForAnimationFrames(desktopDom.window, 40);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.classList,
    ).toContain("is-selected");
    expect(homeScroll.classList).not.toContain("is-pager-following");

    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    const calligraphyScroll = document.querySelector<HTMLElement>(
      '[data-pager="calligraphy"]',
    );
    if (!calligraphyScroll) throw new Error("desktop calligraphy surface missing");
    dispatchWheel(desktopDom.window, calligraphyScroll, {
      deltaX: 600,
      deltaY: 0,
    });
    await new Promise<void>((resolve) => {
      desktopDom.window.setTimeout(() => resolve(), 60);
    });
    await waitForAnimationFrames(desktopDom.window, 40);
    expect(
      document.querySelector<HTMLElement>(
        '[data-calligraphy-category="ink"]',
      )?.classList,
    ).toContain("is-selected");
  });

  it("settles PC trackpad inertia immediately without waiting for idle", async () => {
    const desktopDom = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportWidth: 1024,
      },
    );
    const document = desktopDom.window.document;
    const homeScroll = document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    const homeTrack =
      homeScroll?.querySelector<HTMLElement>("[data-pager-track]");
    if (!homeScroll || !homeTrack) throw new Error("desktop home surface missing");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 500, deltaY: 0 });
    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 200, deltaY: 0 });
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-700, 0);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 80, deltaY: 0 });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.classList,
    ).toContain("is-selected");
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-700, 0);

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 40, deltaY: 0 });
    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 20, deltaY: 0 });
    expect(pagerTranslateX(homeTrack)).not.toBeCloseTo(-760, 0);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.classList,
    ).toContain("is-selected");

    await waitForAnimationFrames(desktopDom.window, 40);
    expect(homeScroll.classList).not.toContain("is-pager-following");

    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    const calligraphyScroll = document.querySelector<HTMLElement>(
      '[data-pager="calligraphy"]',
    );
    const calligraphyTrack =
      calligraphyScroll?.querySelector<HTMLElement>("[data-pager-track]");
    if (!calligraphyScroll || !calligraphyTrack) {
      throw new Error("desktop calligraphy surface missing");
    }
    dispatchWheel(desktopDom.window, calligraphyScroll, {
      deltaX: 500,
      deltaY: 0,
    });
    dispatchWheel(desktopDom.window, calligraphyScroll, {
      deltaX: 200,
      deltaY: 0,
    });
    dispatchWheel(desktopDom.window, calligraphyScroll, {
      deltaX: 80,
      deltaY: 0,
    });
    expect(
      document.querySelector<HTMLElement>(
        '[data-calligraphy-category="ink"]',
      )?.classList,
    ).toContain("is-selected");
    dispatchWheel(desktopDom.window, calligraphyScroll, {
      deltaX: 40,
      deltaY: 0,
    });
    expect(pagerTranslateX(calligraphyTrack)).toBeCloseTo(-700, 0);
    await waitForAnimationFrames(desktopDom.window, 40);
    expect(
      document.querySelector<HTMLElement>(
        '[data-calligraphy-category="ink"]',
      )?.classList,
    ).toContain("is-selected");
  });

  it("enables category swipes for a physical tablet", () => {
    const dom = renderPreview(
      {},
      {
        mobile: false,
        userAgent: tabletUserAgent,
        viewportWidth: 834,
      },
    );
    const document = dom.window.document;
    const homeScroll = document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    if (!homeScroll) throw new Error("tablet home surface missing");

    swipe(dom.window, homeScroll, { x: 700, y: 220 }, { x: 200, y: 225 });
    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.classList,
    ).toContain("is-selected");
  });

  it("realigns topics after delayed phone and tablet rotation widths", async () => {
    const deviceCases = [
      {
        mobile: true,
        name: "phone",
        startWidth: 844,
        targetWidth: 390,
        userAgent: phoneUserAgent,
      },
      {
        mobile: false,
        name: "tablet",
        startWidth: 1024,
        targetWidth: 768,
        userAgent: tabletUserAgent,
      },
    ];

    for (const deviceCase of deviceCases) {
      for (const delayedWidthFrame of [1, 8, 20]) {
        let resizeCallback: ResizeObserverCallback | undefined;
        const dom = renderPreview(
          {},
          {
            mobile: deviceCase.mobile,
            userAgent: deviceCase.userAgent,
            viewportWidth: deviceCase.startWidth,
          },
          (window) => {
            Object.defineProperty(window, "matchMedia", {
              configurable: true,
              value: () => ({ matches: true }),
            });
            Object.defineProperty(window, "ResizeObserver", {
              configurable: true,
              value: class {
                constructor(callback: ResizeObserverCallback) {
                  resizeCallback = callback;
                }

                observe() {}
              },
            });
          },
        );
        const document = dom.window.document;
        const topicsPage = document.querySelector<HTMLElement>(
          '[data-feed-panel="topics"]',
        );
        const homeTrack = document.querySelector<HTMLElement>(
          '[data-pager="home"] [data-pager-track]',
        );
        if (!topicsPage || !homeTrack || !resizeCallback) {
          throw new Error(`${deviceCase.name} topics fixture missing`);
        }

        document
          .querySelector<HTMLElement>('[data-home-feed="topics"]')
          ?.click();
        topicsPage.scrollTop = 126;
        topicsPage.dispatchEvent(new dom.window.Event("scroll"));
        expect(pagerTranslateX(homeTrack)).toBeCloseTo(
          -2 * deviceCase.startWidth,
        );

        const frames = installControlledAnimationFrames(dom.window);
        dom.window.dispatchEvent(new dom.window.Event("orientationchange"));
        dom.window.dispatchEvent(new dom.window.Event("resize"));
        dom.window.visualViewport?.dispatchEvent(
          new dom.window.Event("resize"),
        );
        expect(frames.pending()).toBe(1);

        for (let frame = 0; frame < 60; frame += 1) {
          if (frame === delayedWidthFrame) {
            setViewportWidthWithoutEvent(dom, deviceCase.targetWidth);
            resizeCallback([], {} as ResizeObserver);
          }
          if (frames.pending() > 0) frames.step((frame * 1000) / 60);
          if (frame > delayedWidthFrame && frames.pending() === 0) break;
        }

        expect(frames.pending()).toBe(0);
        expect(pagerTranslateX(homeTrack)).toBeCloseTo(
          -2 * deviceCase.targetWidth,
        );
        expect(topicsPage.hidden).toBe(false);
        expect(topicsPage.getAttribute("aria-hidden")).toBe("false");
        expect(topicsPage.scrollTop).toBe(126);
        expect(
          document.querySelector<HTMLElement>('[data-home-feed="topics"]')
            ?.classList,
        ).toContain("is-selected");
      }
    }
  });

  it("realigns again when ResizeObserver reports a late pager width", () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const observedElements: Element[] = [];
    const dom = renderPreview(
      {},
      { mobile: true, userAgent: phoneUserAgent, viewportWidth: 844 },
      (window) => {
        Object.defineProperty(window, "matchMedia", {
          configurable: true,
          value: () => ({ matches: true }),
        });
        Object.defineProperty(window, "ResizeObserver", {
          configurable: true,
          value: class {
            constructor(callback: ResizeObserverCallback) {
              resizeCallback = callback;
            }

            observe(element: Element) {
              observedElements.push(element);
            }
          },
        });
      },
    );
    const document = dom.window.document;
    const homeTrack = document.querySelector<HTMLElement>(
      '[data-pager="home"] [data-pager-track]',
    );
    if (!homeTrack || !resizeCallback) {
      throw new Error("ResizeObserver pager fixture missing");
    }
    document.querySelector<HTMLElement>('[data-home-feed="topics"]')?.click();
    const frames = installControlledAnimationFrames(dom.window);

    dom.window.dispatchEvent(new dom.window.Event("orientationchange"));
    frames.runUntilIdle(1000 / 60);
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-2 * 844);

    setViewportWidthWithoutEvent(dom, 390);
    resizeCallback([], {} as ResizeObserver);
    frames.runUntilIdle(1000 / 60);

    expect(observedElements).toHaveLength(2);
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-2 * 390);
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="topics"]')?.hidden,
    ).toBe(false);
  });

  it("keeps phone zoom disabled and preserves pager state after orientation", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    document
      .querySelector<HTMLElement>('[data-calligraphy-category="rubbing"]')
      ?.click();
    const calligraphyFilter = document.querySelector<HTMLInputElement>(
      "[data-calligraphy-filter]",
    );
    const rubbingPage = document.querySelector<HTMLElement>(
      '[data-scroll-key="calligraphy:rubbing"]',
    );
    const viewportMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    );
    if (!calligraphyFilter || !rubbingPage || !viewportMeta) {
      throw new Error("orientation test fixture missing");
    }
    calligraphyFilter.value = "北海";
    calligraphyFilter.dispatchEvent(
      new dom.window.Event("input", { bubbles: true }),
    );
    rubbingPage.scrollTop = 144;
    rubbingPage.dispatchEvent(new dom.window.Event("scroll"));

    dom.window.dispatchEvent(new dom.window.Event("orientationchange"));
    await waitForAnimationFrames(dom.window, 7);

    expect(viewportMeta.content).toContain(
      "minimum-scale=1, maximum-scale=1, user-scalable=no",
    );
    expect(
      document.querySelector<HTMLElement>('[data-view="calligraphy"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>(
        '[data-calligraphy-category="rubbing"]',
      )?.classList,
    ).toContain("is-selected");
    expect(calligraphyFilter.value).toBe("北海");
    expect(rubbingPage.scrollTop).toBe(144);
  });

  it("keeps tablet zoom disabled across orientation changes", async () => {
    const dom = renderPreview(
      {},
      {
        mobile: false,
        userAgent: tabletUserAgent,
        viewportWidth: 834,
      },
    );
    const viewportMeta = dom.window.document.querySelector<HTMLMetaElement>(
      'meta[name="viewport"]',
    );
    if (!viewportMeta) throw new Error("viewport meta missing");
    dom.window.dispatchEvent(new dom.window.Event("orientationchange"));
    await waitForAnimationFrames(dom.window, 7);

    expect(dom.window.document.documentElement.dataset.deviceClass).toBe(
      "tablet",
    );
    expect(viewportMeta.content).toContain(
      "minimum-scale=1, maximum-scale=1, user-scalable=no",
    );
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
    const dom = renderPreview();
    const sharedStylesheet = dom.window.document.querySelector<HTMLLinkElement>(
      "[data-shared-stylesheet]",
    );

    expect(sharedStylesheet?.media).toBe("");
    expect(sharedCss).toContain(".app-nav-brand");
    expect(sharedCss).toContain(".app-inscriptions-layout");
    expect(sharedCss).not.toContain(".app-inscriptions-preview");
    expect(sharedCss).toContain("--app-calligraphy-scale");
    expect(sharedCss).toContain("--app-motto-font");
    expect(sharedCss).not.toContain("prefers-reduced-motion");
    expect(previewCss).not.toContain("@media (min-width: 48rem)");
    expect(previewCss).toContain("orientation: portrait");
    expect(previewCss).toContain("orientation: landscape");
    expect(previewCss).toContain("min-width: 35.5rem");
    expect(previewCss).toContain('"categories settings"');
    expect(previewCss).toContain('"search search"');
    expect(previewCss).not.toContain("calc(88px + env(safe-area-inset-left))");
    expect(previewCss).toContain("bottom: max(var(--yoyi-space-3)");
    expect(tabletCss).toContain("@media (min-width: 48rem)");
    expect(tabletCss).not.toContain("@media (min-width: 56rem)");
    expect(tabletCss).not.toContain("@media (min-width: 64rem)");
    expect(tabletCss).not.toContain("@media (min-width: 90rem)");
    expect(pcCss).toContain("@media (min-width: 56rem)");
    expect(pcCss).toContain("@media (min-width: 64rem)");
    expect(pcCss).toContain("@media (min-width: 90rem)");
    expect(tabletCss).toContain("persistent floating functional rail");
    expect(tabletCss).toContain("orientation: landscape");
    expect(tabletCss).toContain("calc(88px + env(safe-area-inset-left))");
    expect(pcCss).toContain("padding-bottom: calc(68px + env(safe-area-inset-bottom))");
    expect(pcCss).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(pcCss).toContain(".app-nav-brand {\n    display: none;");
    expect(pcCss).not.toContain("calc(164px + env(safe-area-inset-left))");
    expect(pcCss).not.toContain("border-width: 9px 0 9px 10px");
    expect(pcCss).not.toContain("opacity: 0.88");
    expect(previewCss).toContain("touch-action: pan-x pan-y");
    expect(tabletCss).toContain("touch-action: pan-x pan-y");
    expect(previewCss).not.toContain("pinch-zoom;");
    expect(tabletCss).not.toContain("pinch-zoom;");
    expect(pcCss).toContain("pinch-zoom");
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    );
    expect(html).not.toMatch(/user-scalable|maximum-scale|minimum-scale/);
    expect(devicePlatformScript).toContain("user-scalable=no");
    expect(html).toContain('data-pager="home"');
    expect(html).toContain('data-pager="calligraphy"');
    expect(pcCss).toContain('[data-setting-group="home-layout"]');
    expect(tabletCss).toContain("var(--yoyi-container-reading)");
    expect(pcCss).toContain("var(--yoyi-container-reading)");
    expect(tabletCss).toMatch(
      /@media \(min-width: 48rem\) \{[\s\S]*?\.app-topics__grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(tabletCss).toMatch(
      /\.app-topics\s*\{[^}]*padding: var\(--yoyi-space-5\)/,
    );
    expect(sharedCss).toMatch(
      /\.app-topics__grid\s*\{[^}]*grid-template-columns: 1fr/,
    );
    expect(previewCss).toMatch(
      /@media \(orientation: landscape\) \{[\s\S]*?\.app-topics__grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
    );
    const sharedRules = new Set(
      topLevelCssChunks(sharedCss).map(normalizeCssChunk),
    );
    for (const css of [previewCss, tabletCss, pcCss]) {
      const effectiveCss = `${sharedCss}\n${css}`;
      const duplicatedSharedRules = topLevelCssChunks(css)
        .map(normalizeCssChunk)
        .filter((chunk) => sharedRules.has(chunk));
      expect(duplicatedSharedRules).toEqual([]);
      expect(css).toContain("@media (prefers-reduced-motion: reduce)");
      expect(effectiveCss).toContain("overscroll-behavior-y: auto");
      expect(effectiveCss).toContain("touch-action: pan-y");
      expect(effectiveCss).not.toContain("overscroll-behavior-y: contain");
    }
    expect(html).toContain("app-inscriptions-layout");
    expect(html).not.toContain("data-inscription-preview");
    expect(html).toContain("app-card__meta");
    expect(html).not.toContain('data-shell="list-head"');
    expect(html).not.toContain('data-shell="pagination"');
    expect(html).not.toContain("data-preview-tab");
    expect(html).not.toContain("data-shell-control");
    expect(html).toContain('data-primary-view="inscriptions"');
    expect(html).toContain('data-primary-view="calligraphy"');
    expect(html).toContain("yoyi.theme-preference");
    expect(html).toContain("yoyi.home-feed-layout");
    expect(html).toContain('data-home-feed="topics"');
    expect(html).not.toContain("app-home-motto");
    expect(html).toContain('data-placeholder="topics-v1"');
    expect(html).toContain('data-view="topic-column"');
    expect(html).toContain('data-setting-group="home-layout"');
    expect(html).toContain('src="./device-platform.js"');
    expect(html).toContain(
      'href="./preview.shared.css?v=20260813-glass-final"',
    );
    expect(html).toContain("data-shared-stylesheet");
    expect(html).toContain('data-platform-stylesheet="phone"');
    expect(html).toContain('data-platform-stylesheet="tablet"');
    expect(html).toContain('data-platform-stylesheet="pc"');
    expect(html).not.toContain("data-platform-gate");
    expect(pcCss).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(pcCss).toContain("--app-calligraphy-scale: 1");
    expect(pcCss).toContain(".app-scroll.app-pager.is-pager-following");
    expect(script).toMatch(/addEventListener\(\s*["']wheel["']/);
    expect(script).not.toMatch(/addEventListener\(\s*["']touchmove["']/);
    expect(sharedCss).toContain(".app-topics__grid");
    expect(html).not.toMatch(/收藏|下载|分享|著录|拓片信息|相关碑刻/);
    expect(html).not.toMatch(/关注|评论|登录|账号|地图/);
  });

  it("keeps search fields accessible without decorative magnifiers", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const inscriptionSearch = document.querySelector<HTMLInputElement>(
      "[data-inscription-search]",
    );
    const calligraphySearch = document.querySelector<HTMLInputElement>(
      "[data-calligraphy-filter]",
    );

    expect(inscriptionSearch?.getAttribute("aria-label")).toBe("搜索碑刻");
    expect(calligraphySearch?.getAttribute("aria-label")).toBe("筛选书帖");
    expect(
      inscriptionSearch
        ?.closest(".app-search")
        ?.querySelector('[data-icon="search"]'),
    ).toBeNull();
    expect(
      calligraphySearch
        ?.closest(".app-search")
        ?.querySelector('[data-icon="search"]'),
    ).toBeNull();
    expect(document.querySelectorAll("[data-search-clear]")).toHaveLength(1);
    expect(
      document.querySelectorAll("[data-calligraphy-filter-clear]"),
    ).toHaveLength(1);
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

  it("uses the same full-screen inscription detail in the PC shell", () => {
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

    document
      .querySelector<HTMLElement>(
        '[data-view="inscriptions"] [data-content-id="inscription-yunfeng"]',
      )
      ?.click();

    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(true);
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "云峰山题名",
    );
    expect(document.querySelector("[data-inscription-preview]")).toBeNull();
  });

  it("keeps an open inscription detail across the 896px shell boundary", () => {
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
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
    expect(document.querySelector("[data-inscription-preview]")).toBeNull();

    setViewportWidth(dom, 895);
    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
  });

  it("minimizes only a physical phone Tab Bar on vertical content scroll", () => {
    const phone = renderPreview({}, { viewportWidth: 844 });
    const phoneDocument = phone.window.document;
    const navigation = phoneDocument.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const discover = phoneDocument.querySelector<HTMLElement>(
      '[data-scroll-key="home:discover"]',
    );
    if (!navigation || !discover) throw new Error("phone navigation missing");

    discover.scrollTop = 13;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    expect(navigation.dataset.minimized).toBe("true");

    discover.scrollTop = 4;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    expect(navigation.hasAttribute("data-minimized")).toBe(false);
    expect(navigation.dataset.minimizeBehavior).toBe("on-scroll-down");

    discover.scrollTop = 20;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    phoneDocument
      .querySelector<HTMLElement>('[data-primary-view="home"]')
      ?.click();
    expect(navigation.hasAttribute("data-minimized")).toBe(false);

    const tablet = renderPreview(
      {},
      {
        mobile: false,
        userAgent: tabletUserAgent,
        viewportWidth: 834,
      },
    );
    const tabletDiscover = tablet.window.document.querySelector<HTMLElement>(
      '[data-scroll-key="home:discover"]',
    );
    tabletDiscover!.scrollTop = 40;
    tabletDiscover!.dispatchEvent(new tablet.window.Event("scroll"));
    expect(
      tablet.window.document
        .querySelector("[data-bottom-navigation]")
        ?.hasAttribute("data-minimized"),
    ).toBe(false);
    expect(
      tablet.window.document.querySelector<HTMLElement>(
        "[data-bottom-navigation]",
      )?.dataset.minimizeBehavior,
    ).toBe("never");
  });

  it("transfers scroll position between nested and document scroll owners", async () => {
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
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    const calligraphyScroll = document.querySelector<HTMLElement>(
      '[data-scroll-key="calligraphy:all"]',
    );
    if (!calligraphyScroll) throw new Error("calligraphy scroll not found");
    calligraphyScroll.scrollTop = 260;
    calligraphyScroll.dispatchEvent(new dom.window.Event("scroll"));

    setViewportWidth(dom, 896);
    await new Promise<void>((resolve) =>
      dom.window.requestAnimationFrame(() => resolve()),
    );
    expect(document.documentElement.dataset.platform).toBe("pc");
    expect(document.documentElement.scrollTop).toBe(260);

    document.documentElement.scrollTop = 140;
    dom.window.dispatchEvent(new dom.window.Event("scroll"));
    setViewportWidth(dom, 895);
    await new Promise<void>((resolve) =>
      dom.window.requestAnimationFrame(() => resolve()),
    );
    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(calligraphyScroll.scrollTop).toBe(140);
  });
});
