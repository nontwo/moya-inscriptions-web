import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

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
const catalogDetailFixture = await readFile(
  new URL("fixtures/catalog-detail.placeholder.js", previewRoot),
  "utf8",
);
const catalogAdapterScript = await readFile(
  new URL("catalog-ui-adapter.js", previewRoot),
  "utf8",
);
const p5PilotFixture = await readFile(
  new URL("fixtures/p5-pilot.snapshot.js", previewRoot),
  "utf8",
);
const profileFixture = await readFile(
  new URL("fixtures/profile.placeholder.js", previewRoot),
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
const uiCss = await readFile(
  new URL("../../../packages/ui/src/styles.css", import.meta.url),
  "utf8",
);
const createLabelAsset = await readFile(
  new URL("assets/nav-create-label-mask.png", previewRoot),
);
const profileLabelAsset = await readFile(
  new URL("assets/nav-profile-label-mask.png", previewRoot),
);

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
  viewportHeight?: number;
  viewportWidth?: number;
};

const installDeviceEnvironment = (
  window: Window & typeof globalThis,
  {
    maxTouchPoints = 5,
    mobile = true,
    userAgent = phoneUserAgent,
    viewportHeight = 844,
    viewportWidth = 390,
  }: DeviceOptions = {},
) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
    writable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: viewportHeight,
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
  url = "http://localhost/docs/prototypes/mobile-preview/",
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
      /<script src="\.\/fixtures\/catalog-detail\.placeholder\.js"><\/script>/,
      "",
    )
    .replace(
      /<script src="\.\/fixtures\/p5-pilot\.snapshot\.js"><\/script>/,
      "",
    )
    .replace(
      /<script src="\.\/fixtures\/profile\.placeholder\.js"><\/script>/,
      "",
    )
    .replace(
      /<script src="\.\/catalog-ui-adapter\.js(?:\?[^"]*)?"><\/script>/,
      "",
    )
    .replace(
      /<script(?: type="module")? src="\.\/preview\.js(?:\?[^"]*)?"><\/script>/,
      "",
    );
  const dom = new JSDOM(withoutExternalScript, {
    pretendToBeVisual: true,
    runScripts: "outside-only",
    url,
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
  dom.window.eval(catalogDetailFixture);
  dom.window.eval(p5PilotFixture);
  dom.window.eval(profileFixture);
  dom.window.eval(catalogAdapterScript);
  dom.window.eval(script);
  return dom;
};

const renderP5Preview = (
  deviceOptions: DeviceOptions = {},
  prepareWindow?: (window: Window & typeof globalThis) => void,
  hash = "",
) =>
  renderPreview(
    {},
    deviceOptions,
    prepareWindow,
    `http://localhost/docs/prototypes/mobile-preview/?dataset=p5${hash}`,
  );

const expectedP5Titles = [
  "北魏永平四年郑道昭浮丘子题字",
  "唐张礼臣墓志盖",
  "北宋黄庭坚撰文并书丹王纯中墓志铭石碑",
  "平定准噶尔后勒铭伊犁之碑",
  "西汉“平原乐陵”题记石",
  "隋开皇元年定州刺史豆卢通摩崖造像记",
  "三体石经残刻石",
  "五代十国南汉大宝五年石经幢",
  "明张南潨墓志",
  "元基督教叙利亚文石墓碑（二）",
  "辽代青砂岩刻“宋魏国妃墓志文”（二）",
  "东晋王建之墓志",
  "汉“建安六年八月”残石",
  "重修护国寺感应塔碑",
  "晋故处士成君之碑",
  "大金得胜陀颂碑",
  "会稽刻石",
  "袁滋题记摩崖石刻",
  "石鼓－汧殹",
  "居巢刘君墓顶镇石题字",
  "唐伊斯兰教徒珊瑚石墓碑（一）",
  "苏轼书观自在陀罗尼经文（东塔）",
  "北魏永平四年郑文公上碑刻石",
  "清郭嵩涛撰文俞樾篆盖谭钟麟书丹太子太保彭玉麟汉白玉墓志",
  "东汉鲜于璜碑",
  "赤德松赞墓碑",
  "北宋毕昇墓碑",
  "元至正黄裳题撰灵济庙记",
];

const expectedP5Descriptions = new Map<string, string>([
  [
    "p5-record-03",
    "北宋元祐二年（1087年）黄庭坚为王纯中撰文并书丹的墓志，现藏修水县黄庭坚纪念馆。",
  ],
  [
    "p5-record-05",
    "西汉石质题记，正面右下刻“平原樂陵宿伯牙霍巨益”十个隶书字；馆方公布尺寸为长2.18米、宽0.85米、厚0.43米。",
  ],
  [
    "p5-record-06",
    "开河寺石窟隋代摩崖造像题记，铭文署“开皇元年四月八日”，并记定州刺史豆卢通及相关施主题名。",
  ],
  [
    "p5-record-07",
    "三国魏正始二年（241年）石经残刻，存高38厘米、宽32厘米，现存11行110字，以古篆、小篆和隶书三种书体刻写《尚书·君奭》内容。",
  ],
  [
    "p5-record-08",
    "南汉大宝五年（962年）石经幢，通高3.4米，由须弥座、幢柱、覆盆和四方佛塔等石构件组成，现藏东莞市博物馆。",
  ],
  [
    "p5-record-12",
    "东晋咸安二年（372年）王建之墓志，志文275字，记载墓主籍贯、官职及卒葬等信息，现藏南京市博物馆。",
  ],
  [
    "p5-record-16",
    "金代汉文、女真文合璧碑刻，正面汉文追述完颜阿骨打聚兵反辽及立碑缘起，碑阴刻对应女真大字。现存于吉林扶余得胜镇原址。",
  ],
  [
    "p5-record-17",
    "大禹陵现存的会稽刻石，承续秦始皇三十七年会稽刻石的文本传统。国家名录将其归入秦代，本描述不把现存石刻直接等同于已证实的秦代原刻。",
  ],
  [
    "p5-record-18",
    "唐贞元十年袁滋奉命赴南诏册封异牟寻，途经豆沙关时留下的122字摩崖题记；正文为楷书，“袁滋题”三字为篆书。",
  ],
  [
    "p5-record-19",
    "故宫博物院所藏十面石鼓之一，以“汧殹”篇名识别，表面刻籀文。其年代历来有多种观点，国家名录将该件归入战国。",
  ],
  [
    "p5-record-21",
    "海南省博物馆所藏唐代伊斯兰教徒珊瑚石墓碑单件；此类墓碑以珊瑚石制成，刻阿拉伯文宗教文字及墓主信息，是海南沿海伊斯兰墓葬传统的实物。",
  ],
  [
    "p5-record-22",
    "嵌于广教寺双塔东塔第二层南壁门上的北宋经文刻石，苏轼于元丰四年二月二十七日书《观自在菩萨如意轮陀罗尼经》。",
  ],
  [
    "p5-record-23",
    "北魏永平四年郑道昭在平度天柱山所刻摩崖碑文，与云峰山郑文公下碑相区分，内容颂扬其父郑羲的才智功德。",
  ],
  [
    "p5-record-24",
    "清代太子太保彭玉麟汉白玉墓志，由郭嵩涛撰文、俞樾篆盖、谭钟麟书丹。",
  ],
  [
    "p5-record-25",
    "东汉延熹八年立碑，碑额篆书“汉故雁门太守鲜于君碑”，碑身正背两面刻铭；1973年出土于天津武清，现藏天津博物馆。",
  ],
  [
    "p5-record-26",
    "藏王墓穆日山陵区的吐蕃时期墓碑，碑身刻古藏文，碑帽、碑身和龟趺碑座组成仿唐式形制；碑文主要记载并赞颂赤德松赞的政绩。",
  ],
  [
    "p5-record-27",
    "英山县博物馆登记的北宋墓碑。湖北省文物主管部门资料称，1995年专家鉴定其立于皇祐四年，并将墓主认定为活字印刷术发明者毕昇。",
  ],
  [
    "p5-record-28",
    "元代至正年间黄裳题撰的灵济庙记碑刻，现登记于广西兴安灵渠。",
  ],
]);

const setViewportWidth = (dom: PreviewDom, viewportWidth: number) => {
  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
    writable: true,
  });
  dom.window.dispatchEvent(new dom.window.Event("resize"));
};

const setViewportSize = (
  dom: PreviewDom,
  viewportWidth: number,
  viewportHeight: number,
) => {
  Object.defineProperty(dom.window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
    writable: true,
  });
  Object.defineProperty(dom.window, "innerHeight", {
    configurable: true,
    value: viewportHeight,
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
  return event;
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

const tap = (
  window: Window & typeof globalThis,
  target: Element,
  point: { x: number; y: number },
  pointerType = "mouse",
) => {
  dispatchPointer(window, target, "pointerdown", {
    clientX: point.x,
    clientY: point.y,
    pointerType,
    timeStamp: 1_000,
  });
  dispatchPointer(window, target, "pointerup", {
    clientX: point.x,
    clientY: point.y,
    pointerType,
    timeStamp: 1_020,
  });
};

const dispatchWheel = (
  window: Window & typeof globalThis,
  target: Element,
  {
    deltaX = 0,
    deltaY = 0,
    ctrlKey = false,
    deltaMode = 0,
  }: {
    deltaX?: number;
    deltaY?: number;
    ctrlKey?: boolean;
    deltaMode?: number;
  },
) => {
  const event = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey,
    deltaMode,
    deltaX,
    deltaY,
  });
  target.dispatchEvent(event);
  return event;
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

const waitMs = (window: Window, ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const openSettingsFromProfile = (document: Document) => {
  document
    .querySelector<HTMLElement>('[data-topbar-action="profile"]')
    ?.click();
  document
    .querySelector<HTMLElement>('[data-view="profile"] [data-open-settings]')
    ?.click();
};

const layoutBottomNav = (navigation: HTMLElement) => {
  const box = (
    left: number,
    top: number,
    width: number,
    height: number,
  ): DOMRect =>
    ({
      x: left,
      y: top,
      top,
      left,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON() {
        return this;
      },
    }) as DOMRect;

  const isPc =
    navigation.ownerDocument.documentElement.dataset.platform === "pc";
  Object.defineProperty(navigation, "getBoundingClientRect", {
    configurable: true,
    value: () => (isPc ? box(0, 0, 88, 900) : box(0, 700, 500, 60)),
  });
  [...navigation.querySelectorAll<HTMLElement>("[data-nav-entry]")].forEach(
    (entry, index) => {
      const left = isPc ? 8 : index * 100;
      const top = isPc ? 290 + index * 64 : 704;
      const width = isPc ? 72 : 100;
      const height = isPc ? 64 : 52;
      Object.defineProperty(entry, "getBoundingClientRect", {
        configurable: true,
        value: () => box(left, top, width, height),
      });
      Object.defineProperty(entry, "offsetLeft", {
        configurable: true,
        get: () => (isPc ? 8 : index * 100),
      });
      Object.defineProperty(entry, "offsetTop", {
        configurable: true,
        get: () => (isPc ? 290 + index * 64 : 4),
      });
      Object.defineProperty(entry, "offsetWidth", {
        configurable: true,
        get: () => width,
      });
      Object.defineProperty(entry, "offsetHeight", {
        configurable: true,
        get: () => height,
      });
    },
  );
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
  vi.useRealTimers();
  for (const window of openWindows.splice(0)) window.close();
});

describe("mobile application preview", () => {
  it("opens quick actions only after a stationary long press and cancels them on movement or viewport changes", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const card = document.querySelector<HTMLElement>(
      '[data-content-id="discover-cliff-gate"]',
    );
    const overlay = document.querySelector<HTMLElement>(
      "[data-quick-action-overlay]",
    );
    if (!card || !overlay) throw new Error("quick action card missing");

    Object.defineProperty(card, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 20, top: 200, width: 160, height: 180 }),
    });

    expect(card.dataset.quickActions).toBe("enabled");
    expect(
      document.querySelector("[data-bottom-navigation] [data-quick-actions]"),
    ).toBeNull();
    expect(
      document.querySelector("[data-detail-focus] [data-quick-actions]"),
    ).toBeNull();

    dispatchPointer(dom.window, card, "pointerdown", {
      clientX: 80,
      clientY: 260,
    });
    dispatchPointer(dom.window, card, "pointermove", {
      clientX: 94,
      clientY: 260,
    });
    await waitMs(dom.window, 500);
    expect(overlay.hidden).toBe(true);

    dispatchPointer(dom.window, card, "pointerdown", {
      clientX: 80,
      clientY: 260,
    });
    await waitMs(dom.window, 480);
    expect(overlay.hidden).toBe(false);
    expect(document.querySelectorAll("[data-quick-action]")).toHaveLength(3);
    expect(overlay.textContent).toContain("收藏");
    expect(overlay.textContent).toContain("点赞");
    expect(overlay.textContent).toContain("分享");

    const likeBubble = document.querySelector<HTMLElement>(
      "[data-quick-action='like']",
    );
    if (!likeBubble) throw new Error("quick-action like bubble missing");
    const actionMove = dispatchPointer(dom.window, card, "pointermove", {
      clientX:
        Number.parseFloat(
          likeBubble.style.getPropertyValue("--quick-action-x"),
        ) + 32,
      clientY:
        Number.parseFloat(
          likeBubble.style.getPropertyValue("--quick-action-y"),
        ) + 32,
    });
    expect(actionMove.defaultPrevented).toBe(true);
    const actionTouchMove = new dom.window.Event("touchmove", {
      bubbles: true,
      cancelable: true,
    });
    dom.window.dispatchEvent(actionTouchMove);
    expect(actionTouchMove.defaultPrevented).toBe(true);

    dom.window.dispatchEvent(new dom.window.Event("orientationchange"));
    expect(overlay.hidden).toBe(true);
  });

  it("adapts quick-action arcs to the focused card and protected UI bounds", async () => {
    const openAt = async (
      dom: PreviewDom,
      rect: { height: number; left: number; top: number; width: number },
      press = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    ) => {
      const card = dom.window.document.querySelector<HTMLElement>(
        '[data-content-id="discover-cliff-gate"]',
      );
      if (!card) throw new Error("quick-action card missing");
      Object.defineProperty(card, "getBoundingClientRect", {
        configurable: true,
        value: () => rect,
      });
      dispatchPointer(dom.window, card, "pointerdown", {
        clientX: press.x,
        clientY: press.y,
      });
      await waitMs(dom.window, 480);
      return card;
    };

    const rightBiased = renderPreview();
    const rightBiasedOverlay =
      rightBiased.window.document.querySelector<HTMLElement>(
        "[data-quick-action-overlay]",
      );
    await openAt(rightBiased, { left: 210, top: 200, width: 160, height: 180 });
    expect(rightBiasedOverlay?.dataset.layout).toBe("left-arc");

    const leftBiased = renderPreview();
    const leftBiasedOverlay =
      leftBiased.window.document.querySelector<HTMLElement>(
        "[data-quick-action-overlay]",
      );
    await openAt(leftBiased, { left: 20, top: 200, width: 160, height: 180 });
    expect(leftBiasedOverlay?.dataset.layout).toBe("right-arc");

    const leftPress = renderPreview();
    const leftPressOverlay =
      leftPress.window.document.querySelector<HTMLElement>(
        "[data-quick-action-overlay]",
      );
    await openAt(
      leftPress,
      { left: 120, top: 260, width: 150, height: 180 },
      { x: 125, y: 350 },
    );
    expect(leftPressOverlay?.dataset.layout).toBe("left-arc");

    const rightPress = renderPreview();
    const rightPressOverlay =
      rightPress.window.document.querySelector<HTMLElement>(
        "[data-quick-action-overlay]",
      );
    await openAt(
      rightPress,
      { left: 120, top: 260, width: 150, height: 180 },
      { x: 265, y: 350 },
    );
    expect(rightPressOverlay?.dataset.layout).toBe("right-arc");

    const edgeBound = renderPreview();
    const edgeDocument = edgeBound.window.document;
    const navigation = edgeDocument.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const topbar = edgeDocument.querySelector<HTMLElement>(".app-topbar");
    if (!navigation || !topbar) throw new Error("quick-action bounds missing");
    Object.defineProperty(navigation, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ height: 80, left: 0, top: 700, width: 390 }),
    });
    Object.defineProperty(topbar, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ bottom: 70, height: 70, left: 0, top: 0, width: 390 }),
    });
    await openAt(edgeBound, { left: 20, top: 600, width: 160, height: 140 });
    const focusedCard = edgeDocument.querySelector<HTMLElement>(
      "[data-quick-action-card]",
    );
    if (!focusedCard) throw new Error("focused quick-action card missing");
    const focusTop = Number.parseFloat(focusedCard.style.top);
    const focusLeft = Number.parseFloat(focusedCard.style.left);
    expect(
      edgeDocument.querySelector<HTMLElement>("[data-quick-action-overlay]")
        ?.dataset.focusSafe,
    ).toBe("true");
    expect(focusTop - 7).toBeGreaterThanOrEqual(82);
    expect(focusTop + 140 * 1.03).toBeLessThanOrEqual(688);
    expect(focusLeft - 7).toBeGreaterThanOrEqual(12);
    expect(focusLeft + 160 * 1.03).toBeLessThanOrEqual(378);
    expect(
      [
        ...edgeDocument.querySelectorAll<HTMLElement>("[data-quick-action]"),
      ].every((bubble) => {
        const y = Number.parseFloat(
          bubble.style.getPropertyValue("--quick-action-y"),
        );
        const size = Number.parseFloat(
          bubble.style.getPropertyValue("--quick-action-bubble-size"),
        );
        return y >= 82 && y + size <= 688;
      }),
    ).toBe(true);

    const wideCard = renderPreview();
    const wideCardOverlay = wideCard.window.document.querySelector<HTMLElement>(
      "[data-quick-action-overlay]",
    );
    await openAt(wideCard, { left: 12, top: 110, width: 366, height: 180 });
    expect(wideCardOverlay?.dataset.layout).toBe("bottom-arc");

    const desktop = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 768,
        viewportWidth: 1024,
      },
    );
    const desktopNavigation =
      desktop.window.document.querySelector<HTMLElement>(
        "[data-bottom-navigation]",
      );
    if (!desktopNavigation) throw new Error("PC rail missing");
    Object.defineProperty(desktopNavigation, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 768,
        height: 768,
        left: 0,
        right: 104,
        top: 0,
        width: 104,
      }),
    });
    await openAt(desktop, { left: 720, top: 220, width: 180, height: 220 });
    expect(
      [
        ...desktop.window.document.querySelectorAll<HTMLElement>(
          "[data-quick-action]",
        ),
      ].every(
        (bubble) =>
          Number.parseFloat(
            bubble.style.getPropertyValue("--quick-action-x"),
          ) >= 116,
      ),
    ).toBe(true);
  });

  it("adds focused-card and staged quick-action visual treatment", () => {
    expect(sharedCss).toContain(
      "filter: blur(var(--quick-action-background-blur)) saturate(84%)",
    );
    expect(sharedCss).not.toMatch(/backdrop-filter\s*:/i);
    expect(sharedCss).toContain("--quick-action-card-shift-y");
    expect(sharedCss).toContain(".app-quick-action-overlay.is-ready");
    expect(sharedCss).toContain("--quick-action-delay");
    expect(sharedCss).toContain("scale(1.06)");
  });

  it("limits browser long-press suppression to quick-action cards and their media", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const card = document.querySelector<HTMLElement>(
      '[data-content-id="discover-cliff-gate"]',
    );
    const image = card?.querySelector("img");
    const composer =
      document.querySelector<HTMLTextAreaElement>("[data-create-text]");
    if (!card || !image || !composer) {
      throw new Error("quick-action browser-suppression fixture missing");
    }

    expect(image.draggable).toBe(false);

    const cardContextMenu = new dom.window.Event("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    card.dispatchEvent(cardContextMenu);
    expect(cardContextMenu.defaultPrevented).toBe(true);

    const imageDrag = new dom.window.Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    image.dispatchEvent(imageDrag);
    expect(imageDrag.defaultPrevented).toBe(true);

    const cardDrag = new dom.window.Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    card.dispatchEvent(cardDrag);
    expect(cardDrag.defaultPrevented).toBe(false);

    const composerContextMenu = new dom.window.Event("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    composer.dispatchEvent(composerContextMenu);
    expect(composerContextMenu.defaultPrevented).toBe(false);

    const documentContextMenu = new dom.window.Event("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(documentContextMenu);
    expect(documentContextMenu.defaultPrevented).toBe(false);
  });

  it("commits the selected quick action without opening detail and suppresses only the resulting click", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const card = document.querySelector<HTMLElement>(
      '[data-content-id="discover-cliff-gate"]',
    );
    const overlay = document.querySelector<HTMLElement>(
      "[data-quick-action-overlay]",
    );
    if (!card || !overlay) throw new Error("quick action card missing");

    Object.defineProperty(card, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 20, top: 200, width: 160, height: 180 }),
    });
    dispatchPointer(dom.window, card, "pointerdown", {
      clientX: 80,
      clientY: 260,
    });
    await waitMs(dom.window, 480);
    const likeBubble = document.querySelector<HTMLElement>(
      "[data-quick-action='like']",
    );
    if (!likeBubble) throw new Error("quick-action like bubble missing");
    const likeX =
      Number.parseFloat(likeBubble.style.getPropertyValue("--quick-action-x")) +
      32;
    const likeY =
      Number.parseFloat(likeBubble.style.getPropertyValue("--quick-action-y")) +
      32;
    dispatchPointer(dom.window, card, "pointermove", {
      clientX: likeX,
      clientY: likeY,
    });
    expect(
      document.querySelector("[data-quick-action='like']")?.classList,
    ).toContain("is-candidate");
    dispatchPointer(dom.window, card, "pointerup", {
      clientX: likeX,
      clientY: likeY,
    });

    expect(
      JSON.parse(dom.window.sessionStorage.getItem("yoyi.qa-log") ?? "[]"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "[quick-action] like discover-cliff-gate",
        }),
      ]),
    );
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(true);
    card.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(true);
    await waitMs(dom.window, 700);
    expect(overlay.hidden).toBe(true);
    card.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
  });

  it("cancels an active quick action without opening detail and restores a fresh click", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const card = document.querySelector<HTMLElement>(
      '[data-content-id="discover-cliff-gate"]',
    );
    const overlay = document.querySelector<HTMLElement>(
      "[data-quick-action-overlay]",
    );
    if (!card || !overlay) throw new Error("quick action card missing");

    Object.defineProperty(card, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 20, top: 200, width: 160, height: 180 }),
    });
    dispatchPointer(dom.window, card, "pointerdown", {
      clientX: 80,
      clientY: 260,
    });
    await waitMs(dom.window, 480);
    expect(overlay.hidden).toBe(false);
    dispatchPointer(dom.window, card, "pointerup", {
      clientX: 12,
      clientY: 80,
    });

    expect(overlay.hidden).toBe(true);
    card.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(true);
    await waitMs(dom.window, 700);
    card.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
  });

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
    expect(document.querySelectorAll("[data-primary-view]")).toHaveLength(4);
    expect(document.querySelectorAll("[data-nav-entry]")).toHaveLength(4);
    expect(
      [...document.querySelectorAll<HTMLElement>("[data-nav-entry]")].map(
        (entry) => entry.dataset.primaryView ?? entry.dataset.navAction,
      ),
    ).toEqual(["home", "inscriptions", "calligraphy", "create"]);
    expect(
      document.querySelectorAll("[data-browse-nav-group] [data-browse-nav]"),
    ).toHaveLength(3);
    expect(
      document
        .querySelector<HTMLElement>("[data-browse-nav-group]")
        ?.nextElementSibling?.getAttribute("data-primary-view"),
    ).toBe("create");
    expect(
      document.querySelectorAll('[data-topbar-action="profile"]'),
    ).toHaveLength(4);
    expect(
      document
        .querySelector("[data-browse-nav-group]")
        ?.classList.contains("yoyi-functional-glass"),
    ).toBe(true);
    expect(
      document
        .querySelector(".app-bottom-navigation__create")
        ?.classList.contains("yoyi-functional-glass"),
    ).toBe(true);
    expect(
      document
        .querySelector("[data-bottom-navigation]")
        ?.getAttribute("data-minimize-behavior"),
    ).toBe("on-scroll");
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
    expect(document.querySelectorAll("[data-open-settings]")).toHaveLength(1);
    expect(document.querySelector("[data-calligraphy-filter]")).toBeTruthy();
    expect(document.querySelector("[data-theme-cycle]")).toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-view="settings"]')?.hidden,
    ).toBe(true);
    expect(html.indexOf("yoyi.theme-preference")).toBeLessThan(
      html.indexOf("theme.css"),
    );
  });

  it("opens the create composer and keeps every action presentation-only", async () => {
    const dom = renderPreview({}, { viewportWidth: 390 });
    const document = dom.window.document;
    const createTab = document.querySelector<HTMLElement>(
      '[data-primary-view="create"]',
    );
    const createView = document.querySelector<HTMLElement>(
      '[data-view="create"]',
    );
    const textarea =
      document.querySelector<HTMLTextAreaElement>("[data-create-text]");
    const feedback = document.querySelector<HTMLElement>(
      "[data-create-feedback]",
    );
    if (!createTab || !createView || !textarea || !feedback) {
      throw new Error("create composer fixture missing");
    }

    createTab.click();
    await waitForAnimationFrames(dom.window, 40);
    expect(createView.hidden).toBe(false);
    expect(createView.hasAttribute("data-pager-page")).toBe(false);
    expect(createTab.classList).toContain("is-active");
    expect(createTab.getAttribute("aria-current")).toBe("page");
    expect(dom.window.history.state).toEqual({
      kind: "primary",
      view: "create",
    });
    expect(textarea.placeholder).toBe("分享你的书法、碑刻、拓本与所见所感…");
    expect(document.querySelector("[data-create-composer]")).toBeTruthy();
    expect(createView.querySelectorAll("[data-create-composer]")).toHaveLength(
      1,
    );
    expect(createView.querySelector('input[type="file"]')).toBeNull();
    expect(createView.querySelector("form")).toBeNull();

    textarea.focus();
    textarea.value = "临时创作内容";
    textarea.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    document.querySelector<HTMLElement>("[data-create-media]")?.click();
    expect(feedback.textContent).toContain("不会打开文件选择器");
    document.querySelector<HTMLElement>("[data-create-tags]")?.click();
    expect(feedback.textContent).toContain("标签功能待接入");
    document.querySelector<HTMLElement>("[data-create-submit]")?.click();
    expect(feedback.textContent).toContain("内容未发布");
    expect(textarea.value).toBe("临时创作内容");
    expect(dom.window.history.state).toEqual({
      kind: "primary",
      view: "create",
    });
    expect(createView.textContent).not.toContain("发布成功");

    const qaLog = dom.window.sessionStorage.getItem("yoyi.qa-log");
    expect(qaLog).toContain("composer focused");
    expect(qaLog).toContain("[create] reserved media action");
    expect(qaLog).toContain("[create] reserved tags action");
    expect(qaLog).toContain("[create] reserved submit action");

    document.querySelector<HTMLElement>('[data-primary-view="home"]')?.click();
    createTab.click();
    await waitForAnimationFrames(dom.window, 40);
    expect(textarea.value).toBe("临时创作内容");
  });

  it("opens the synthetic profile view and keeps account actions presentation-only", async () => {
    const dom = renderPreview({}, { viewportWidth: 390 });
    const document = dom.window.document;
    const profileTab = document.querySelector<HTMLElement>(
      '[data-view="home"] [data-topbar-action="profile"]',
    );
    const profileView = document.querySelector<HTMLElement>(
      '[data-view="profile"]',
    );
    const feedback = document.querySelector<HTMLElement>(
      "[data-profile-feedback]",
    );
    if (!profileTab || !profileView || !feedback) {
      throw new Error("profile fixture missing");
    }

    profileTab.click();
    await waitForAnimationFrames(dom.window, 40);
    expect(profileView.hidden).toBe(false);
    expect(profileView.hasAttribute("data-pager-page")).toBe(false);
    expect(
      document.querySelectorAll("[data-primary-view].is-active"),
    ).toHaveLength(0);
    expect(dom.window.history.state).toEqual({
      kind: "primary",
      view: "profile",
    });
    expect(profileView.dataset.profileFixture).toBe(
      "prototype-only synthetic non-production",
    );
    expect(profileView.querySelector("[data-profile-name]")?.textContent).toBe(
      "由艺同好",
    );
    expect(
      profileView.querySelector(".app-profile-identity__eyebrow"),
    ).toBeNull();
    expect(profileView.textContent).not.toContain("SYNTHETIC PROFILE");
    expect(
      profileView.querySelectorAll("[data-profile-stats] > div"),
    ).toHaveLength(4);
    expect(profileView.querySelectorAll("[data-profile-tab]")).toHaveLength(4);
    expect(
      profileView.querySelectorAll("[data-profile-posts] .app-card"),
    ).toHaveLength(6);
    const collectionCards = [
      ...profileView.querySelectorAll<HTMLElement>(
        "[data-profile-collections] .app-card",
      ),
    ];
    expect(collectionCards).toHaveLength(4);
    expect(
      new Set(collectionCards.map((card) => card.dataset.contentId)).size,
    ).toBe(4);
    expect(profileView.querySelector('[data-profile-tab="likes"]')).toBeNull();
    expect(
      profileView.querySelector('[data-profile-panel="likes"]'),
    ).toBeNull();
    expect(profileView.textContent).not.toContain("喜欢");
    expect(profileView.textContent).toContain("获赞");
    expect(profileView.querySelector("form")).toBeNull();
    expect(profileView.querySelector('input[type="file"]')).toBeNull();
    expect(
      (
        dom.window as unknown as {
          YOYI_PROFILE_PLACEHOLDER: { classification: string[] };
        }
      ).YOYI_PROFILE_PLACEHOLDER.classification,
    ).toEqual(["prototype-only", "synthetic", "non-production"]);

    for (const [tab, text] of [
      ["collections", "山门北壁题记"],
      ["comments", "评论功能待接入"],
      ["history", "暂无浏览记录"],
      ["posts", "山门北壁题记"],
    ]) {
      profileView
        .querySelector<HTMLElement>(`[data-profile-tab="${tab}"]`)
        ?.click();
      expect(
        profileView.querySelector<HTMLElement>(`[data-profile-panel="${tab}"]`)
          ?.hidden,
      ).toBe(false);
      expect(
        profileView.querySelector(`[data-profile-panel="${tab}"]`)?.textContent,
      ).toContain(text);
    }

    profileView
      .querySelector<HTMLElement>('[data-profile-action="edit"]')
      ?.click();
    expect(feedback.textContent).toContain("编辑资料功能待接入");
    profileView
      .querySelector<HTMLElement>('[data-profile-action="messages"]')
      ?.click();
    expect(feedback.textContent).toContain("消息功能待接入");
    profileView
      .querySelector<HTMLElement>('[data-profile-action="drafts"]')
      ?.click();
    expect(feedback.textContent).toContain("不会读取或保存草稿");
    expect(dom.window.sessionStorage.getItem("yoyi.qa-log")).toContain(
      "reserved drafts action",
    );

    profileView
      .querySelector<HTMLElement>('[data-profile-action="create"]')
      ?.click();
    await waitForAnimationFrames(dom.window, 40);
    expect(
      document.querySelector<HTMLElement>('[data-view="create"]')?.hidden,
    ).toBe(false);

    profileTab.click();
    await waitForAnimationFrames(dom.window, 40);
    profileView
      .querySelector<HTMLElement>("[data-profile-collections] .app-card")
      ?.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
    expect(dom.window.history.state).toMatchObject({
      kind: "detail",
      sourceView: "profile",
    });
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

  it("switches top-level views, filters search, and filters calligraphy cards", async () => {
    const dom = renderPreview();
    const document = dom.window.document;

    const inscriptionButton = document.querySelector<HTMLElement>(
      '[data-primary-view="inscriptions"]',
    );
    inscriptionButton?.click();
    await waitForAnimationFrames(dom.window, 40);
    expect(
      document.querySelector<HTMLElement>('[data-view="home"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-view="home"]')?.classList,
    ).not.toContain("is-pager-active");
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')
        ?.classList,
    ).toContain("is-pager-active");
    expect(
      document.querySelector<HTMLElement>(
        '[data-pager="primary"] [data-pager-track]',
      )?.style.transform,
    ).toBe("");

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

  it("keeps calligraphy chrome after rapid primary tab switches", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const primaryTrack = document.querySelector<HTMLElement>(
      '[data-pager="primary"] [data-pager-track]',
    );
    const clickPrimary = (view: string) =>
      document
        .querySelector<HTMLElement>(`[data-primary-view="${view}"]`)
        ?.click();

    clickPrimary("inscriptions");
    clickPrimary("calligraphy");
    clickPrimary("inscriptions");
    clickPrimary("calligraphy");
    await waitForAnimationFrames(dom.window, 40);

    const calligraphy = document.querySelector<HTMLElement>(
      '[data-view="calligraphy"]',
    );
    expect(calligraphy?.hidden).toBe(false);
    expect(calligraphy?.getAttribute("aria-label")).toBe("书帖");
    expect(primaryTrack?.style.transform).toBe("");
    expect(
      document.querySelector(
        '[data-view="calligraphy"] .app-topbar--categories',
      ),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-view="calligraphy"] [data-category]'),
    ).toBeTruthy();
  });

  it("switches primary views from a phone nav tap without dragging", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    const calligraphyTab = document.querySelector<HTMLElement>(
      '[data-primary-view="calligraphy"]',
    );
    const inscriptionsTab = document.querySelector<HTMLElement>(
      '[data-primary-view="inscriptions"]',
    );
    if (!calligraphyTab || !inscriptionsTab) {
      throw new Error("primary nav tabs missing");
    }
    calligraphyTab.click();
    await waitForAnimationFrames(dom.window, 40);
    expect(
      document.querySelector<HTMLElement>('[data-view="calligraphy"]')?.hidden,
    ).toBe(false);
    expect(calligraphyTab.classList).toContain("is-active");
    inscriptionsTab.click();
    await waitForAnimationFrames(dom.window, 40);
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);
    expect(inscriptionsTab.classList).toContain("is-active");
  });

  it("defers a browse-nav page change until the drag ends", async () => {
    const dom = renderPreview({}, { viewportWidth: 390 });
    const document = dom.window.document;
    const navigation = document.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const bubble = navigation?.querySelector<HTMLElement>(".yoyi-nav-bubble");
    const homeTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="home"]',
    );
    const calligraphyTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="calligraphy"]',
    );
    const primaryTrack = document.querySelector<HTMLElement>(
      '[data-pager="primary"] [data-pager-track]',
    );
    if (
      !navigation ||
      !bubble ||
      !homeTab ||
      !calligraphyTab ||
      !primaryTrack
    ) {
      throw new Error("browse nav drag fixture missing");
    }

    layoutBottomNav(navigation);
    dispatchPointer(dom.window, homeTab, "pointerdown", {
      clientX: 50,
      clientY: 730,
      timeStamp: 1_000,
    });
    dispatchPointer(dom.window, navigation, "pointermove", {
      clientX: 250,
      clientY: 730,
      timeStamp: 1_200,
    });

    expect(homeTab.classList.contains("is-active")).toBe(true);
    expect(calligraphyTab.classList.contains("is-active")).toBe(false);
    expect(calligraphyTab.classList.contains("is-nav-hot")).toBe(true);
    expect(dom.window.history.state).toEqual({ kind: "primary", view: "home" });
    expect(primaryTrack.style.transform).toBe("");
    expect(bubble.style.transform).toContain("translate3d(200px, 4px, 0)");

    dispatchPointer(dom.window, navigation, "pointerup", {
      clientX: 250,
      clientY: 730,
      timeStamp: 1_400,
    });
    await waitForAnimationFrames(dom.window, 40);

    expect(calligraphyTab.classList.contains("is-active")).toBe(true);
    expect(calligraphyTab.classList.contains("is-nav-hot")).toBe(false);
    expect(dom.window.history.state).toEqual({
      kind: "primary",
      view: "calligraphy",
    });
    expect(primaryTrack.style.transform).toBe("");
  });

  it("keeps create outside browse-nav drags and as an independent click target", async () => {
    const dom = renderPreview({}, { viewportWidth: 390 });
    const document = dom.window.document;
    const navigation = document.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const bubble = navigation?.querySelector<HTMLElement>(".yoyi-nav-bubble");
    const calligraphyTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="calligraphy"]',
    );
    const createTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="create"]',
    );
    if (!navigation || !bubble || !calligraphyTab || !createTab) {
      throw new Error("create nav drag fixture missing");
    }

    layoutBottomNav(navigation);
    calligraphyTab.click();
    await waitForAnimationFrames(dom.window, 40);
    dispatchPointer(dom.window, calligraphyTab, "pointerdown", {
      clientX: 250,
      clientY: 730,
      timeStamp: 1_000,
    });
    dispatchPointer(dom.window, navigation, "pointermove", {
      clientX: 480,
      clientY: 730,
      timeStamp: 1_200,
    });
    expect(calligraphyTab.classList.contains("is-active")).toBe(true);
    expect(createTab.classList.contains("is-nav-hot")).toBe(false);
    expect(bubble.style.transform).toContain("translate3d(200px, 4px, 0)");
    dispatchPointer(dom.window, navigation, "pointerup", {
      clientX: 480,
      clientY: 730,
      timeStamp: 1_400,
    });
    await waitForAnimationFrames(dom.window, 40);
    expect(calligraphyTab.classList.contains("is-active")).toBe(true);
    await waitMs(dom.window, 0);

    createTab.click();
    expect(createTab.classList.contains("is-active")).toBe(true);
    expect(bubble.style.transform).toBe("");
    dispatchPointer(dom.window, createTab, "pointerdown", {
      clientX: 350,
      clientY: 730,
      timeStamp: 1_600,
    });
    dispatchPointer(dom.window, navigation, "pointermove", {
      clientX: 50,
      clientY: 730,
      timeStamp: 1_800,
    });
    dispatchPointer(dom.window, navigation, "pointerup", {
      clientX: 50,
      clientY: 730,
      timeStamp: 2_000,
    });
    expect(createTab.classList.contains("is-active")).toBe(true);
    expect(bubble.style.transform).toBe("");
  });

  it("does not switch primary views when the main content is swiped horizontally", () => {
    const dom = renderPreview({}, { viewportWidth: 390 });
    const document = dom.window.document;
    const primaryShell = document.querySelector<HTMLElement>(
      '[data-pager="primary"]',
    );
    const homeTab = document.querySelector<HTMLElement>(
      '[data-primary-view="home"]',
    );
    if (!primaryShell || !homeTab) throw new Error("primary surface missing");

    swipe(dom.window, primaryShell, { x: 320, y: 420 }, { x: 40, y: 420 });

    expect(homeTab.classList.contains("is-active")).toBe(true);
    expect(
      document
        .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
        ?.classList.contains("is-active"),
    ).toBe(false);
  });

  it("does not paint calligraphy cards until the page width is ready", async () => {
    const dom = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: true,
        userAgent: phoneUserAgent,
        viewportHeight: 844,
        viewportWidth: 390,
      },
    );
    const { document } = dom.window;
    const app = document.querySelector<HTMLElement>("[data-mobile-app]");
    const view = document.querySelector<HTMLElement>(
      '[data-view="calligraphy"]',
    );
    const masonry = document.querySelector<HTMLElement>(
      '[data-pager-page="all"] .app-masonry',
    );
    const card = masonry?.querySelector<HTMLElement>(".app-card");
    const calligraphyTab = document.querySelector<HTMLElement>(
      '[data-primary-view="calligraphy"]',
    );
    if (!app || !view || !masonry || !card || !calligraphyTab) {
      throw new Error("calligraphy masonry missing");
    }

    const widths = { app: 390, view: 390, masonry: 40 };
    const stubWidth = (element: HTMLElement, key: keyof typeof widths) => {
      Object.defineProperty(element, "clientWidth", {
        configurable: true,
        get: () => widths[key],
      });
    };
    stubWidth(app, "app");
    stubWidth(view, "view");
    stubWidth(masonry, "masonry");

    calligraphyTab.click();
    await waitForAnimationFrames(dom.window, 8);
    expect(masonry.dataset.layoutReady).not.toBe("true");
    expect(card.style.width).toBe("");

    widths.masonry = 390;
    dom.window.dispatchEvent(new dom.window.Event("resize"));
    await waitForAnimationFrames(dom.window, 40);
    expect(masonry.dataset.layoutReady).toBe("true");
    expect(Number.parseFloat(card.style.width)).toBeGreaterThan(140);
    expect(Number.parseFloat(card.style.width)).toBeLessThan(390);
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
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="topics"]')
        ?.classList,
    ).toContain("is-pager-culled");
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

    expect(settleAtCadence(1000 / 60)).toBeLessThanOrEqual(420 + 1000 / 60);
    expect(settleAtCadence(1000 / 120)).toBeLessThanOrEqual(420 + 1000 / 120);
    expect(settleAtCadence(120)).toBeLessThanOrEqual(540);
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
    if (!homeScroll || !homeTrack)
      throw new Error("desktop home surface missing");
    expect(document.documentElement.dataset.platform).toBe("pc");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 40, deltaY: 80 });
    expect(homeScroll.classList).not.toContain("is-pager-following");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 80, deltaY: 0 });
    expect(homeScroll.classList).toContain("is-pager-following");
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-80, 0);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="nearby"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="topics"]')
        ?.classList,
    ).toContain("is-pager-culled");

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
    expect(homeTrack.style.transform).toBe("");
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="nearby"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-feed-panel="discover"]')
        ?.hidden,
    ).toBe(true);

    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    const calligraphyScroll = document.querySelector<HTMLElement>(
      '[data-pager="calligraphy"]',
    );
    if (!calligraphyScroll)
      throw new Error("desktop calligraphy surface missing");
    dispatchWheel(desktopDom.window, calligraphyScroll, {
      deltaX: 600,
      deltaY: 0,
    });
    await new Promise<void>((resolve) => {
      desktopDom.window.setTimeout(() => resolve(), 60);
    });
    await waitForAnimationFrames(desktopDom.window, 40);
    expect(
      document.querySelector<HTMLElement>('[data-calligraphy-category="ink"]')
        ?.classList,
    ).toContain("is-selected");
    expect(calligraphyScroll.classList).not.toContain("is-pager-following");
    expect(
      calligraphyScroll.querySelector<HTMLElement>("[data-pager-track]")?.style
        .transform,
    ).toBe("");
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
    if (!homeScroll || !homeTrack)
      throw new Error("desktop home surface missing");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 500, deltaY: 0 });
    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 200, deltaY: 0 });
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-700, 0);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 8, deltaY: 0 });
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.classList,
    ).toContain("is-selected");
    expect(pagerTranslateX(homeTrack)).toBeCloseTo(-700, 0);

    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 4, deltaY: 0 });
    expect(pagerTranslateX(homeTrack)).not.toBeCloseTo(-704, 0);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')
        ?.classList,
    ).toContain("is-selected");

    await waitForAnimationFrames(desktopDom.window, 40);
    expect(homeScroll.classList).not.toContain("is-pager-following");
    expect(homeTrack.style.transform).toBe("");

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
      deltaX: 8,
      deltaY: 0,
    });
    expect(
      document.querySelector<HTMLElement>('[data-calligraphy-category="ink"]')
        ?.classList,
    ).toContain("is-selected");
    dispatchWheel(desktopDom.window, calligraphyScroll, {
      deltaX: 4,
      deltaY: 0,
    });
    expect(pagerTranslateX(calligraphyTrack)).toBeCloseTo(-700, 0);
    await waitForAnimationFrames(desktopDom.window, 40);
    expect(
      document.querySelector<HTMLElement>('[data-calligraphy-category="ink"]')
        ?.classList,
    ).toContain("is-selected");
    expect(calligraphyScroll.classList).not.toContain("is-pager-following");
    expect(calligraphyTrack.style.transform).toBe("");
  });

  it("does not reopen inscription detail from horizontal PC wheel after back", async () => {
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
    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    document
      .querySelector<HTMLElement>(
        '[data-view="inscriptions"] [data-content-id="inscription-road"]',
      )
      ?.click();
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "古道石刻",
    );

    const backButton =
      document.querySelector<HTMLElement>("[data-detail-back]");
    if (!backButton) throw new Error("detail back button not found");
    await clickAndWaitForHistory(desktopDom.window, backButton);
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);

    const inscriptionsScroll = document.querySelector<HTMLElement>(
      '[data-scroll-view="inscriptions"]',
    );
    if (!inscriptionsScroll) throw new Error("inscriptions scroll missing");
    const inscriptionsWheel = dispatchWheel(
      desktopDom.window,
      inscriptionsScroll,
      { deltaX: 240, deltaY: 0 },
    );
    expect(inscriptionsWheel.defaultPrevented).toBe(true);
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-primary-view="home"]')
        ?.classList,
    ).not.toContain("is-active");

    document.querySelector<HTMLElement>('[data-primary-view="home"]')?.click();
    const homeScroll = document.querySelector<HTMLElement>(
      '[data-scroll-view="home"]',
    );
    if (!homeScroll) throw new Error("home scroll missing");
    dispatchWheel(desktopDom.window, homeScroll, { deltaX: 80, deltaY: 0 });
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>('[data-view="home"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.classList,
    ).toContain("is-selected");

    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    const calligraphyScroll = document.querySelector<HTMLElement>(
      '[data-pager="calligraphy"]',
    );
    if (!calligraphyScroll) throw new Error("calligraphy scroll missing");
    dispatchWheel(desktopDom.window, calligraphyScroll, {
      deltaX: 80,
      deltaY: 0,
    });
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>('[data-calligraphy-category="all"]')
        ?.classList,
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

    expect(observedElements).toHaveLength(3);
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

  it("opens settings from the profile shortcut and returns to profile", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    expect(document.querySelectorAll("[data-open-settings]")).toHaveLength(1);
    openSettingsFromProfile(document);
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
      document.querySelector<HTMLElement>('[data-view="profile"]')?.hidden,
    ).toBe(false);
  });

  it("opens the QA log from settings, records detail, and returns through settings", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();
    const detailBack =
      document.querySelector<HTMLElement>("[data-detail-back]");
    if (!detailBack) throw new Error("detail back missing");
    await clickAndWaitForHistory(dom.window, detailBack);
    openSettingsFromProfile(document);
    document.querySelector<HTMLElement>("[data-open-qa-log]")?.click();
    expect(
      document.querySelector<HTMLElement>('[data-view="qa-log"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>("[data-bottom-navigation]")?.hidden,
    ).toBe(true);
    expect(document.querySelector("[data-qa-log-list]")?.textContent).toContain(
      "山门北壁题记",
    );

    document.querySelector<HTMLElement>("[data-qa-log-clear]")?.click();
    expect(document.querySelector("[data-qa-log-list]")?.children).toHaveLength(
      0,
    );

    const logBack = document.querySelector<HTMLElement>("[data-qa-log-back]");
    if (!logBack) throw new Error("qa log back missing");
    await clickAndWaitForHistory(dom.window, logBack);
    expect(
      document.querySelector<HTMLElement>('[data-view="settings"]')?.hidden,
    ).toBe(false);

    const settingsBack = document.querySelector<HTMLElement>(
      "[data-settings-back]",
    );
    if (!settingsBack) throw new Error("settings back missing");
    await clickAndWaitForHistory(dom.window, settingsBack);
    expect(
      document.querySelector<HTMLElement>('[data-view="profile"]')?.hidden,
    ).toBe(false);
  });

  it("copies the current QA log from settings and the log page", async () => {
    const writes: string[] = [];
    const dom = renderPreview({}, {}, (window) => {
      Object.defineProperty(window.navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            writes.push(text);
          },
        },
      });
    });
    const document = dom.window.document;
    openSettingsFromProfile(document);
    const settingsCopy = document.querySelector<HTMLButtonElement>(
      '[data-setting-group="qa-log"] [data-qa-log-copy]',
    );
    const logCopy = document.querySelector<HTMLButtonElement>(
      '[data-view="qa-log"] [data-qa-log-copy]',
    );
    if (!settingsCopy || !logCopy) throw new Error("qa log copy missing");

    expect(settingsCopy.textContent?.trim()).toBe("复制日志");
    settingsCopy.click();
    await waitMs(dom.window, 0);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatch(/\d{2}:\d{2}:\d{2} \[boot]/);
    expect(writes[0]).toContain("[settings] 打开设置");
    expect(settingsCopy.textContent).toBe("已复制");
    expect(logCopy.textContent).toBe("已复制");

    document.querySelector<HTMLElement>("[data-open-qa-log]")?.click();
    logCopy.click();
    await waitMs(dom.window, 0);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toContain("[settings] 打开设置");
    expect(logCopy.textContent).toBe("已复制");

    document.querySelector<HTMLElement>("[data-qa-log-clear]")?.click();
    logCopy.click();
    await waitMs(dom.window, 0);
    expect(writes).toHaveLength(2);
    expect(logCopy.textContent).toBe("暂无记录");
    expect(settingsCopy.textContent).toBe("暂无记录");
  });

  it("persists explicit theme and home feed layout choices", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    openSettingsFromProfile(document);

    const themeToggle = document.querySelector<HTMLButtonElement>(
      "[data-theme-toggle]",
    );
    const layoutToggle = document.querySelector<HTMLButtonElement>(
      "[data-layout-toggle]",
    );
    if (!themeToggle || !layoutToggle) {
      throw new Error("settings toggles not found");
    }

    expect(themeToggle.getAttribute("aria-label")).toBe(
      "切换主题：当前跟随系统",
    );
    expect(
      themeToggle.querySelector("[data-icon]")?.getAttribute("data-icon"),
    ).toBe("theme-system");
    themeToggle.click();
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(themeToggle.dataset.themeMode).toBe("light");
    expect(
      themeToggle.querySelector("[data-icon]")?.getAttribute("data-icon"),
    ).toBe("theme-light");
    expect(themeToggle.getAttribute("aria-label")).toBe(
      "切换主题：当前浅色模式",
    );
    themeToggle.click();
    layoutToggle.click();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.homeLayout).toBe("single");
    expect(themeToggle.dataset.themeMode).toBe("dark");
    expect(layoutToggle.dataset.layoutMode).toBe("single");
    expect(
      themeToggle.querySelector("[data-icon]")?.getAttribute("data-icon"),
    ).toBe("theme-dark");
    expect(
      layoutToggle.querySelector("[data-icon]")?.getAttribute("data-icon"),
    ).toBe("layout-single");
    expect(layoutToggle.getAttribute("aria-label")).toBe("切换布局：当前单列");
    expect(dom.window.localStorage.getItem("yoyi.theme-preference")).toBe(
      "dark",
    );
    expect(dom.window.localStorage.getItem("yoyi.home-feed-layout")).toBe(
      "single",
    );
    expect(script).toContain("function intendedMasonryColumns");
    expect(script).toContain("function recalculateLayout");
    expect(script).toContain('layout === "single"');

    themeToggle.click();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(themeToggle.dataset.themeMode).toBe("system");
    expect(
      themeToggle.querySelector("[data-icon]")?.getAttribute("data-icon"),
    ).toBe("theme-system");
    expect(themeToggle.getAttribute("aria-label")).toBe(
      "切换主题：当前跟随系统",
    );
    expect(dom.window.localStorage.getItem("yoyi.theme-preference")).toBe(
      "system",
    );
  });

  it("uses intrinsic image ratios for home, topics, and calligraphy masonry cards", () => {
    const collectRatios = (document: Document, selector: string) =>
      [...document.querySelectorAll<HTMLImageElement>(`${selector} img`)]
        .map((image) => image.style.aspectRatio)
        .filter(Boolean);

    const phone = renderPreview();
    const homeRatios = collectRatios(
      phone.window.document,
      '[data-feed-grid="discover"]',
    );
    const nearbyRatios = collectRatios(
      phone.window.document,
      '[data-feed-grid="nearby"]',
    );
    const calligraphyRatios = collectRatios(
      phone.window.document,
      '[data-pager-page="all"] .app-masonry',
    );
    const topicCards = phone.window.document.querySelectorAll(
      "[data-topics-grid] .app-card.app-topic-card",
    );
    expect(new Set(homeRatios).size).toBeGreaterThan(1);
    expect(new Set(nearbyRatios).size).toBeGreaterThan(1);
    expect(new Set(calligraphyRatios).size).toBeGreaterThan(1);
    expect(topicCards.length).toBeGreaterThan(0);
    expect(homeRatios.some((ratio) => ratio === "1200 / 900")).toBe(false);
    expect(script).toContain("function createContentCard");
    expect(script).toContain("function applyMediaIntrinsics");
    expect(catalogAdapterScript).toContain("function demoImageIntrinsics");
    expect(sharedCss).not.toMatch(/\.app-card img \{[^}]*height:\s*240px/);
    expect(sharedCss).not.toMatch(
      /\.app-card\s*\{[^}]*grid-template-rows:\s*240px/,
    );

    const p5 = renderP5Preview();
    const p5HomeRatios = collectRatios(
      p5.window.document,
      '[data-feed-grid="discover"]',
    );
    expect(p5HomeRatios.some((ratio) => ratio === "1200 / 900")).toBe(false);
    expect(new Set(p5HomeRatios).size).toBeGreaterThan(1);
    expect(
      p5.window.document.querySelector(
        "[data-topics-grid] .app-card.app-topic-card",
      ),
    ).toBeTruthy();
  });

  it("keeps one layout mode across topics and calligraphy categories", () => {
    const masonryColumns = (document: Document, selector: string) =>
      document.querySelector<HTMLElement>(selector)?.dataset.masonryColumns;
    const inscriptionColumns = (document: Document) =>
      document.querySelector<HTMLElement>(
        '[data-view="inscriptions"] .app-list',
      )?.dataset.inscriptionColumns;

    const assertSharedLayout = (
      document: Document,
      mode: "single" | "double",
    ) => {
      const columns = mode === "single" ? "1" : "2";
      expect(document.documentElement.dataset.homeLayout).toBe(mode);
      expect(masonryColumns(document, '[data-feed-grid="discover"]')).toBe(
        columns,
      );
      expect(masonryColumns(document, '[data-feed-grid="nearby"]')).toBe(
        columns,
      );
      expect(masonryColumns(document, "[data-topics-grid]")).toBe(columns);
      expect(inscriptionColumns(document)).toBe("1");
      expect(document.querySelector("[data-topics-grid]")?.className).toContain(
        "app-topics__grid",
      );
      expect(
        document
          .querySelector('[data-view="inscriptions"] .app-list')
          ?.classList.contains("app-masonry"),
      ).toBe(false);
      for (const category of ["all", "ink", "rubbing"] as const) {
        expect(
          masonryColumns(
            document,
            `[data-pager-page="${category}"] .app-calligraphy-grid`,
          ),
        ).toBe(columns);
      }
    };

    const applyLayoutAcrossLists = (
      document: Document,
      window: Window & typeof globalThis,
    ) => {
      assertSharedLayout(document, "double");
      openSettingsFromProfile(document);
      document.querySelector<HTMLElement>("[data-layout-toggle]")?.click();
      expect(document.documentElement.dataset.homeLayout).toBe("single");
      const qaLog = JSON.parse(
        window.sessionStorage.getItem("yoyi.qa-log") ?? "[]",
      ) as Array<{ message?: string; type?: string }>;
      const layoutLog = qaLog.find((entry) => entry.type === "layout");
      expect(layoutLog?.message).toContain("device=");
      expect(layoutLog?.message).toContain("orientation=");
      expect(layoutLog?.message).toContain("page=");
      expect(layoutLog?.message).toContain("section=");
      expect(layoutLog?.message).toContain("mode=single");
      expect(layoutLog?.message).toContain("columns=1");
      document
        .querySelector<HTMLElement>('[data-primary-view="home"]')
        ?.click();
      document
        .querySelector<HTMLElement>('[data-home-feed="discover"]')
        ?.click();
      assertSharedLayout(document, "single");
      document.querySelector<HTMLElement>('[data-home-feed="nearby"]')?.click();
      assertSharedLayout(document, "single");
      document.querySelector<HTMLElement>('[data-home-feed="topics"]')?.click();
      assertSharedLayout(document, "single");
      document
        .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
        ?.click();
      assertSharedLayout(document, "single");
      document
        .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
        ?.click();
      for (const category of ["all", "ink", "rubbing"] as const) {
        document
          .querySelector<HTMLElement>(
            `[data-calligraphy-category="${category}"]`,
          )
          ?.click();
        assertSharedLayout(document, "single");
      }
      openSettingsFromProfile(document);
      document.querySelector<HTMLElement>("[data-layout-toggle]")?.click();
      document
        .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
        ?.click();
      assertSharedLayout(document, "double");
      expect(window.localStorage.getItem("yoyi.home-feed-layout")).toBe(
        "double",
      );
    };

    const phone = renderPreview();
    applyLayoutAcrossLists(phone.window.document, phone.window);

    const tablet = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: false,
        userAgent: tabletUserAgent,
        viewportHeight: 1024,
        viewportWidth: 768,
      },
    );
    applyLayoutAcrossLists(tablet.window.document, tablet.window);
    setViewportSize(tablet, 1024, 768);
    expect(tablet.window.document.documentElement.dataset.platform).toBe(
      "tablet",
    );
    assertSharedLayout(tablet.window.document, "double");

    const tabletLandscape = renderPreview(
      { "yoyi.home-feed-layout": "single" },
      {
        maxTouchPoints: 5,
        mobile: false,
        userAgent: tabletUserAgent,
        viewportHeight: 768,
        viewportWidth: 1024,
      },
    );
    expect(
      tabletLandscape.window.document.documentElement.dataset.homeLayout,
    ).toBe("single");
    expect(
      tabletLandscape.window.document.documentElement.dataset.platform,
    ).toBe("tablet");
    assertSharedLayout(tabletLandscape.window.document, "single");
    setViewportSize(tabletLandscape, 768, 1024);
    assertSharedLayout(tabletLandscape.window.document, "single");

    const pc = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 900,
        viewportWidth: 1440,
      },
    );
    expect(pc.window.document.documentElement.dataset.platform).toBe("pc");
    expect(
      Number(masonryColumns(pc.window.document, '[data-feed-grid="discover"]')),
    ).toBeGreaterThanOrEqual(3);
    expect(Number(inscriptionColumns(pc.window.document))).toBe(1);
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

  it("keeps the four-entry navigation and topbar profile entry in the approved device matrix", () => {
    const expectNewPrimaryViews = (document: Document) => {
      document
        .querySelector<HTMLElement>('[data-primary-view="create"]')
        ?.click();
      expect(
        document.querySelector<HTMLElement>('[data-view="create"]')?.classList,
      ).not.toContain("is-pager-active");
      expect(
        document
          .querySelector('[data-primary-view="create"]')
          ?.classList.contains("is-active"),
      ).toBe(true);
      expect(document.querySelector("[data-create-text]")).toBeTruthy();
      document
        .querySelector<HTMLElement>(
          '[data-view="home"] [data-topbar-action="profile"]',
        )
        ?.click();
      expect(
        document.querySelector<HTMLElement>('[data-view="profile"]')?.classList,
      ).not.toContain("is-pager-active");
      expect(
        document.querySelectorAll("[data-primary-view].is-active"),
      ).toHaveLength(0);
      expect(document.querySelectorAll("[data-profile-tab]")).toHaveLength(4);
      expect(
        document.querySelectorAll("[data-profile-posts] .app-card"),
      ).toHaveLength(6);
    };

    for (const [viewportWidth, viewportHeight] of [
      [390, 844],
      [844, 390],
      [932, 430],
    ] as const) {
      const phone = renderPreview(
        {},
        {
          mobile: true,
          userAgent: phoneUserAgent,
          viewportHeight,
          viewportWidth,
        },
      );
      expect(phone.window.document.documentElement.dataset.platform).toBe(
        "phone",
      );
      expect(activePlatformStyles(phone.window.document)).toEqual(["phone"]);
      expect(
        phone.window.document.querySelectorAll(
          "[data-bottom-navigation] [data-nav-entry]",
        ),
      ).toHaveLength(4);
      expectNewPrimaryViews(phone.window.document);
    }

    for (const [viewportWidth, viewportHeight] of [
      [834, 1112],
      [1194, 834],
    ] as const) {
      const tablet = renderPreview(
        {},
        {
          mobile: false,
          userAgent: tabletUserAgent,
          viewportHeight,
          viewportWidth,
        },
      );
      expect(tablet.window.document.documentElement.dataset.platform).toBe(
        "tablet",
      );
      expect(activePlatformStyles(tablet.window.document)).toEqual(["tablet"]);
      expect(
        tablet.window.document.querySelectorAll(
          "[data-bottom-navigation] [data-nav-entry]",
        ),
      ).toHaveLength(4);
      expectNewPrimaryViews(tablet.window.document);
    }

    for (const [viewportWidth, platform] of [
      [895, "tablet"],
      [896, "pc"],
      [1440, "pc"],
    ] as const) {
      const desktop = renderPreview(
        {},
        {
          maxTouchPoints: 0,
          mobile: false,
          userAgent: desktopUserAgent,
          viewportHeight: 900,
          viewportWidth,
        },
      );
      expect(desktop.window.document.documentElement.dataset.platform).toBe(
        platform,
      );
      expect(activePlatformStyles(desktop.window.document)).toEqual([platform]);
      expect(
        desktop.window.document.querySelectorAll(
          "[data-bottom-navigation] [data-nav-entry]",
        ),
      ).toHaveLength(4);
      expectNewPrimaryViews(desktop.window.document);
    }
  });

  it("keeps topbar actions non-shrinking and safe-area aware", () => {
    expect(sharedCss).toContain("--app-topbar-side-space: 8px");
    expect(sharedCss).toContain(
      "max(var(--app-topbar-side-space), env(safe-area-inset-right))",
    );
    expect(sharedCss).toContain(
      "max(var(--app-topbar-side-space), env(safe-area-inset-left))",
    );
    expect(sharedCss).toMatch(
      /\.app-topbar__actions \{[^}]*flex: 0 0 auto;[^}]*min-width: 70px;/,
    );
    expect(sharedCss).toMatch(
      /\.app-topbar-profile \{[^}]*flex: 0 0 32px;[^}]*min-width: 32px;[^}]*min-height: 32px;/,
    );
    expect(previewCss).toContain(
      "--app-topbar-side-space: var(--yoyi-space-4)",
    );
    expect(tabletCss).toContain("--app-topbar-side-space: var(--yoyi-space-5)");
    expect(tabletCss).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(pcCss).toContain("--app-topbar-side-space: var(--yoyi-space-6)");
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
      stored.window.document.querySelector<HTMLButtonElement>(
        "[data-theme-toggle]",
      )?.dataset.themeMode,
    ).toBe("dark");
    expect(
      stored.window.document
        .querySelector("[data-theme-toggle] [data-icon]")
        ?.getAttribute("data-icon"),
    ).toBe("theme-dark");
    expect(
      stored.window.document.querySelector<HTMLButtonElement>(
        "[data-layout-toggle]",
      )?.dataset.layoutMode,
    ).toBe("single");

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
    expect(sharedCss).toContain("overscroll-behavior-x: none");
    expect(sharedCss).toContain(".app-pager__page.is-pager-culled");
    expect(sharedCss).not.toContain("prefers-reduced-motion");
    expect(sharedCss).not.toMatch(/backdrop-filter\s*:/i);
    expect(previewCss).not.toContain("@media (min-width: 48rem)");
    expect(previewCss).toContain("orientation: portrait");
    expect(previewCss).toContain("orientation: landscape");
    expect(previewCss).toContain("min-width: 35.5rem");
    expect(previewCss).toContain('"categories actions"');
    expect(previewCss).toContain('"search search"');
    expect(previewCss).not.toContain("calc(88px + env(safe-area-inset-left))");
    expect(previewCss).toContain(
      "max(var(--yoyi-space-3), env(safe-area-inset-bottom))",
    );
    expect(previewCss).toContain("--app-bottom-nav-viewport-inset");
    expect(previewCss).toContain("height: 100svh");
    expect(previewCss).toContain("overflow-x: clip");
    expect(tabletCss).toContain("height: 100svh");
    expect(tabletCss).toContain("overflow-x: clip");
    expect(tabletCss).toContain("@media (min-width: 48rem)");
    expect(tabletCss).not.toContain("@media (min-width: 56rem)");
    expect(tabletCss).not.toContain("@media (min-width: 64rem)");
    expect(tabletCss).not.toContain("@media (min-width: 90rem)");
    expect(pcCss).toContain("@media (min-width: 56rem)");
    expect(pcCss).toContain("@media (min-width: 64rem)");
    expect(pcCss).toContain("@media (min-width: 90rem)");
    expect(tabletCss).toContain("floating glass capsule at the bottom");
    expect(tabletCss).toContain("orientation: landscape");
    expect(tabletCss).toContain("--app-bottom-nav-max-width: 480px");
    expect(sharedCss).toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr))",
    );
    expect(tabletCss).toContain(
      ".app-bottom-navigation.yoyi-mobile-bottom-navigation:not(.is-minimized)",
    );
    expect(tabletCss).toMatch(
      /orientation: landscape[\s\S]*\.is-minimized\s*\{[^}]*width: 44px/,
    );
    expect(sharedCss).toContain("--app-bottom-nav-max-width: 520px");
    expect(sharedCss).toContain("left: var(--app-bottom-nav-side-gap)");
    expect(sharedCss).toContain("right: var(--app-bottom-nav-side-gap)");
    expect(tabletCss).not.toContain("calc(88px + env(safe-area-inset-left))");
    expect(uiCss).toMatch(
      /html\[data-platform="phone"\][\s\S]*\.yoyi-navigation-entry\.yoyi-functional-glass/,
    );
    expect(uiCss).toMatch(
      /html\[data-platform="tablet"\][\s\S]*\.yoyi-navigation-entry\.yoyi-functional-glass/,
    );
    expect(uiCss).not.toContain(
      'html[data-platform="pc"]\n  .yoyi-mobile-bottom-navigation\n  .yoyi-navigation-entry.yoyi-functional-glass',
    );
    expect(pcCss).toMatch(
      /\.app-bottom-navigation \.yoyi-navigation-entry\s*\{[^}]*background: transparent;[^}]*border: 0;[^}]*box-shadow: none;/,
    );
    expect(pcCss).toContain(
      "scroll-padding-bottom: calc(80px + env(safe-area-inset-bottom))",
    );
    expect(sharedCss).toContain(
      "scroll-padding-bottom: calc(80px + env(safe-area-inset-bottom))",
    );
    expect(sharedCss).not.toContain(
      "padding-bottom: calc(68px + env(safe-area-inset-bottom))",
    );
    expect(pcCss).not.toContain(
      "padding-bottom: calc(68px + env(safe-area-inset-bottom))",
    );
    expect(sharedCss).toContain("--app-bottom-nav-clearance");
    expect(sharedCss).toContain('html[data-platform="phone"] .app-view');
    expect(sharedCss).toMatch(
      /html\[data-platform="phone"\] \.app-view,\s*html\[data-platform="tablet"\] \.app-view\s*\{[^}]*padding-bottom: 0/,
    );
    expect(sharedCss).not.toContain(
      'html[data-platform="phone"]\n  .app-view:not(.app-detail)',
    );
    expect(tabletCss).toContain("padding-bottom: 0");
    expect(script).toContain(
      'root.style.setProperty("--app-bottom-nav-viewport-inset"',
    );
    expect(sharedCss).toContain(
      "grid-template-columns: repeat(4, minmax(0, 1fr))",
    );
    expect(previewCss).toContain(
      "grid-template-columns: repeat(4, minmax(0, 1fr))",
    );
    expect(pcCss).toContain("grid-template-rows: repeat(4, 68px)");
    expect(pcCss).toContain("--app-pc-nav-safe-area");
    expect(pcCss).toContain("padding-left: var(--app-pc-nav-safe-area)");
    expect(pcCss).toContain("--app-pc-nav-width: clamp(88px, 7vw, 104px)");
    expect(pcCss).toContain("flex-direction: column");
    expect(pcCss).toContain("height: 68px");
    expect(pcCss).toContain("gap: 4px");
    expect(pcCss).toContain("top: 0");
    expect(pcCss).toContain("bottom: 0");
    expect(pcCss).toContain("left: 0");
    expect(pcCss).toContain("height: 100dvh");
    expect(pcCss).toContain("background: var(--yoyi-color-background-muted)");
    expect(pcCss).not.toContain("box-shadow: inset 2px 0 0");
    expect(pcCss).toMatch(
      /\.app-primary-shell:not\(\.is-pager-following\)[\s\S]*\.app-view:not\(\.is-pager-active\)[\s\S]*padding-left: 0/,
    );
    expect(script).toContain('root.dataset.platform === "pc") return;');
    expect(pcCss).toContain(".app-nav-brand {\n    display: none;");
    expect(pcCss).not.toContain("calc(164px + env(safe-area-inset-left))");
    expect(pcCss).not.toContain("border-width: 9px 0 9px 10px");
    expect(pcCss).not.toContain("opacity: 0.88");
    expect(previewCss).toContain("touch-action: pan-y");
    expect(tabletCss).toContain("touch-action: pan-y");
    expect(previewCss).not.toContain("touch-action: pan-x pan-y");
    expect(tabletCss).not.toContain("touch-action: pan-x pan-y");
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
    expect(html).toContain('data-pager="primary"');
    expect(pcCss).toContain('[data-setting-group="home-layout"]');
    expect(html).toContain("data-theme-toggle");
    expect(html).toContain(
      "app-quick-action-overlay__backdrop yoyi-functional-glass",
    );
    expect(html).toContain("data-layout-toggle");
    expect(html).not.toContain("data-theme-option");
    expect(html).not.toContain("data-layout-option");
    expect(html).not.toContain("单列展示");
    expect(html).not.toContain("浅色模式");
    expect(sharedCss).toContain(".app-setting-toggles");
    expect(sharedCss).not.toContain(".app-setting-option");
    expect(tabletCss).toContain("var(--yoyi-container-reading)");
    expect(pcCss).toContain("var(--yoyi-container-reading)");
    expect(tabletCss).toMatch(
      /\.app-masonry\s*\{[^}]*padding: var\(--yoyi-space-5\) var\(--yoyi-space-5\)/,
    );
    expect(sharedCss).toContain("--app-content-radius");
    expect(sharedCss).toContain("--app-masonry-gap");
    expect(sharedCss).toContain("--app-elevation-content");
    expect(sharedCss).toContain("--app-elevation-content-hover");
    expect(sharedCss).toContain("--app-elevation-panel");
    expect(sharedCss).toContain("box-shadow: var(--app-elevation-content)");
    expect(sharedCss).toContain("box-shadow: var(--app-elevation-panel)");
    expect(sharedCss).not.toMatch(/\.app-card img \{[^}]*box-shadow:/);
    expect(pcCss).toContain("box-shadow: var(--app-elevation-content-hover)");
    expect(pcCss).toContain("translateY(-2px)");
    expect(sharedCss).toMatch(
      /\.app-masonry,\s*\.app-topics__grid\s*\{[\s\S]*?position:\s*relative/,
    );
    expect(sharedCss).toMatch(/\.app-card img \{[^}]*height: auto/);
    expect(sharedCss).toMatch(
      /\.app-card img \{[^}]*border-radius: var\(--app-content-radius\)/,
    );
    expect(sharedCss).not.toMatch(/\.app-card img \{[^}]*object-fit: cover/);
    expect(sharedCss).not.toMatch(/\.app-card img \{[^}]*min-height:/);
    expect(script).toContain("function keepSummaryTokens");
    expect(script).toContain("function renderDetailKindPeriod");
    expect(script).toContain("function layoutMasonry");
    expect(script).toContain("function masonryWidthIsReady");
    expect(script).toContain("function masonryExpectedWidth");
    expect(script).toContain('dataset.layoutReady = "true"');
    expect(sharedCss).toContain(".app-masonry:not([data-layout-ready])");
    expect(script).toContain("function intendedMasonryColumns");
    expect(sharedCss).toContain("--app-detail-media-max-height");
    expect(sharedCss).toMatch(
      /\.app-detail__media-frame \{[^}]*height: var\(--app-detail-media-max-height\)/,
    );
    expect(script).toContain("function applyDetailMedia");
    expect(sharedCss).toMatch(
      /\.app-detail-focus__image \{[^}]*object-fit: contain/,
    );
    expect(sharedCss).toMatch(
      /\.app-detail__media-frame img \{[^}]*width: auto/,
    );
    expect(sharedCss).toMatch(
      /\.app-detail__media-frame img \{[^}]*height: auto/,
    );
    expect(sharedCss).toMatch(
      /\.app-detail__media-frame img \{[^}]*max-width: 100%/,
    );
    expect(sharedCss).toMatch(
      /\.app-detail__media-frame img \{[^}]*max-height: 100%/,
    );
    expect(sharedCss).toMatch(
      /\.app-detail__media-frame img \{[^}]*object-fit: contain/,
    );
    expect(sharedCss).not.toContain("max-height: min(42dvh, 220px)");
    expect(sharedCss).not.toContain("max-height: min(75dvh, 820px)");
    expect(pcCss).not.toContain("max-height: min(75dvh, 820px)");
    expect(sharedCss).not.toMatch(
      /\.app-detail__media-frame img \{[^}]*object-fit: cover/,
    );
    expect(script).toContain("function recalculateLayout");
    expect(script).toContain("Math.min(...heights)");
    expect(script).toContain('querySelectorAll(".app-masonry")');
    expect(pcCss).not.toContain("aspect-ratio: 3 / 4");
    expect(pcCss).not.toContain("aspect-ratio: 1 / 1");
    expect(previewCss).toMatch(
      /@media \(orientation: landscape\) \{[\s\S]*?html\[data-platform="phone"\]\s*\{[^}]*--app-inscription-thumb: 72px/,
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
      expect(css).not.toMatch(/backdrop-filter\s*:/i);
      expect(effectiveCss).toContain("overscroll-behavior-y: auto");
      expect(effectiveCss).toContain("overscroll-behavior-x: none");
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
    expect(html).toContain('data-view="create"');
    expect(html).toContain('data-primary-view="calligraphy"');
    expect(html).toContain('data-primary-view="create"');
    expect(html).toContain('data-view="profile"');
    expect(html).toContain('data-topbar-action="profile"');
    expect(html).not.toContain('data-primary-view="profile"');
    expect(html).toContain('data-icon="create"');
    expect(html).toContain('data-label="nav-create"');
    for (const hook of [
      "data-create-composer",
      "data-create-text",
      "data-create-media",
      "data-create-tags",
      "data-create-submit",
      "data-profile-stats",
      "data-profile-posts",
      "data-profile-feedback",
    ]) {
      expect(html).toContain(hook);
    }
    expect(html.match(/data-profile-tab=/g)).toHaveLength(4);
    expect(html).toContain("prototype-only synthetic non-production");
    expect(html).toContain('src="./fixtures/profile.placeholder.js"');
    expect(profileFixture).toContain("YOYI_PROFILE_PLACEHOLDER");
    expect(profileFixture).toContain("collections:");
    expect(profileFixture).not.toContain("favorites:");
    expect(profileFixture).not.toContain("likes:");
    expect(profileFixture).toContain("non-production");
    expect(profileFixture).not.toContain("fetch(");
    expect(sharedCss).toContain(".app-create-composer:focus-within");
    expect(sharedCss).toContain("var(--yoyi-color-background-surface)");
    expect(script).toContain("function handleReservedCreateAction");
    expect(script).not.toContain("fetch(");
    expect(html).not.toContain("app-nav-text-label");
    expect(sharedCss).toContain(
      '-webkit-mask-image: url("./assets/nav-create.svg")',
    );
    expect(sharedCss).toContain(
      '-webkit-mask-image: url("./assets/nav-profile.svg")',
    );
    expect(sharedCss).toContain(
      '-webkit-mask-image: url("./assets/nav-create-label-mask.png?v=20260822")',
    );
    expect(sharedCss).toContain(
      '-webkit-mask-image: url("./assets/nav-profile-label-mask.png?v=20260822")',
    );
    for (const labelAsset of [createLabelAsset, profileLabelAsset]) {
      expect(labelAsset.subarray(1, 4).toString()).toBe("PNG");
      expect(labelAsset.readUInt32BE(16)).toBe(264);
      expect(labelAsset.readUInt32BE(20)).toBe(120);
    }
    expect(html).toContain("yoyi-nav-bubble");
    expect(html).toContain("yoyi.theme-preference");
    expect(html).toContain("yoyi.home-feed-layout");
    expect(html).toContain('data-home-feed="topics"');
    expect(html).toContain("app-masonry app-topics__grid");
    expect(html).not.toContain("app-list app-masonry");
    expect(html).toMatch(
      /data-view="inscriptions"[\s\S]*class="app-inscription-card"[\s\S]*app-inscription-card__title[\s\S]*app-inscription-card__meta/,
    );
    expect(html).not.toContain("app-list-item");
    expect(html).not.toContain("app-list-item__body");
    expect(html).not.toContain("app-list-item__title");
    expect(sharedCss).toContain("writing-mode: horizontal-tb");
    expect(sharedCss).not.toMatch(/writing-mode:\s*vertical/);
    expect(previewCss).not.toMatch(/writing-mode:\s*vertical/);
    expect(tabletCss).not.toMatch(/writing-mode:\s*vertical/);
    expect(pcCss).not.toMatch(/writing-mode:\s*vertical/);
    expect(sharedCss).not.toContain("grid-template-columns: 96px");
    expect(sharedCss).toContain(".app-inscription-card");
    expect(script).toContain("function intendedInscriptionColumns");
    expect(script).not.toContain('classList.contains("app-list")');
    expect(html).not.toContain("app-home-motto");
    expect(html).toContain('data-placeholder="topics-v1"');
    expect(html).toContain('data-view="topic-column"');
    expect(html).toContain('data-setting-group="home-layout"');
    expect(html).toContain('src="./device-platform.js"');
    expect(html).toContain(
      'href="./preview.shared.css?v=20260822-topbar-profile-nav"',
    );
    expect(html).toContain('src="./preview.js?v=20260822-topbar-profile-nav"');
    expect(html).toContain('src="./fixtures/p5-pilot.snapshot.js"');
    expect(html).toContain('src="./catalog-ui-adapter.js');
    expect(script).toContain("mediaFocusClosedAt");
    expect(script).toContain("mediaOpenSawPointer");
    expect(script).toContain("Number.NEGATIVE_INFINITY");
    expect(html).toContain("data-shared-stylesheet");
    expect(html).toContain('data-platform-stylesheet="phone"');
    expect(html).toContain('data-platform-stylesheet="tablet"');
    expect(html).toContain('data-platform-stylesheet="pc"');
    expect(html).not.toContain("data-platform-gate");
    expect(pcCss).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(pcCss).toContain("--app-calligraphy-scale: 1");
    expect(pcCss).toContain(".app-scroll.app-pager.is-pager-following");
    expect(pcCss).not.toContain("contain: layout paint");
    expect(sharedCss).not.toContain("content-visibility: hidden");
    expect(sharedCss).toContain(".app-primary-shell.is-overlay-parked");
    expect(script).toContain("is-overlay-parked");
    expect(sharedCss).toContain(".app-inscriptions-layout");
    expect(script).toContain("function parkPrimaryTrackIfIdle");
    expect(script).toContain("endPcPagerFollow(controller)");
    expect(pcCss).toContain("transform: none !important");
    expect(script).toContain("function lockPrimaryShellHeight");
    expect(pcCss).toContain("isolation: auto");
    expect(script).toContain("function anyPagerFollowing");
    expect(script).toContain("function pagerGestureIsLive");
    expect(script).toMatch(
      /function isPcHorizontalWheel[\s\S]*carouselDirectionRatio/,
    );
    expect(script).toMatch(/addEventListener\(\s*["']wheel["']/);
    expect(script).toMatch(
      /function bindQuickActionScrollLock[\s\S]*addEventListener\(\s*["']touchmove["']/,
    );
    expect(script).toContain("function bindPagerPointerTracking");
    expect(script).toContain("pagerPeekMoveOptions");
    expect(script).toContain("function syncBottomNavViewportInset");
    expect(sharedCss).toContain(".app-topics__grid");
    const detailMarkup = html.slice(
      html.indexOf('data-view="detail"'),
      html.indexOf("<!-- TOPICS_PLACEHOLDER_START"),
    );
    expect(detailMarkup).not.toMatch(/收藏|下载|著录|拓片信息|相关碑刻/);
    expect(detailMarkup).not.toMatch(/关注|评论|登录|账号|地图/);
    expect(html).not.toContain("<h2>图像</h2>");
    expect(html).not.toContain("data-detail-gallery");
    expect(html).toContain("data-detail-focus-stage");
    expect(html).toContain("data-detail-media-track");
    expect(html).toContain("data-detail-focus-track");
    expect(html).toContain("data-detail-media-dots");
    expect(html).toContain("data-detail-focus-dots");
    expect(html).not.toContain("data-detail-focus-close");
    expect(html).not.toContain("app-detail-focus__close");
    expect(html).not.toMatch(/>\s*关闭\s*</);
    expect(sharedCss).not.toContain(".app-detail-focus__close");
    expect(sharedCss).toContain(".app-detail__media.is-pager-visible");
    expect(sharedCss).toContain(".app-detail-focus.is-pager-visible");
    expect(sharedCss).toContain("--carousel-x");
    expect(sharedCss).toContain("--image-swipe-duration");
    expect(sharedCss).toContain("--image-swipe-easing");
    expect(script).toContain("carouselSettleMs = 220");
    expect(script).toContain("focusPagerHideMs = 2000");
    expect(script).toContain("function lockCarouselAxis");
    expect(script).toContain("carouselDirectionRatio");
    expect(script).toContain("handleImageCarouselWheel");
    expect(html).not.toMatch(/>\s*上一张\s*</);
    expect(html).not.toMatch(/>\s*下一张\s*</);
    expect(sharedCss).not.toContain(".app-detail__gallery");
    expect(sharedCss).not.toContain(".app-detail__media-controls");
    expect(sharedCss).toContain(".app-detail__media-dots");
    expect(sharedCss).toContain(".app-detail__media-counter");
    expect(sharedCss).not.toContain("margin-top: -16px");
    expect(sharedCss).not.toContain("margin-top: -8px");
    expect(sharedCss).toMatch(/\.app-detail-focus \{[^}]*touch-action: none/);
    expect(sharedCss).toMatch(/\.app-detail-focus \{[^}]*position: absolute/);
    expect(sharedCss).toContain("scale(var(--focus-scale, 1))");
    expect(pcCss).toMatch(/\.app-detail-focus \{[^}]*position: fixed/);
    expect(pcCss).toMatch(/\.app-detail-focus \{[^}]*height: 100dvh/);
    expect(pcCss).toMatch(
      /\.app-detail-focus__image \{[^}]*object-fit: contain/,
    );
    expect(tabletCss).not.toMatch(/\.app-detail-focus \{[^}]*position: fixed/);
    expect(previewCss).not.toMatch(/\.app-detail-focus \{[^}]*position: fixed/);
    expect(sharedCss).toMatch(
      /\.app-detail__media \{[^}]*flex-direction: column/,
    );
    expect(sharedCss).toContain(
      '[data-detail-composition="stacked"] .app-detail__hero',
    );
    expect(sharedCss).toContain("gap: var(--yoyi-space-8)");
    expect(sharedCss).toMatch(
      /\.app-detail__media-dots \{[^}]*position:\s*absolute/,
    );
    expect(sharedCss).toMatch(
      /\.app-detail__media-counter:not\(\[hidden\]\) \{[^}]*opacity: 1/,
    );
    expect(script).not.toContain("Math.min(total, 5)");
    expect(sharedCss).toMatch(
      /\.yoyi-icon-button\.app-setting-toggle \{[^}]*min-width: 56px/,
    );
    expect(sharedCss).toMatch(
      /\.yoyi-icon-button\.app-setting-toggle \{[^}]*padding-inline: var\(--yoyi-space-5\)/,
    );
    expect(sharedCss).toMatch(
      /@media \(max-width: 360px\) \{[\s\S]*?\.app-setting-toggles \{[^}]*gap: var\(--yoyi-space-3\)/,
    );
    expect(tabletCss).toMatch(
      /\.yoyi-icon-button\.app-setting-toggle \{[^}]*min-width: 60px/,
    );
    expect(pcCss).toMatch(
      /\.yoyi-icon-button\.app-setting-toggle \{[^}]*min-width: 48px/,
    );
    expect(pcCss).toMatch(
      /\.yoyi-icon-button\.app-setting-toggle \{[^}]*min-height: 40px/,
    );
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
    expect(calligraphySearch?.getAttribute("placeholder")).not.toBe("筛选书帖");
    expect(html).not.toContain('placeholder="筛选书帖"');
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
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>("[data-pager='primary']")?.classList,
    ).toContain("is-overlay-parked");
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "云峰山题名",
    );
    expect(document.querySelector("[data-inscription-preview]")).toBeNull();
  });

  it("keeps inscription cards horizontal with media beside caption text", () => {
    const phone = renderPreview();
    const card = phone.window.document.querySelector<HTMLElement>(
      '[data-view="inscriptions"] [data-content-id="inscription-yunfeng"]',
    );
    if (!card) throw new Error("inscription card missing");
    const body = card.querySelector(".app-inscription-card__body");
    expect(card.classList.contains("app-inscription-card")).toBe(true);
    expect(card.classList.contains("app-card")).toBe(false);
    expect(card.querySelector("img")?.nextElementSibling).toBe(body);
    expect(
      card.querySelector(".app-inscription-card__title")?.textContent,
    ).toBe("云峰山题名");
    expect(card.querySelector(".app-inscription-card__meta")?.textContent).toBe(
      "碑刻 · 北魏",
    );
    expect(card.querySelector(".app-inscription-card__desc")).toBeNull();
    expect(
      card
        .querySelector(".app-inscription-card__arrow")
        ?.getAttribute("data-icon"),
    ).toBe("next");
    expect(sharedCss).toContain(
      "grid-template-columns: var(--app-inscription-thumb) minmax(0, 1fr) 22px",
    );
    expect(sharedCss).toMatch(
      /\.app-inscription-card img \{[\s\S]*object-fit: cover/,
    );

    card.click();
    expect(
      phone.window.document.querySelector<HTMLElement>('[data-view="detail"]')
        ?.hidden,
    ).toBe(false);
    expect(
      phone.window.document.querySelector("[data-detail-title]")?.textContent,
    ).toBe("云峰山题名");
    expect(
      phone.window.document.querySelector("[data-detail-summary-text]")
        ?.textContent,
    ).toContain("多图碑刻条目");
    expect(
      phone.window.document
        .querySelector("[data-detail-info-panel]")
        ?.contains(
          phone.window.document.querySelector("[data-detail-summary-text]"),
        ),
    ).toBe(false);
  });

  it("keeps the create composer active across the 895 and 896px boundary", async () => {
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
    const textarea =
      document.querySelector<HTMLTextAreaElement>("[data-create-text]");
    document
      .querySelector<HTMLElement>('[data-primary-view="create"]')
      ?.click();
    await waitForAnimationFrames(dom.window, 40);
    if (!textarea) throw new Error("create textarea missing");
    textarea.value = "断点切换中的临时内容";

    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(
      document.querySelector<HTMLElement>('[data-view="create"]')?.classList,
    ).not.toContain("is-pager-active");
    expect(
      document
        .querySelector("[data-browse-nav-group]")
        ?.classList.contains("yoyi-functional-glass"),
    ).toBe(true);

    setViewportWidth(dom, 896);
    expect(document.documentElement.dataset.platform).toBe("pc");
    expect(textarea.value).toBe("断点切换中的临时内容");
    expect(
      document
        .querySelector('[data-primary-view="create"]')
        ?.classList.contains("is-active"),
    ).toBe(true);
    expect(
      document
        .querySelector("[data-bottom-navigation]")
        ?.classList.contains("yoyi-functional-glass"),
    ).toBe(false);

    setViewportWidth(dom, 895);
    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(textarea.value).toBe("断点切换中的临时内容");
    expect(document.querySelectorAll("[data-bottom-navigation]")).toHaveLength(
      1,
    );
  });

  it("keeps the profile view and selected tab across the 895 and 896px boundary", async () => {
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
      .querySelector<HTMLElement>(
        '[data-view="home"] [data-topbar-action="profile"]',
      )
      ?.click();
    await waitForAnimationFrames(dom.window, 40);
    document
      .querySelector<HTMLElement>('[data-profile-tab="history"]')
      ?.click();

    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(
      document.querySelectorAll("[data-primary-view].is-active"),
    ).toHaveLength(0);
    expect(
      document.querySelector<HTMLElement>('[data-profile-panel="history"]')
        ?.hidden,
    ).toBe(false);

    setViewportWidth(dom, 896);
    expect(document.documentElement.dataset.platform).toBe("pc");
    expect(
      document.querySelectorAll("[data-primary-view].is-active"),
    ).toHaveLength(0);
    expect(
      document
        .querySelector('[data-profile-tab="history"]')
        ?.getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      document.querySelectorAll("[data-profile-posts] .app-card"),
    ).toHaveLength(6);

    setViewportWidth(dom, 895);
    expect(document.documentElement.dataset.platform).toBe("tablet");
    expect(
      document.querySelector<HTMLElement>('[data-profile-panel="history"]')
        ?.hidden,
    ).toBe(false);
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

  it("minimizes the glass tab bar on vertical scroll and restores it after idle", async () => {
    const phone = renderPreview({}, { viewportWidth: 844 });
    const phoneDocument = phone.window.document;
    const navigation = phoneDocument.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const discover = phoneDocument.querySelector<HTMLElement>(
      '[data-scroll-key="home:discover"]',
    );
    if (!navigation || !discover) throw new Error("phone navigation missing");

    expect(navigation.querySelector(".yoyi-nav-bubble")).toBeTruthy();
    expect(navigation.dataset.minimizeBehavior).toBe("on-scroll");
    expect(navigation.querySelector(".yoyi-icon-wrap")).toBeTruthy();
    expect(
      navigation
        .querySelector("[data-browse-nav-group]")
        ?.classList.contains("yoyi-functional-glass"),
    ).toBe(true);
    expect(
      navigation
        .querySelector('[data-primary-view="create"]')
        ?.classList.contains("yoyi-functional-glass"),
    ).toBe(true);
    expect(sharedCss).toContain("--app-nav-collapse-duration: 420ms");
    expect(sharedCss).toContain("--app-nav-expand-duration: 520ms");
    expect(sharedCss).toContain(
      "--app-bottom-nav-min-height: clamp(52px, 14.5vw, 60px)",
    );
    expect(sharedCss).toContain(
      "--app-bottom-nav-create-size: var(--app-bottom-nav-min-height)",
    );
    expect(sharedCss).toContain(".app-bottom-navigation__create.is-active");
    expect(sharedCss).not.toMatch(
      /\.app-bottom-navigation__create\.is-active\s*\{[^}]*background:/,
    );
    expect(sharedCss).toMatch(
      /\.is-minimized\s*\{[^}]*display: grid;[^}]*place-items: center;/,
    );
    expect(sharedCss).toMatch(
      /\.is-minimized[\s\S]*\.yoyi-navigation-entry\.is-active\s*\{[^}]*display: grid;[^}]*place-items: center;/,
    );
    expect(previewCss).toContain("max-height: 30rem");
    expect(sharedCss).toContain(".yoyi-icon-wrap");
    expect(script).toContain("navigationExpandDelta");

    discover.scrollTop = 13;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    expect(navigation.dataset.minimized).toBe("true");
    expect(navigation.classList.contains("is-minimized")).toBe(true);
    expect(navigation.querySelectorAll("[data-primary-view]")).toHaveLength(4);

    discover.scrollTop = 4;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    expect(navigation.hasAttribute("data-minimized")).toBe(false);

    discover.scrollTop = 20;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    expect(navigation.dataset.minimized).toBe("true");
    navigation.click();
    expect(navigation.hasAttribute("data-minimized")).toBe(false);

    discover.scrollTop = 40;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    expect(navigation.dataset.minimized).toBe("true");
    discover.scrollTop = 28;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    expect(navigation.dataset.minimized).toBe("true");
    await waitMs(phone.window, 450);
    expect(navigation.hasAttribute("data-minimized")).toBe(false);

    layoutBottomNav(navigation);
    const homeTab = navigation.querySelector<HTMLElement>(
      '[data-primary-view="home"]',
    );
    if (!homeTab) throw new Error("home tab missing");
    swipe(phone.window, homeTab, { x: 50, y: 730 }, { x: 55, y: 730 });
    expect(
      navigation
        .querySelector('[data-primary-view="home"]')
        ?.classList.contains("is-active"),
    ).toBe(true);
    navigation
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    expect(
      navigation
        .querySelector('[data-primary-view="calligraphy"]')
        ?.classList.contains("is-active"),
    ).toBe(true);
    navigation
      .querySelector<HTMLElement>('[data-primary-view="create"]')
      ?.click();
    expect(
      phoneDocument.querySelector<HTMLElement>('[data-view="create"]')?.hidden,
    ).toBe(false);

    const tablet = renderPreview(
      {},
      {
        mobile: false,
        userAgent: tabletUserAgent,
        viewportWidth: 834,
      },
    );
    const tabletNav = tablet.window.document.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const tabletDiscover = tablet.window.document.querySelector<HTMLElement>(
      '[data-scroll-key="home:discover"]',
    );
    if (!tabletNav || !tabletDiscover) {
      throw new Error("tablet navigation missing");
    }
    expect(tabletNav.dataset.minimizeBehavior).toBe("on-scroll");
    tabletDiscover.scrollTop = 40;
    tabletDiscover.dispatchEvent(new tablet.window.Event("scroll"));
    expect(tabletNav.dataset.minimized).toBe("true");
    await waitMs(tablet.window, 450);
    expect(tabletNav.hasAttribute("data-minimized")).toBe(false);

    const pc = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportWidth: 1024,
      },
    );
    const pcNav = pc.window.document.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    if (!pcNav) throw new Error("pc navigation missing");
    expect(pcNav.dataset.minimizeBehavior).toBe("none");
    expect(pcNav.classList.contains("yoyi-functional-glass")).toBe(false);
    const pcScroller =
      pc.window.document.scrollingElement ?? pc.window.document.documentElement;
    pcScroller.scrollTop = 40;
    pcScroller.dispatchEvent(new pc.window.Event("scroll"));
    pc.window.document.dispatchEvent(new pc.window.Event("scroll"));
    expect(pcNav.hasAttribute("data-minimized")).toBe(false);
    expect(pcNav.classList.contains("is-minimized")).toBe(false);
    await waitMs(pc.window, 450);
    expect(pcNav.hasAttribute("data-minimized")).toBe(false);
  });

  it("opens profile from the topbar without adding a bottom-navigation destination", async () => {
    const dom = renderPreview({}, { viewportWidth: 390 });
    const document = dom.window.document;
    const profile = document.querySelector<HTMLElement>(
      '[data-view="home"] [data-topbar-action="profile"]',
    );
    if (!profile) {
      throw new Error("profile topbar entry missing");
    }

    profile.click();
    await waitForAnimationFrames(dom.window, 40);

    expect(
      document.querySelector<HTMLElement>('[data-view="profile"]')?.hidden,
    ).toBe(false);
    expect(document.querySelectorAll("[data-primary-view]")).toHaveLength(4);
    expect(
      document.querySelectorAll(".yoyi-navigation-entry.is-active"),
    ).toHaveLength(0);
    expect(dom.window.history.state).toEqual({
      kind: "primary",
      view: "profile",
    });
    expect(dom.window.sessionStorage.getItem("yoyi.qa-log")).toContain(
      "切换到我的",
    );
  });

  it("repositions the nav bubble after the tab bar finishes expanding", async () => {
    const phone = renderPreview({}, { viewportWidth: 844 });
    const document = phone.window.document;
    const navigation = document.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const discover = document.querySelector<HTMLElement>(
      '[data-scroll-key="home:discover"]',
    );
    const bubble = navigation?.querySelector<HTMLElement>(".yoyi-nav-bubble");
    if (!navigation || !discover || !bubble) {
      throw new Error("phone navigation bubble missing");
    }

    layoutBottomNav(navigation);
    discover.scrollTop = 40;
    discover.dispatchEvent(new phone.window.Event("scroll"));
    expect(navigation.dataset.minimized).toBe("true");
    expect(bubble.style.transform).toBe("");
    expect(bubble.style.width).toBe("");

    await waitMs(phone.window, 450);
    expect(navigation.hasAttribute("data-minimized")).toBe(false);
    expect(navigation.dataset.bubblePending).toBe("true");
    expect(bubble.style.transform).toBe("");

    const transition = new phone.window.Event("transitionend");
    Object.defineProperty(transition, "propertyName", {
      configurable: true,
      value: "width",
    });
    navigation.dispatchEvent(transition);

    expect(navigation.hasAttribute("data-bubble-pending")).toBe(false);
    const homeTab = navigation.querySelector<HTMLElement>(
      '[data-primary-view="home"]',
    );
    if (!homeTab) throw new Error("home tab missing");
    layoutBottomNav(navigation);
    expect(bubble.parentElement).toBe(
      navigation.querySelector("[data-browse-nav-group]"),
    );
    expect(bubble.style.width).toBe("100px");
    expect(bubble.style.height).toBe("52px");
    expect(bubble.style.transform).toContain("translate3d(0px, 4px, 0)");
  });

  it("moves the browse-nav bubble with transform without reparenting", async () => {
    const phone = renderPreview({}, { viewportWidth: 844 });
    const document = phone.window.document;
    const navigation = document.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const bubble = navigation?.querySelector<HTMLElement>(".yoyi-nav-bubble");
    const homeTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="home"]',
    );
    const inscriptionsTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="inscriptions"]',
    );
    const calligraphyTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="calligraphy"]',
    );
    if (
      !navigation ||
      !bubble ||
      !homeTab ||
      !inscriptionsTab ||
      !calligraphyTab
    ) {
      throw new Error("navigation tabs missing");
    }

    layoutBottomNav(navigation);
    homeTab.click();
    await waitForAnimationFrames(phone.window, 40);
    expect(bubble.parentElement).toBe(
      navigation.querySelector("[data-browse-nav-group]"),
    );
    expect(bubble.style.transform).toContain("translate3d(0px, 4px, 0)");

    inscriptionsTab.click();
    await waitForAnimationFrames(phone.window, 40);
    expect(bubble.parentElement).toBe(
      navigation.querySelector("[data-browse-nav-group]"),
    );
    expect(bubble.style.transform).toContain("translate3d(100px, 4px, 0)");

    calligraphyTab.click();
    await waitForAnimationFrames(phone.window, 40);
    expect(bubble.parentElement).toBe(
      navigation.querySelector("[data-browse-nav-group]"),
    );
    expect(bubble.style.transform).toContain("translate3d(200px, 4px, 0)");

    homeTab.click();
    await waitForAnimationFrames(phone.window, 40);
    expect(bubble.parentElement).toBe(
      navigation.querySelector("[data-browse-nav-group]"),
    );
    expect(bubble.style.transform).toContain("translate3d(0px, 4px, 0)");

    phone.window.dispatchEvent(new phone.window.Event("resize"));
    expect(bubble.parentElement).toBe(
      navigation.querySelector("[data-browse-nav-group]"),
    );
  });

  it("keeps the PC rail fixed without bubble, minimize, or drag navigation", async () => {
    const pc = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportWidth: 1024,
      },
    );
    const document = pc.window.document;
    const navigation = document.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    const bubble = navigation?.querySelector<HTMLElement>(".yoyi-nav-bubble");
    const homeTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="home"]',
    );
    const primaryTrack = document.querySelector<HTMLElement>(
      '[data-pager="primary"] [data-pager-track]',
    );
    const inscriptionsTab = navigation?.querySelector<HTMLElement>(
      '[data-primary-view="inscriptions"]',
    );
    if (
      !navigation ||
      !bubble ||
      !homeTab ||
      !primaryTrack ||
      !inscriptionsTab
    ) {
      throw new Error("PC primary pager fixture missing");
    }

    layoutBottomNav(navigation);
    homeTab.click();
    await waitForAnimationFrames(pc.window, 40);
    expect(bubble.style.transform).toBe("");
    expect(bubble.style.width).toBe("");

    dispatchPointer(pc.window, homeTab, "pointerdown", {
      clientX: 50,
      clientY: 320,
      pointerType: "mouse",
      timeStamp: 1_000,
    });
    dispatchPointer(pc.window, homeTab, "pointermove", {
      clientX: 50,
      clientY: 390,
      pointerType: "mouse",
      timeStamp: 1_240,
    });
    expect(bubble.style.transform).toBe("");
    expect(primaryTrack.style.transform).toBe("");
    dispatchPointer(pc.window, homeTab, "pointerup", {
      clientX: 50,
      clientY: 390,
      pointerType: "mouse",
      timeStamp: 1_400,
    });
    expect(
      document.querySelector<HTMLElement>('[data-primary-view="home"]')
        ?.classList,
    ).toContain("is-active");
    expect(primaryTrack.style.transform).toBe("");

    inscriptionsTab.click();
    expect(
      document.querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
        ?.classList,
    ).toContain("is-active");
    await waitForAnimationFrames(pc.window, 40);
    expect(bubble.style.transform).toBe("");
    expect(primaryTrack.style.transform).toBe("");
  });

  it("keeps all PC rail entries visible when a mobile minimized class lingers", () => {
    const pc = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportWidth: 1024,
      },
    );
    const navigation = pc.window.document.querySelector<HTMLElement>(
      "[data-bottom-navigation]",
    );
    if (!navigation) throw new Error("PC rail missing");

    navigation.classList.add("is-minimized");
    const entries = [
      ...navigation.querySelectorAll<HTMLElement>("[data-primary-view]"),
    ];
    expect(entries.map((entry) => entry.dataset.primaryView)).toEqual([
      "home",
      "inscriptions",
      "calligraphy",
      "create",
    ]);
    expect(
      entries.map(
        (entry) => entry.querySelector<HTMLElement>(".yoyi-icon")?.dataset.icon,
      ),
    ).toEqual(["home", "inscriptions", "calligraphy", "create"]);
    expect(
      entries.map(
        (entry) =>
          entry.querySelector<HTMLElement>(".yoyi-fixed-label")?.dataset.label,
      ),
    ).toEqual([
      "nav-home",
      "nav-inscriptions",
      "nav-calligraphy",
      "nav-create",
    ]);
    expect(pcCss).toMatch(
      /\.app-bottom-navigation\.yoyi-mobile-bottom-navigation\.is-minimized[\s\S]*\.yoyi-navigation-entry\s*\{[^}]*display: flex;[^}]*pointer-events: auto;/,
    );
    expect(pcCss).toMatch(
      /\.app-bottom-navigation\.yoyi-mobile-bottom-navigation\.is-minimized[\s\S]*\.yoyi-fixed-label\s*\{[^}]*display: inline-block;/,
    );
  });

  it("keeps home and calligraphy tabs as plain selected indicators", () => {
    const phone = renderPreview({}, { viewportWidth: 844 });
    const document = phone.window.document;
    const homeTabs = document.querySelector<HTMLElement>(".app-primary-tabs");
    const nearby = homeTabs?.querySelector<HTMLElement>(
      '[data-home-feed="nearby"]',
    );
    const categories = document.querySelector<HTMLElement>(".app-categories");
    const ink = categories?.querySelector<HTMLElement>(
      '[data-calligraphy-category="ink"]',
    );
    if (!homeTabs || !nearby || !categories || !ink) {
      throw new Error("plain tabs missing");
    }

    expect(homeTabs.querySelector(".app-tab-bubble")).toBeNull();
    nearby.click();
    expect(nearby.classList.contains("is-selected")).toBe(true);

    expect(categories.querySelector(".app-tab-bubble")).toBeNull();
    ink.click();
    expect(ink.classList.contains("is-selected")).toBe(true);
    expect(sharedCss).toContain(".app-primary-tab.is-selected::after");
    expect(sharedCss).toContain(".app-category.is-selected::after");
  });

  it("uses a muted paper fill and visible border for the selected nav bubble", () => {
    expect(sharedCss).toMatch(
      /\.app-bottom-navigation \.yoyi-nav-bubble\s*\{[^}]*background: var\(--yoyi-color-background-muted\)/,
    );
    expect(sharedCss).toMatch(
      /\.app-bottom-navigation \.yoyi-nav-bubble\s*\{[^}]*border: 1px solid var\(--yoyi-color-border-default\)/,
    );
    expect(script).toContain("nearestBrowseNavEntry");
    expect(script).toContain("function browseNavProgress");
    expect(script).toContain("function cancelNavPointer");
    expect(script).not.toContain("function applyNavPagerProgress");
    expect(script).toContain("function syncTabStripFromPager");
    expect(script).toContain("function positionTabStripProgress");
    expect(html).not.toContain("app-tab-bubble");
    expect(html).toContain('data-pager="primary"');
    expect(sharedCss).toContain("--app-nav-transition-duration: 320ms");
    expect(sharedCss).not.toContain(
      ".app-bottom-navigation .yoyi-navigation-entry > .yoyi-nav-bubble",
    );
    expect(sharedCss).toContain("touch-action: pan-y");
    expect(html.match(/data-browse-nav(?:\s|>)/g)).toHaveLength(3);
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

  it("binds rich catalog detail fields and omits empty sections", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();

    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "山门北壁题记",
    );
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).toBe("碑刻");
    expect(
      document.querySelector<HTMLElement>("[data-detail-kind-period]")?.hidden,
    ).toBe(false);
    expect(
      document.querySelector("[data-detail-aliases-text]")?.textContent,
    ).toContain("山门题名");
    expect(
      document.querySelector("[data-detail-summary-text]")?.textContent,
    ).toContain("山门北壁");
    expect(
      document.querySelector("[data-detail-facts-list]")?.textContent,
    ).toContain("开元八年");
    expect(
      document.querySelector("[data-detail-facts-list]")?.textContent,
    ).toContain("唐");
    expect(
      document.querySelector("[data-detail-description-text]")?.textContent,
    ).toContain("多图");
    expect(
      document.querySelector("[data-detail-sources-list]")?.textContent,
    ).toContain("虚构金石录");
    expect(
      document.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("1/3");
    expect(
      document.querySelector<HTMLElement>("[data-detail-media-index]")?.hidden,
    ).toBe(false);
    expect(
      document.querySelectorAll("[data-detail-media-dots] [data-media-index]")
        .length,
    ).toBe(3);
    expect(
      document.querySelector<HTMLElement>("[data-detail-media-dots]")?.hidden,
    ).toBe(false);
    expect(document.querySelector("[data-detail-gallery]")).toBeNull();
    expect(
      document.querySelector<HTMLElement>("[data-bottom-navigation]")?.hidden,
    ).toBe(true);
    const infoPanel = document.querySelector("[data-detail-info-panel]");
    expect(
      infoPanel?.contains(document.querySelector("[data-detail-title]")),
    ).toBe(true);
    expect(
      infoPanel?.contains(document.querySelector("[data-detail-facts-list]")),
    ).toBe(true);
    expect(
      infoPanel?.contains(
        document.querySelector("[data-detail-description-text]"),
      ),
    ).toBe(false);
    expect(
      infoPanel?.contains(document.querySelector("[data-detail-summary-text]")),
    ).toBe(false);

    document.querySelector<HTMLElement>("[data-detail-back]")?.click();
  });

  it("drops identity tokens that already appear in catalog facts", () => {
    const openDetail = (document: Document, contentId: string) => {
      document
        .querySelector<HTMLElement>(`[data-content-id="${contentId}"]`)
        ?.click();
    };

    const phone = renderPreview();
    const document = phone.window.document;
    openDetail(document, "discover-cliff-gate");
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).toBe("碑刻");
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).not.toContain("唐");
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).not.toContain("开元");
    expect(
      document.querySelector("[data-detail-aliases-text]")?.textContent,
    ).toBe("山门题名 · 北壁旧刻");
    expect(
      document.querySelector("[data-detail-facts-list]")?.textContent,
    ).toContain("唐");
    expect(
      document.querySelector("[data-detail-facts-list]")?.textContent,
    ).toContain("开元八年");

    document.querySelector<HTMLElement>("[data-detail-back]")?.click();
    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    openDetail(document, "calligraphy-autumn");
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).toBe("书帖");
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).not.toContain("宋");
    expect(
      document.querySelector("[data-detail-aliases-text]")?.textContent,
    ).toContain("秋山手札");

    document.querySelector<HTMLElement>("[data-detail-back]")?.click();
    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    openDetail(document, "inscription-yunfeng");
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).toBe("碑刻 · 北魏");
    expect(
      document.querySelector<HTMLElement>("[data-detail-facts]")?.hidden,
    ).toBe(true);

    document.querySelector<HTMLElement>("[data-detail-back]")?.click();
    openDetail(document, "inscription-tianzhu");
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).toBe("碑刻 · 唐");

    const tablet = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: false,
        userAgent: tabletUserAgent,
        viewportHeight: 1024,
        viewportWidth: 768,
      },
    );
    openDetail(tablet.window.document, "discover-cliff-gate");
    expect(
      tablet.window.document.querySelector("[data-detail-kind-period]")
        ?.textContent,
    ).toBe("碑刻");

    const pc = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 900,
        viewportWidth: 1440,
      },
    );
    openDetail(pc.window.document, "discover-cliff-gate");
    expect(
      pc.window.document.querySelector("[data-detail-kind-period]")
        ?.textContent,
    ).toBe("碑刻");
  });

  it("omits optional catalog sections for sparse and no-media details", async () => {
    const dom = renderPreview();
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    document
      .querySelector<HTMLElement>('[data-content-id="inscription-shimen"]')
      ?.click();

    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "石门东侧残刻",
    );
    expect(
      document.querySelector<HTMLElement>("[data-detail-aliases]")?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>("[data-detail-summary]")?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>("[data-detail-facts]")?.hidden,
    ).toBe(true);
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).toBe("碑刻");
    expect(
      document.querySelector<HTMLElement>("[data-detail-description]")?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>("[data-detail-sources]")?.hidden,
    ).toBe(true);
    expect(document.querySelector("[data-detail-gallery]")).toBeNull();
    expect(
      document.querySelector<HTMLElement>("[data-detail-media-index]")?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>("[data-detail-media-dots]")?.hidden,
    ).toBe(true);

    const backButton =
      document.querySelector<HTMLElement>("[data-detail-back]");
    if (!backButton) throw new Error("detail back missing");
    await clickAndWaitForHistory(dom.window, backButton);

    document
      .querySelector<HTMLElement>('[data-content-id="inscription-road"]')
      ?.click();
    expect(
      document.querySelector<HTMLElement>("[data-detail-media-fallback]")
        ?.hidden,
    ).toBe(false);
    expect(
      document
        .querySelector("[data-detail-media-fallback]")
        ?.textContent?.trim(),
    ).toBe("暂无图像");
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
  });

  it("switches detail media, opens focus, and keeps selection across 896px", () => {
    const dom = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 900,
        viewportWidth: 895,
      },
    );
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    document
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();

    expect(
      document.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("1/5");
    expect(document.querySelector("[data-detail-gallery]")).toBeNull();
    expect(
      document.querySelectorAll("[data-detail-media-dots] [data-media-index]")
        .length,
    ).toBe(5);
    document.querySelector<HTMLElement>("[data-detail-media-next]")?.click();
    expect(
      document.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("2/5");
    expect(
      document
        .querySelector("[data-detail-media-dots] .is-active")
        ?.getAttribute("data-media-index"),
    ).toBe("1");
    document.querySelector<HTMLElement>("[data-detail-media-prev]")?.click();
    expect(
      document.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("1/5");
    document.querySelector<HTMLElement>("[data-detail-media-next]")?.click();
    expect(
      document.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("2/5");
    document.querySelector<HTMLElement>("[data-detail-media-open]")?.click();
    expect(
      document.querySelector<HTMLElement>("[data-detail-focus]")?.hidden,
    ).toBe(false);
    expect(
      document.querySelector("[data-detail-focus-index]")?.textContent,
    ).toBe("2 / 5");
    expect(
      document
        .querySelector<HTMLElement>("[data-detail-focus]")
        ?.classList.contains("is-pager-visible"),
    ).toBe(false);
    const focusImage = document.querySelector<HTMLElement>(
      "[data-detail-focus-image]",
    );
    if (!focusImage) throw new Error("focus image missing");
    tap(dom.window, focusImage, { x: 180, y: 180 }, "mouse");
    expect(
      document.querySelector<HTMLElement>("[data-detail-focus]")?.hidden,
    ).toBe(true);
    document.querySelector<HTMLElement>("[data-detail-media-open]")?.click();
    expect(
      document.querySelector<HTMLElement>("[data-detail-focus]")?.hidden,
    ).toBe(true);

    setViewportWidth(dom, 896);
    expect(document.documentElement.dataset.platform).toBe("pc");
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("2/5");
  });

  it("pages detail media with swipe, dots, and arrow keys", () => {
    const phone = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: true,
        userAgent: phoneUserAgent,
        viewportHeight: 844,
        viewportWidth: 390,
      },
    );
    const phoneDocument = phone.window.document;
    phoneDocument
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    phoneDocument
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();
    expect(
      phoneDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("1/5");
    const frame = phoneDocument.querySelector<HTMLElement>(
      "[data-detail-media-open]",
    );
    if (!frame) throw new Error("media frame missing");
    swipe(
      phone.window,
      frame,
      { x: 280, y: 180 },
      { x: 40, y: 180 },
      "touch",
      180,
    );
    expect(
      phoneDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("2/5");
    expect(
      phoneDocument
        .querySelector("[data-detail-media]")
        ?.classList.contains("is-pager-visible"),
    ).toBe(true);
    phoneDocument
      .querySelector<HTMLElement>(
        "[data-detail-media-dots] [data-media-index='0']",
      )
      ?.click();
    expect(
      phoneDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("1/5");

    const pc = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 900,
        viewportWidth: 1280,
      },
    );
    const pcDocument = pc.window.document;
    pcDocument
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    pcDocument
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();
    pc.window.dispatchEvent(
      new pc.window.KeyboardEvent("keydown", { key: "ArrowRight" }),
    );
    expect(
      pcDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("2/5");
    pcDocument.querySelector<HTMLElement>("[data-detail-media-open]")?.click();
    const focus = pcDocument.querySelector<HTMLElement>("[data-detail-focus]");
    const stage = pcDocument.querySelector<HTMLElement>(
      "[data-detail-focus-stage]",
    );
    if (!focus || !stage) throw new Error("focus viewer missing");
    expect(focus.hidden).toBe(false);
    swipe(
      pc.window,
      stage,
      { x: 280, y: 180 },
      { x: 40, y: 180 },
      "mouse",
      180,
    );
    expect(
      pcDocument.querySelector("[data-detail-focus-index]")?.textContent,
    ).toBe("3 / 5");
    expect(focus.hidden).toBe(false);
    expect(focus.classList.contains("is-pager-visible")).toBe(true);
  });

  it("keeps prototype galleries for 3, 5, and 7 images across feeds", () => {
    const synthetic = renderPreview();
    const syntheticDocument = synthetic.window.document;
    syntheticDocument
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    syntheticDocument
      .querySelector<HTMLElement>('[data-content-id="calligraphy-pine"]')
      ?.click();
    expect(
      syntheticDocument.querySelector("[data-detail-title]")?.textContent,
    ).toBe("松窗帖");
    expect(
      syntheticDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("1/7");
    expect(
      syntheticDocument.querySelectorAll(
        "[data-detail-media-dots] [data-media-index]",
      ).length,
    ).toBe(7);
    expect(
      syntheticDocument.querySelector<HTMLElement>("[data-detail-media-index]")
        ?.hidden,
    ).toBe(false);
    expect(
      syntheticDocument
        .querySelector("[data-detail-media]")
        ?.classList.contains("is-pager-visible"),
    ).toBe(false);

    const p5 = renderP5Preview();
    const p5Document = p5.window.document;
    const expectGallery = (scope: string, contentId: string, total: number) => {
      p5Document
        .querySelector<HTMLElement>(`${scope} [data-content-id="${contentId}"]`)
        ?.click();
      expect(
        p5Document.querySelector("[data-detail-media-index]")?.textContent,
      ).toBe(`1/${total}`);
      expect(
        p5Document.querySelectorAll(
          "[data-detail-media-dots] [data-media-index]",
        ).length,
      ).toBe(total);
      p5Document.querySelector<HTMLElement>("[data-detail-back]")?.click();
    };
    expectGallery('[data-feed-grid="discover"]', "p5-record-01", 5);
    p5Document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    expectGallery('[data-view="inscriptions"]', "p5-record-01", 5);
    expectGallery('[data-view="inscriptions"]', "p5-record-03", 7);
    p5Document.querySelector<HTMLElement>('[data-home-feed="nearby"]')?.click();
    expectGallery('[data-feed-grid="nearby"]', "p5-record-02", 3);
  });

  it("locks image swipe direction and commits Mac trackpad paging once", async () => {
    const phone = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: true,
        userAgent: phoneUserAgent,
        viewportHeight: 844,
        viewportWidth: 390,
      },
    );
    const phoneDocument = phone.window.document;
    phoneDocument
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    phoneDocument
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();
    const frame = phoneDocument.querySelector<HTMLElement>(
      "[data-detail-media-open]",
    );
    if (!frame) throw new Error("media frame missing");
    swipe(
      phone.window,
      frame,
      { x: 180, y: 80 },
      { x: 190, y: 260 },
      "touch",
      180,
    );
    expect(
      phoneDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("1/5");

    const pc = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 900,
        viewportWidth: 1280,
      },
    );
    const pcDocument = pc.window.document;
    pcDocument
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    pcDocument
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();
    const stage = pcDocument.querySelector<HTMLElement>(
      ".app-detail__media-stage",
    );
    if (!stage) throw new Error("media stage missing");
    dispatchWheel(pc.window, stage, { deltaX: 0, deltaY: 160 });
    expect(
      pcDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("1/5");
    dispatchWheel(pc.window, stage, { deltaX: 80, deltaY: 0 });
    dispatchWheel(pc.window, stage, { deltaX: 500, deltaY: 0 });
    dispatchWheel(pc.window, stage, { deltaX: 400, deltaY: 0 });
    await new Promise<void>((resolve) => {
      pc.window.setTimeout(() => resolve(), 60);
    });
    expect(
      pcDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("2/5");
    dispatchWheel(pc.window, stage, { deltaX: 500, deltaY: 0 });
    expect(
      pcDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("2/5");
    await new Promise<void>((resolve) => {
      pc.window.setTimeout(() => resolve(), 220);
    });
    dispatchWheel(pc.window, stage, { deltaX: 600, deltaY: 0 });
    await new Promise<void>((resolve) => {
      pc.window.setTimeout(() => resolve(), 60);
    });
    expect(
      pcDocument.querySelector("[data-detail-media-index]")?.textContent,
    ).toBe("3/5");
  });

  it("shows the phone focus page hint while swiping and keeps the last page", () => {
    const dom = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: true,
        userAgent: phoneUserAgent,
        viewportHeight: 844,
        viewportWidth: 390,
      },
    );
    const window = dom.window;
    const document = window.document;
    const hideCallbacks: Array<() => void> = [];
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    window.setTimeout = ((
      handler: TimerHandler,
      delay?: number,
      ...args: unknown[]
    ) => {
      if (delay === 2000 && typeof handler === "function") {
        const callback = handler as (...fnArgs: unknown[]) => void;
        hideCallbacks.splice(0, hideCallbacks.length, () => callback(...args));
        return -1;
      }
      return nativeSetTimeout(handler, delay, ...args);
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id === -1) {
        hideCallbacks.length = 0;
        return;
      }
      nativeClearTimeout(id);
    }) as typeof window.clearTimeout;

    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    document
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();
    document.querySelector<HTMLElement>("[data-detail-media-open]")?.click();

    const focus = document.querySelector<HTMLElement>("[data-detail-focus]");
    const stage = document.querySelector<HTMLElement>(
      "[data-detail-focus-stage]",
    );
    if (!focus || !stage) throw new Error("focus viewer missing");
    expect(focus.classList.contains("is-pager-visible")).toBe(false);
    expect(
      document.querySelector("[data-detail-focus-index]")?.textContent,
    ).toBe("1 / 5");

    swipe(window, stage, { x: 280, y: 180 }, { x: 40, y: 180 }, "touch", 180);
    expect(
      document.querySelector("[data-detail-focus-index]")?.textContent,
    ).toBe("2 / 5");
    expect(focus.classList.contains("is-pager-visible")).toBe(true);
    hideCallbacks.at(-1)?.();
    expect(focus.classList.contains("is-pager-visible")).toBe(false);
    swipe(window, stage, { x: 280, y: 180 }, { x: 40, y: 180 }, "touch", 180);
    swipe(window, stage, { x: 280, y: 180 }, { x: 40, y: 180 }, "touch", 180);
    swipe(window, stage, { x: 280, y: 180 }, { x: 40, y: 180 }, "touch", 180);
    expect(
      document.querySelector("[data-detail-focus-index]")?.textContent,
    ).toBe("5 / 5");
    swipe(window, stage, { x: 280, y: 180 }, { x: 40, y: 180 }, "touch", 180);
    expect(
      document.querySelector("[data-detail-focus-index]")?.textContent,
    ).toBe("5 / 5");
    expect(focus.classList.contains("is-pager-visible")).toBe(true);
    const image = document.querySelector<HTMLElement>(
      "[data-detail-focus-image]",
    );
    if (!image) throw new Error("focus image missing");
    tap(window, image, { x: 180, y: 180 }, "touch");
    expect(focus.hidden).toBe(true);
  });

  it("zooms the focus image without transforming the page", () => {
    const dom = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 900,
        viewportWidth: 1280,
      },
    );
    const { document } = dom.window;
    const detailScroll = document.querySelector<HTMLElement>(
      '[data-scroll-view="detail"]',
    );
    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    document
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();
    if (detailScroll) detailScroll.scrollTop = 120;
    document.querySelector<HTMLElement>("[data-detail-media-open]")?.click();

    const focus = document.querySelector<HTMLElement>("[data-detail-focus]");
    const image = document.querySelector<HTMLElement>(
      "[data-detail-focus-image]",
    );
    const app = document.querySelector<HTMLElement>("[data-mobile-app]");
    const detail = document.querySelector<HTMLElement>('[data-view="detail"]');
    if (!focus || !image) throw new Error("focus viewer missing");
    expect(focus.classList.contains("is-pager-visible")).toBe(false);

    const wheel = new dom.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 180,
      ctrlKey: true,
      deltaMode: 0,
      deltaX: 0,
      deltaY: -120,
    });
    expect(focus.dispatchEvent(wheel)).toBe(false);
    expect(
      Number(image.style.getPropertyValue("--focus-scale")),
    ).toBeGreaterThan(1);
    expect(app?.style.transform).toBe("");
    expect(detail?.style.transform).toBe("");
    expect(document.documentElement.style.transform).toBe("");
    expect(document.body.style.transform).toBe("");

    document.querySelector<HTMLElement>("[data-detail-focus-next]")?.click();
    expect(Number(image.style.getPropertyValue("--focus-scale"))).toBe(1);
    expect(
      document.querySelector("[data-detail-focus-index]")?.textContent,
    ).toBe("2 / 5");
    expect(focus.classList.contains("is-pager-visible")).toBe(true);

    tap(dom.window, image, { x: 200, y: 180 }, "mouse");
    expect(focus.hidden).toBe(true);
    expect(Number(image.style.getPropertyValue("--focus-scale"))).toBe(1);
    expect(detailScroll?.scrollTop).toBe(120);

    const mediaOpen = document.querySelector<HTMLElement>(
      "[data-detail-media-open]",
    );
    if (!mediaOpen) throw new Error("detail media open missing");
    tap(dom.window, mediaOpen, { x: 200, y: 180 }, "mouse");
    mediaOpen.click();
    expect(focus.hidden).toBe(false);
    dom.window.dispatchEvent(
      new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
    );
    expect(focus.hidden).toBe(true);
  });

  it("fits a tall PC focus image inside the viewport without cropping", () => {
    const dom = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 827,
        viewportWidth: 1512,
      },
    );
    const { document } = dom.window;
    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    document
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();
    expect(
      document
        .querySelector('[data-view="detail"]')
        ?.getAttribute("data-detail-composition"),
    ).toBe("expanded-split");

    const stage = document.querySelector<HTMLElement>(
      "[data-detail-focus-stage]",
    );
    const image = document.querySelector<HTMLImageElement>(
      "[data-detail-focus-image]",
    );
    if (!stage || !image) throw new Error("focus viewer missing");

    const available = { width: 1448, height: 719 };
    stage.getBoundingClientRect = () =>
      ({
        x: 32,
        y: 76,
        left: 32,
        top: 76,
        width: available.width,
        height: available.height,
        right: 32 + available.width,
        bottom: 76 + available.height,
        toJSON() {
          return this;
        },
      }) as DOMRect;
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 3000,
    });

    document.querySelector<HTMLElement>("[data-detail-media-open]")?.click();
    image.dispatchEvent(new dom.window.Event("load"));

    const width = Number.parseFloat(image.style.width);
    const height = Number.parseFloat(image.style.height);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(available.width);
    expect(height).toBeLessThanOrEqual(available.height);
    expect(width / height).toBeCloseTo(1000 / 3000, 5);
    expect(
      Math.max(width / available.width, height / available.height),
    ).toBeCloseTo(1, 5);
    expect(Number(image.style.getPropertyValue("--focus-scale") || "1")).toBe(
      1,
    );

    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 520,
    });
    image.dispatchEvent(new dom.window.Event("load"));
    const smallWidth = Number.parseFloat(image.style.width);
    const smallHeight = Number.parseFloat(image.style.height);
    expect(smallWidth).toBeGreaterThan(360);
    expect(smallHeight).toBeGreaterThan(520);
    expect(smallWidth).toBeLessThanOrEqual(available.width);
    expect(smallHeight).toBeLessThanOrEqual(available.height);
    expect(smallWidth / smallHeight).toBeCloseTo(360 / 520, 5);
    expect(
      Math.max(smallWidth / available.width, smallHeight / available.height),
    ).toBeCloseTo(1, 5);

    tap(dom.window, image, { x: 200, y: 180 }, "mouse");
    expect(image.style.width).toBe("");
    expect(image.style.height).toBe("");
  });

  it("fits the focus image to the phone viewport", () => {
    const dom = renderPreview(
      {},
      {
        maxTouchPoints: 5,
        mobile: true,
        userAgent: phoneUserAgent,
        viewportHeight: 844,
        viewportWidth: 390,
      },
    );
    const { document } = dom.window;
    document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();
    const stage = document.querySelector<HTMLElement>(
      "[data-detail-focus-stage]",
    );
    const image = document.querySelector<HTMLImageElement>(
      "[data-detail-focus-image]",
    );
    if (!stage || !image) throw new Error("focus image missing");
    const available = { width: 366, height: 720 };
    stage.getBoundingClientRect = () =>
      ({
        x: 12,
        y: 56,
        left: 12,
        top: 56,
        width: available.width,
        height: available.height,
        right: 12 + available.width,
        bottom: 56 + available.height,
        toJSON() {
          return this;
        },
      }) as DOMRect;
    Object.defineProperty(image, "naturalWidth", {
      configurable: true,
      value: 360,
    });
    Object.defineProperty(image, "naturalHeight", {
      configurable: true,
      value: 520,
    });
    document.querySelector<HTMLElement>("[data-detail-media-open]")?.click();
    image.dispatchEvent(new dom.window.Event("load"));
    const width = Number.parseFloat(image.style.width);
    const height = Number.parseFloat(image.style.height);
    expect(width).toBeGreaterThan(360);
    expect(height).toBeGreaterThan(520);
    expect(width).toBeLessThanOrEqual(available.width);
    expect(height).toBeLessThanOrEqual(available.height);
    expect(width / height).toBeCloseTo(360 / 520, 5);
    expect(
      Math.max(width / available.width, height / available.height),
    ).toBeCloseTo(1, 5);
  });

  it("shows media-level image failure without replacing the catalog page", () => {
    const dom = renderPreview();
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();
    const image = document.querySelector<HTMLImageElement>(
      "[data-detail-image]",
    );
    if (!image) throw new Error("detail image missing");
    image.dispatchEvent(new dom.window.Event("error"));
    expect(
      document.querySelector<HTMLElement>("[data-detail-media-error]")?.hidden,
    ).toBe(false);
    expect(
      document.querySelector("[data-detail-media-error]")?.textContent?.trim(),
    ).toBe("图像暂时无法加载");
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "山门北壁题记",
    );
    expect(
      document.querySelector<HTMLElement>('[data-view="detail"]')?.hidden,
    ).toBe(false);
  });

  it("renders loading, not-found, and unavailable catalog states from hash", () => {
    const loading = renderPreview({}, {}, (window) => {
      window.history.replaceState(null, "", "#detail-d08-loading");
    });
    expect(
      loading.window.document.querySelector<HTMLElement>(
        '[data-detail-panel="loading"]',
      )?.hidden,
    ).toBe(false);
    expect(
      loading.window.document
        .querySelector('[data-view="detail"]')
        ?.getAttribute("data-detail-state"),
    ).toBe("loading");

    const missing = renderPreview({}, {}, (window) => {
      window.history.replaceState(null, "", "#detail-d09-not-found");
    });
    expect(
      missing.window.document.querySelector<HTMLElement>(
        '[data-detail-panel="not-found"]',
      )?.hidden,
    ).toBe(false);
    expect(missing.window.document.body.textContent).toContain(
      "未找到这项资料",
    );

    const unavailable = renderPreview({}, {}, (window) => {
      window.history.replaceState(null, "", "#detail-d10-unavailable");
    });
    expect(
      unavailable.window.document.querySelector<HTMLElement>(
        '[data-detail-panel="unavailable"]',
      )?.hidden,
    ).toBe(false);
    expect(unavailable.window.document.body.textContent).toContain(
      "暂时无法加载资料",
    );
  });

  it("restores inscription, calligraphy, and home context after leaving detail", async () => {
    const dom = renderPreview();
    const document = dom.window.document;

    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();
    const inscriptions = document.querySelector<HTMLElement>(
      '[data-scroll-view="inscriptions"]',
    );
    if (!inscriptions) throw new Error("inscriptions scroll missing");
    inscriptions.scrollTop = 88;
    inscriptions.dispatchEvent(new dom.window.Event("scroll"));
    document
      .querySelector<HTMLElement>('[data-content-id="inscription-yunfeng"]')
      ?.click();
    const back = document.querySelector<HTMLElement>("[data-detail-back]");
    if (!back) throw new Error("detail back missing");
    await clickAndWaitForHistory(dom.window, back);
    expect(
      document.querySelector<HTMLElement>('[data-view="inscriptions"]')?.hidden,
    ).toBe(false);
    expect(inscriptions.scrollTop).toBe(88);

    document
      .querySelector<HTMLElement>('[data-primary-view="calligraphy"]')
      ?.click();
    document
      .querySelector<HTMLElement>('[data-calligraphy-category="ink"]')
      ?.click();
    const inkPage = document.querySelector<HTMLElement>(
      '[data-scroll-key="calligraphy:ink"]',
    );
    if (!inkPage) throw new Error("calligraphy ink page missing");
    inkPage.scrollTop = 64;
    inkPage.dispatchEvent(new dom.window.Event("scroll"));
    document
      .querySelector<HTMLElement>('[data-content-id="calligraphy-autumn"]')
      ?.click();
    expect(
      document.querySelector("[data-detail-kind-period]")?.textContent,
    ).toContain("书帖");
    await clickAndWaitForHistory(dom.window, back);
    expect(
      document.querySelector<HTMLElement>('[data-view="calligraphy"]')?.hidden,
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>('[data-calligraphy-category="ink"]')
        ?.classList,
    ).toContain("is-selected");
    expect(inkPage.scrollTop).toBe(64);
  });

  it("assigns stacked and split catalog compositions from platform and orientation", () => {
    const phonePortrait = renderPreview();
    phonePortrait.window.document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();
    expect(
      phonePortrait.window.document
        .querySelector("[data-view='detail']")
        ?.getAttribute("data-detail-composition"),
    ).toBe("stacked");

    const phoneLandscape = renderPreview(
      {},
      { viewportHeight: 390, viewportWidth: 844 },
    );
    phoneLandscape.window.document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();
    expect(
      phoneLandscape.window.document
        .querySelector("[data-view='detail']")
        ?.getAttribute("data-detail-composition"),
    ).toBe("compact-stacked");

    const tabletPortrait = renderPreview(
      {},
      {
        mobile: false,
        userAgent: tabletUserAgent,
        viewportHeight: 1112,
        viewportWidth: 834,
      },
    );
    tabletPortrait.window.document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();
    expect(
      tabletPortrait.window.document.documentElement.dataset.platform,
    ).toBe("tablet");
    expect(
      tabletPortrait.window.document
        .querySelector("[data-view='detail']")
        ?.getAttribute("data-detail-composition"),
    ).toBe("wide-stacked");

    const tabletLandscape = renderPreview(
      {},
      {
        mobile: false,
        userAgent: tabletUserAgent,
        viewportHeight: 834,
        viewportWidth: 1194,
      },
    );
    tabletLandscape.window.document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();
    expect(
      tabletLandscape.window.document
        .querySelector("[data-view='detail']")
        ?.getAttribute("data-detail-composition"),
    ).toBe("compact-split");

    const desktop = renderPreview(
      {},
      {
        maxTouchPoints: 0,
        mobile: false,
        userAgent: desktopUserAgent,
        viewportHeight: 900,
        viewportWidth: 1440,
      },
    );
    desktop.window.document
      .querySelector<HTMLElement>('[data-content-id="discover-cliff-gate"]')
      ?.click();
    expect(
      desktop.window.document
        .querySelector("[data-view='detail']")
        ?.getAttribute("data-detail-composition"),
    ).toBe("expanded-split");

    setViewportSize(desktop, 895, 900);
    expect(desktop.window.document.documentElement.dataset.platform).toBe(
      "tablet",
    );
    expect(
      desktop.window.document
        .querySelector("[data-view='detail']")
        ?.getAttribute("data-detail-composition"),
    ).toBe("wide-stacked");
    expect(
      desktop.window.document.querySelector<HTMLElement>('[data-view="detail"]')
        ?.hidden,
    ).toBe(false);
  });

  it("pins the complete approved P5 snapshot without internal workflow data", () => {
    const dom = renderP5Preview();
    const snapshot = (
      dom.window as unknown as {
        YOYI_P5_PILOT_SNAPSHOT: {
          records: Array<Record<string, unknown>>;
          version: string;
        };
      }
    ).YOYI_P5_PILOT_SNAPSHOT;
    const records = snapshot.records;

    expect(snapshot.version).toBe("p5-pilot-snapshot-v1");
    expect(records).toHaveLength(28);
    expect(records.map((record) => record.id)).toEqual(
      Array.from(
        { length: 28 },
        (_, index) => `p5-record-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(records.map((record) => record.title)).toEqual(expectedP5Titles);
    expect(records[13]?.aliases).toEqual(["西夏碑"]);
    expect(records[24]?.aliases).toEqual(["汉故雁门太守鲜于君碑"]);

    const recordsWithDescriptions = records.filter(
      (record) => "description" in record,
    );
    expect(recordsWithDescriptions).toHaveLength(expectedP5Descriptions.size);
    for (const record of records) {
      const expectedDescription = expectedP5Descriptions.get(String(record.id));
      if (expectedDescription) {
        expect(record.description).toBe(expectedDescription);
      } else {
        expect(record).not.toHaveProperty("description");
      }

      expect(record.media).toEqual([]);
      expect(record).not.toHaveProperty("representativeMedia");
      expect(Object.keys(record).sort()).toEqual(
        Object.keys(record)
          .filter((key) =>
            [
              "aliases",
              "description",
              "id",
              "kind",
              "media",
              "periodLabel",
              "prototypeFacts",
              "title",
            ].includes(key),
          )
          .sort(),
      );

      const facts = (record.prototypeFacts ?? {}) as Record<string, string>;
      expect(
        Object.keys(facts).every((key) =>
          [
            "county",
            "currentCustodian",
            "currentLocation",
            "dateText",
            "dynasty",
            "prefecture",
            "province",
          ].includes(key),
        ),
      ).toBe(true);
      const expectedPeriodLabel = [facts.dynasty, facts.dateText]
        .filter(Boolean)
        .join(" · ");
      if (expectedPeriodLabel) {
        expect(record.periodLabel).toBe(expectedPeriodLabel);
      } else {
        expect(record).not.toHaveProperty("periodLabel");
      }
    }

    expect(p5PilotFixture).toContain("T02 PROTOTYPE ONLY");
    expect(p5PilotFixture).toContain("NON-AUTHORITATIVE");
    expect(p5PilotFixture).toContain("NON-PRODUCTION");
    expect(p5PilotFixture).toContain(
      "adb139588625a9447aadfa242efbd1bfd35de00befa99338ba265b7a9511d3ed",
    );
    expect(p5PilotFixture).not.toMatch(
      /sourceId|catalogImportId|ownerNote|ResearchRecordId|CandidateFactId|EvidenceId|ReviewDecision|import-operation|\b(?:VALUE|UNSUPPLIED|UNKNOWN|CLEAR)\b/,
    );
    expect(p5PilotFixture).not.toContain("design-system/assets/demo");
  });

  it("selects P5 only for the exact query and marks the active dataset", () => {
    const synthetic = renderPreview();
    expect(synthetic.window.document.documentElement.dataset.dataset).toBe(
      "synthetic",
    );
    expect(synthetic.window.document.body.textContent).toContain(
      "山门北壁题记",
    );

    const unknown = renderPreview(
      {},
      {},
      undefined,
      "http://localhost/docs/prototypes/mobile-preview/?dataset=P5",
    );
    expect(unknown.window.document.documentElement.dataset.dataset).toBe(
      "synthetic",
    );
    expect(unknown.window.document.body.textContent).not.toContain(
      "北魏永平四年郑道昭浮丘子题字",
    );

    const p5 = renderP5Preview();
    const document = p5.window.document;
    expect(document.documentElement.dataset.dataset).toBe("p5");
    const discoverCards = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-feed-grid="discover"] [data-open-detail]',
      ),
    ];
    const inscriptionCards = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-view="inscriptions"] .app-inscription-card',
      ),
    ];
    expect(discoverCards).toHaveLength(28);
    expect(inscriptionCards).toHaveLength(28);
    expect(
      discoverCards.map(
        (card) => card.querySelector(".app-card__title")?.textContent,
      ),
    ).toEqual(expectedP5Titles);
    expect(
      inscriptionCards.map(
        (card) =>
          card.querySelector(".app-inscription-card__title")?.textContent,
      ),
    ).toEqual(expectedP5Titles);
    expect(
      discoverCards.every(
        (card) => card.querySelector(".app-card__description") === null,
      ),
    ).toBe(true);
    expect(
      inscriptionCards.every(
        (card) => card.querySelector(".app-inscription-card__desc") === null,
      ),
    ).toBe(true);
    expect(
      discoverCards.every(
        (card) =>
          card.querySelector("img") &&
          card.dataset.image?.includes("design-system/assets/demo") &&
          card.dataset.mediaOrigin === "prototype-demo",
      ),
    ).toBe(true);
    expect(
      inscriptionCards.every(
        (card) =>
          card.querySelector("img") &&
          card.dataset.image?.includes("design-system/assets/demo") &&
          card.dataset.mediaOrigin === "prototype-demo",
      ),
    ).toBe(true);
    expect(
      discoverCards.every((card) =>
        card
          .querySelector("img")
          ?.getAttribute("alt")
          ?.startsWith("虚拟测试图，与真实记录无对应关系："),
      ),
    ).toBe(true);
    expect(
      document.querySelectorAll('[data-feed-grid="nearby"] [data-open-detail]'),
    ).toHaveLength(38);
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-feed-grid="nearby"] [data-open-detail]',
        ),
      ].some((card) => card.dataset.contentId?.startsWith("p5-record-")),
    ).toBe(true);
    expect(document.body.textContent).toContain("秋山札");
    expect(document.body.textContent).toContain("城北石壁");
    expect(document.body.textContent).toContain("新疆维吾尔自治区博物馆");
    expect(document.body.textContent).not.toContain("当前快照没有书帖");
    expect(
      document.querySelectorAll(
        '[data-pager="calligraphy"] [data-pager-page="all"] [data-category]',
      ).length,
    ).toBeGreaterThan(0);
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-pager="calligraphy"] [data-pager-page="all"] [data-category]',
        ),
      ].some((card) => card.dataset.category === "ink"),
    ).toBe(true);
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-pager="calligraphy"] [data-pager-page="all"] [data-category]',
        ),
      ].some((card) => card.dataset.category === "rubbing"),
    ).toBe(true);
    expect(
      document.querySelectorAll("[data-topics-grid] .app-topic-card"),
    ).not.toHaveLength(0);
    expect(
      [
        ...document.querySelectorAll(
          "[data-topics-grid] .app-topic-card__title",
        ),
      ].map((node) => node.textContent),
    ).toContain("唐");
  });

  it("adapts missing fields and unsafe media onto the current UI DTO", () => {
    const adapter = (
      renderPreview().window as unknown as {
        YOYI_CATALOG_UI_ADAPTER: {
          adaptRecord: (
            raw: unknown,
            options?: { demoCards?: Array<{ image: string }> },
          ) => {
            description?: string;
            media: Array<{
              height?: number;
              origin: string;
              src: string;
              width?: number;
            }>;
            title: string;
          };
          demoImageIntrinsics: (
            src: unknown,
          ) => { height: number; width: number } | null;
          displayText: (value: unknown) => string;
          isUsableMediaSrc: (src: unknown) => boolean;
        };
      }
    ).YOYI_CATALOG_UI_ADAPTER;
    expect(adapter.displayText(null)).toBe("");
    expect(adapter.displayText("undefined")).toBe("");
    expect(adapter.isUsableMediaSrc("javascript:alert(1)")).toBe(false);
    const adapted = adapter.adaptRecord(
      {
        id: "adapter-empty",
        title: null,
        description: null,
        kind: "inscription",
        media: [{ src: "javascript:alert(1)" }],
      },
      { demoCards: [] },
    );
    expect(adapted.title).toBe("条目 adapter-empty");
    expect(adapted.description).toBeUndefined();
    expect(adapted.media[0]?.origin).toBe("missing");
    expect(adapted.media[0]?.src).toBe("");
    expect(
      adapter.demoImageIntrinsics(
        "../../design-system/assets/demo/stone-detail.svg",
      ),
    ).toEqual({ width: 360, height: 610 });
    const demoAdapted = adapter.adaptRecord(
      {
        id: "adapter-demo-ratio",
        title: "比例卡",
        kind: "inscription",
        media: [],
      },
      {
        demoCards: [
          {
            image: "../../design-system/assets/demo/inscription-rubbing.svg",
          },
        ],
      },
    );
    expect(demoAdapted.media[0]?.width).toBe(600);
    expect(demoAdapted.media[0]?.height).toBe(420);
  });

  it("opens P5 nearby and dynasty topics into the current detail and topic column", async () => {
    const dom = renderP5Preview();
    const document = dom.window.document;
    document.querySelector<HTMLElement>('[data-home-feed="nearby"]')?.click();
    const nearbyCard = document.querySelector<HTMLElement>(
      '[data-feed-grid="nearby"] [data-content-id="p5-record-02"]',
    );
    nearbyCard?.click();
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "唐张礼臣墓志盖",
    );
    expect(
      document.querySelector("[data-detail-facts-list]")?.textContent,
    ).toContain("新疆维吾尔自治区博物馆");

    const back = document.querySelector<HTMLElement>("[data-detail-back]");
    if (!back) throw new Error("detail back missing");
    await clickAndWaitForHistory(dom.window, back);
    document.querySelector<HTMLElement>('[data-home-feed="topics"]')?.click();
    const tangTopic = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-topics-grid] [data-open-topic]",
      ),
    ].find(
      (card) =>
        card.querySelector(".app-topic-card__title")?.textContent === "唐",
    );
    tangTopic?.click();
    expect(
      document.querySelector("[data-topic-column-heading]")?.textContent,
    ).toBe("唐");
    expect(
      document.querySelector(
        '[data-topic-column-body] [data-content-id="p5-record-02"]',
      )?.textContent,
    ).toContain("唐张礼臣墓志盖");
  });

  it("searches P5 titles and aliases and renders rich and sparse details with virtual test media", async () => {
    const dom = renderP5Preview();
    const document = dom.window.document;
    document
      .querySelector<HTMLElement>('[data-primary-view="inscriptions"]')
      ?.click();

    const search = document.querySelector<HTMLInputElement>(
      "[data-inscription-search]",
    );
    if (!search) throw new Error("inscription search missing");
    search.value = "毕昇";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    expect(
      [
        ...document.querySelectorAll<HTMLElement>(
          '[data-view="inscriptions"] .app-inscription-card',
        ),
      ]
        .filter((card) => !card.hidden)
        .map((card) => card.dataset.contentId),
    ).toEqual(["p5-record-27"]);

    search.value = "西夏碑";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    const visibleCards = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-view="inscriptions"] .app-inscription-card',
      ),
    ].filter((card) => !card.hidden);
    expect(visibleCards.map((card) => card.dataset.contentId)).toEqual([
      "p5-record-14",
    ]);

    search.value = "";
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    document
      .querySelector<HTMLElement>(
        '[data-view="inscriptions"] [data-content-id="p5-record-27"]',
      )
      ?.click();
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "北宋毕昇墓碑",
    );
    expect(
      document.querySelector("[data-detail-description-text]")?.textContent,
    ).toBe(expectedP5Descriptions.get("p5-record-27"));
    expect(
      document
        .querySelector("[data-detail-info-panel]")
        ?.contains(document.querySelector("[data-detail-description-text]")),
    ).toBe(false);
    expect(document.querySelector("[data-detail-title]")?.textContent).not.toBe(
      expectedP5Descriptions.get("p5-record-27"),
    );
    expect(
      document.querySelector("[data-detail-facts-list]")?.textContent,
    ).toContain("皇祐四年（1052年）");
    expect(
      document.querySelector("[data-detail-facts-list]")?.textContent,
    ).toContain("湖北省 · 黄冈市 · 英山县");
    expect(
      document.querySelector<HTMLElement>("[data-detail-media-fallback]")
        ?.hidden,
    ).toBe(true);
    expect(
      document.querySelector("[data-detail-image]")?.getAttribute("src"),
    ).toContain("design-system/assets/demo");
    expect(
      document.querySelector("[data-detail-image]")?.getAttribute("alt"),
    ).toBe("虚拟测试图，与真实记录无对应关系：北宋毕昇墓碑");

    const back = document.querySelector<HTMLElement>("[data-detail-back]");
    if (!back) throw new Error("detail back missing");
    await clickAndWaitForHistory(dom.window, back);
    document
      .querySelector<HTMLElement>(
        '[data-view="inscriptions"] [data-content-id="p5-record-01"]',
      )
      ?.click();
    expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
      "北魏永平四年郑道昭浮丘子题字",
    );
    expect(
      document.querySelector<HTMLElement>("[data-detail-description]")?.hidden,
    ).toBe(true);
    expect(
      document.querySelector<HTMLElement>("[data-detail-aliases]")?.hidden,
    ).toBe(true);
    expect(
      document.querySelector("[data-detail-facts-list]")?.textContent,
    ).not.toMatch(/未知|暂无/);
  });

  it("preserves the P5 query through detail history, back, and direct reload", async () => {
    const dom = renderP5Preview();
    const document = dom.window.document;
    expect(dom.window.location.search).toBe("?dataset=p5");
    expect(dom.window.location.hash).toBe("");

    document
      .querySelector<HTMLElement>(
        '[data-feed-grid="discover"] [data-content-id="p5-record-23"]',
      )
      ?.click();
    expect(dom.window.location.search).toBe("?dataset=p5");
    expect(dom.window.location.hash).toBe("#detail-p5-record-23");

    const back = document.querySelector<HTMLElement>("[data-detail-back]");
    if (!back) throw new Error("detail back missing");
    await clickAndWaitForHistory(dom.window, back);
    expect(dom.window.location.search).toBe("?dataset=p5");
    expect(dom.window.location.hash).toBe("");
    expect(document.documentElement.dataset.dataset).toBe("p5");

    const reloaded = renderP5Preview({}, undefined, "#detail-p5-record-23");
    expect(reloaded.window.location.search).toBe("?dataset=p5");
    expect(reloaded.window.location.hash).toBe("#detail-p5-record-23");
    expect(
      reloaded.window.document.querySelector("[data-detail-title]")
        ?.textContent,
    ).toBe("北魏永平四年郑文公上碑刻石");
  });

  it("keeps P5 detail responsive on phone, tablet, and desktop", () => {
    const cases = [
      {
        device: { viewportHeight: 844, viewportWidth: 390 },
        platform: "phone",
        composition: "stacked",
      },
      {
        device: {
          mobile: false,
          userAgent: tabletUserAgent,
          viewportHeight: 1112,
          viewportWidth: 834,
        },
        platform: "tablet",
        composition: "wide-stacked",
      },
      {
        device: {
          maxTouchPoints: 0,
          mobile: false,
          userAgent: desktopUserAgent,
          viewportHeight: 900,
          viewportWidth: 1440,
        },
        platform: "pc",
        composition: "expanded-split",
      },
    ];

    for (const testCase of cases) {
      const dom = renderP5Preview(testCase.device);
      const document = dom.window.document;
      document
        .querySelector<HTMLElement>(
          '[data-feed-grid="discover"] [data-content-id="p5-record-23"]',
        )
        ?.click();
      expect(document.documentElement.dataset.platform).toBe(testCase.platform);
      expect(
        document
          .querySelector("[data-view='detail']")
          ?.getAttribute("data-detail-composition"),
      ).toBe(testCase.composition);
      expect(document.querySelector("[data-detail-title]")?.textContent).toBe(
        "北魏永平四年郑文公上碑刻石",
      );
      expect(dom.window.location.search).toBe("?dataset=p5");
    }
  });
});
