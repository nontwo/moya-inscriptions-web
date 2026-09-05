// @vitest-environment jsdom

import { act, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductShell, useProductShell } from "./product-shell";
import {
  detailHistoryState,
  parseProductHistoryState,
  primaryHistoryState,
  settingsHistoryState,
  topicHistoryState,
  viewerHistoryState,
} from "./product-history";

import type { ReactNode } from "react";
import type { ProductShellContextValue } from "./product-shell";

const createMediaQueryList = (matches = false): MediaQueryList =>
  ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as MediaQueryList;

const mountedRoots: ReturnType<typeof createRoot>[] = [];
let observedProductShell: ProductShellContextValue | null = null;

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ProductShellObserver = () => {
  observedProductShell = useProductShell();
  return null;
};

const SettingsRequester = () => {
  const { requestSettings } = useProductShell();
  return (
    <button
      aria-label="从用户页打开设置"
      data-settings-request-test=""
      onClick={(event) => requestSettings(event.currentTarget)}
      type="button"
    >
      Settings
    </button>
  );
};

const renderProductShell = (
  home: ReactNode = <p>home content</p>,
  options: {
    readonly primaryUtility?: ReactNode;
  } = {},
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() =>
    root.render(
      <ProductShell
        calligraphy={<p>calligraphy content</p>}
        home={home}
        initialPlatform="phone"
        inscriptions={<p>inscriptions content</p>}
        primaryUtility={<SettingsRequester />}
        {...options}
      />,
    ),
  );
  return { container };
};

const TopicOpener = () => {
  const { activeTopicId, openTopic, registerTopicOpener } = useProductShell();
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (activeTopicId !== null && openerRef.current !== null) {
      registerTopicOpener(activeTopicId, openerRef.current);
    }
  }, [activeTopicId, registerTopicOpener]);
  return (
    <button
      ref={openerRef}
      type="button"
      data-topic-test-opener=""
      onClick={(event) => openTopic("topic-one", event.currentTarget, 164)}
    >
      Open topic
    </button>
  );
};

const renderTopicShell = () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() =>
    root.render(
      <ProductShell
        calligraphy={<p>calligraphy content</p>}
        home={<TopicOpener />}
        primaryUtility={<SettingsRequester />}
        initialPlatform="phone"
        inscriptions={<p>inscriptions content</p>}
        renderTopicOverlay={({ backButtonRef, onClose, topicId }) => (
          <section aria-label={`Topic ${topicId}`} role="dialog">
            <button
              ref={backButtonRef}
              type="button"
              aria-label="返回专题"
              onClick={onClose}
            >
              Back
            </button>
          </section>
        )}
      />,
    ),
  );
  return { container };
};

const CatalogOpener = () => {
  const { openCatalog } = useProductShell();
  return (
    <article data-catalog-id="catalog-one">
      <button
        type="button"
        data-open-catalog=""
        onClick={(event) => openCatalog("catalog-one", event.currentTarget)}
      >
        Open catalog
      </button>
    </article>
  );
};

const ViewerControls = () => {
  const { activeViewerMediaId, changeViewerMedia, closeViewer, openViewer } =
    useProductShell();
  return (
    <>
      <button
        data-open-viewer-test=""
        onClick={() => openViewer("media-one")}
        type="button"
      >
        Open viewer
      </button>
      <button
        data-change-viewer-test=""
        onClick={() => changeViewerMedia("media-two")}
        type="button"
      >
        Change viewer media
      </button>
      <button data-close-viewer-test="" onClick={closeViewer} type="button">
        Close viewer
      </button>
      <span data-viewer-media-test="">{activeViewerMediaId ?? "closed"}</span>
    </>
  );
};

const renderDetailShell = () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() =>
    root.render(
      <ProductShell
        calligraphy={<p>calligraphy content</p>}
        home={<CatalogOpener />}
        primaryUtility={<SettingsRequester />}
        initialPlatform="phone"
        inscriptions={<p>inscriptions content</p>}
        renderDetailOverlay={({
          backButtonRef,
          catalogId,
          initialScrollTop,
          onClose,
          onScrollTopChange,
        }) => (
          <section aria-label={`Detail ${catalogId}`} role="dialog">
            <button
              ref={backButtonRef}
              aria-label="返回资料"
              onClick={onClose}
              type="button"
            >
              Back
            </button>
            <button
              data-detail-scroll-test=""
              onClick={() => onScrollTopChange(73)}
              type="button"
            >
              Scroll detail
            </button>
            <span data-detail-initial-scroll="">{initialScrollTop}</span>
            <ViewerControls />
          </section>
        )}
      />,
    ),
  );
  return { container };
};

const buttonByLabel = (
  container: ParentNode,
  label: string | RegExp,
): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => {
      const accessibleLabel = candidate.getAttribute("aria-label") ?? "";
      return typeof label === "string"
        ? accessibleLabel === label
        : label.test(accessibleLabel);
    },
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button ${String(label)}`);
  }
  return button;
};

const dialog = (container: ParentNode) =>
  container.querySelector<HTMLElement>('[role="dialog"][aria-label="设置"]');

const click = (button: HTMLButtonElement) => {
  act(() => button.click());
};

describe("ProductShell", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/dev/t02p");
    document.documentElement.dataset.yoyiBoot = "pending";
    document.documentElement.dataset.yoyiBootStarted = String(
      performance.now() - 720,
    );
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => createMediaQueryList()),
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: null,
    });
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: (id: number) => window.clearTimeout(id),
    });
  });

  afterEach(() => {
    for (const root of mountedRoots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.replaceChildren();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.style.overflow = "";
    document.documentElement.removeAttribute("data-effective-theme");
    observedProductShell = null;
  });

  it("keeps all destinations mounted and commits a tap through one history replacement", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());
    replaceState.mockClear();

    click(buttonByLabel(container, "碑刻"));
    await act(async () => vi.runAllTimers());

    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(
      primaryHistoryState("inscriptions"),
      "",
      "/dev/t02p",
    );
    expect(
      container.querySelectorAll("[data-primary-destination]"),
    ).toHaveLength(3);
    expect(
      container
        .querySelector('[data-primary-destination="home"]')
        ?.hasAttribute("hidden"),
    ).toBe(true);
    expect(
      container
        .querySelector('[data-primary-destination="inscriptions"]')
        ?.hasAttribute("hidden"),
    ).toBe(false);
  });

  it("preserves navigation, icon, and label node identity across destination, Settings, and orientation updates", async () => {
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());
    const navigation = container.querySelector<HTMLElement>(
      "[data-primary-navigation]",
    )!;
    const icons = Array.from(
      navigation.querySelectorAll("[data-primary-navigation-inline-icon]"),
    );
    const labels = Array.from(
      navigation.querySelectorAll("[data-primary-navigation-inline-label]"),
    );

    click(buttonByLabel(container, "碑刻"));
    await act(async () => vi.runAllTimers());
    expect(container.querySelector("[data-primary-navigation]")).toBe(
      navigation,
    );
    expect(
      Array.from(
        navigation.querySelectorAll("[data-primary-navigation-inline-icon]"),
      ),
    ).toEqual(icons);
    expect(
      Array.from(
        navigation.querySelectorAll("[data-primary-navigation-inline-label]"),
      ),
    ).toEqual(labels);

    click(buttonByLabel(container, "从用户页打开设置"));
    await act(async () => vi.runAllTimers());
    expect(container.querySelector("[data-primary-navigation]")).toBe(
      navigation,
    );

    act(() => window.dispatchEvent(new Event("orientationchange")));
    expect(container.querySelector("[data-primary-navigation]")).toBe(
      navigation,
    );
  });

  it("minimizes only after downward intent and expands after the canonical idle period", async () => {
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());
    const shell = container.querySelector<HTMLElement>("[data-product-shell]")!;
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;

    act(() => {
      home.scrollTop = 6;
      home.dispatchEvent(new Event("scroll"));
    });
    expect(shell.dataset.primaryNavigationMinimized).toBe("false");

    act(() => {
      home.scrollTop = 18;
      home.dispatchEvent(new Event("scroll"));
    });
    expect(shell.dataset.primaryNavigationMinimized).toBe("true");
    expect(
      container
        .querySelector("[data-primary-navigation]")
        ?.getAttribute("data-minimized"),
    ).toBe("true");

    act(() => vi.advanceTimersByTime(399));
    expect(shell.dataset.primaryNavigationMinimized).toBe("true");
    act(() => vi.advanceTimersByTime(1));
    expect(shell.dataset.primaryNavigationMinimized).toBe("false");
  });

  it("keeps keyboard focus on a visible current item when navigation minimizes", async () => {
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;
    buttonByLabel(container, "碑刻").focus();

    act(() => {
      home.scrollTop = 12;
      home.dispatchEvent(new Event("scroll"));
    });

    expect(document.activeElement).toBe(buttonByLabel(container, "首页"));
    expect(
      container
        .querySelector("[data-product-shell]")
        ?.getAttribute("data-primary-navigation-minimized"),
    ).toBe("true");
  });

  it("registers the active Home panel without copying scrollTop and ignores stale cleanup", async () => {
    const { container } = renderProductShell(<ProductShellObserver />);
    await act(async () => vi.runAllTimers());
    const shell = container.querySelector<HTMLElement>("[data-product-shell]")!;
    const discover = document.createElement("section");
    const nearby = document.createElement("section");
    for (const element of [discover, nearby]) {
      Object.defineProperty(element, "scrollHeight", {
        configurable: true,
        value: 1_000,
      });
      Object.defineProperty(element, "clientHeight", {
        configurable: true,
        value: 400,
      });
    }
    discover.scrollTop = 240;
    nearby.scrollTop = 130;

    let unregisterDiscover: () => void = () => undefined;
    let unregisterNearby: () => void = () => undefined;
    act(() => {
      unregisterDiscover =
        observedProductShell!.registerActiveHomeScrollElement(discover);
    });
    expect(observedProductShell!.readActiveScrollTop()).toBe(240);
    act(() => {
      unregisterNearby =
        observedProductShell!.registerActiveHomeScrollElement(nearby);
    });

    expect(nearby.scrollTop).toBe(130);
    act(() => unregisterDiscover());
    expect(observedProductShell!.readActiveScrollTop()).toBe(130);

    act(() => {
      discover.scrollTop = 300;
      discover.dispatchEvent(new Event("scroll"));
    });
    expect(shell.dataset.primaryNavigationMinimized).toBe("false");
    act(() => {
      nearby.scrollTop = 136;
      nearby.dispatchEvent(new Event("scroll"));
    });
    expect(shell.dataset.primaryNavigationMinimized).toBe("false");
    act(() => {
      observedProductShell!.restoreActiveScrollTop(175);
      vi.runAllTimers();
    });
    expect(nearby.scrollTop).toBe(175);
    expect(discover.scrollTop).toBe(300);

    act(() => unregisterNearby());
  });

  it("retries scroll restoration while a hidden view rebuilds its scroll range", async () => {
    renderProductShell(<ProductShellObserver />);
    await act(async () => vi.runAllTimers());
    const scroller = document.createElement("section");
    let rangeAvailable = false;
    Object.defineProperties(scroller, {
      clientHeight: {
        configurable: true,
        value: 400,
      },
      scrollHeight: {
        configurable: true,
        get: () => (rangeAvailable ? 1_000 : 400),
      },
    });
    let unregister: () => void = () => undefined;
    act(() => {
      unregister =
        observedProductShell!.registerActiveHomeScrollElement(scroller);
    });

    act(() => {
      observedProductShell!.restoreActiveScrollTop(175);
      vi.advanceTimersToNextTimer();
      vi.advanceTimersToNextTimer();
    });
    expect(scroller.scrollTop).toBe(0);

    rangeAvailable = true;
    act(() => vi.runAllTimers());
    expect(scroller.scrollTop).toBe(175);

    act(() => unregister());
  });

  it("expands the minimized current control without changing destination or history", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());
    replaceState.mockClear();
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;

    act(() => {
      home.scrollTop = 12;
      home.dispatchEvent(new Event("scroll"));
    });
    expect(
      container
        .querySelector("[data-product-shell]")
        ?.getAttribute("data-primary-navigation-minimized"),
    ).toBe("true");

    click(buttonByLabel(container, "首页"));
    expect(
      container
        .querySelector("[data-product-shell]")
        ?.getAttribute("data-primary-navigation-minimized"),
    ).toBe("false");
    expect(replaceState).not.toHaveBeenCalled();
    expect(document.activeElement === document.body).toBe(true);
  });

  it("owns Settings history, inertness, Back restoration, and opener focus", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());
    const opener = buttonByLabel(container, "从用户页打开设置");

    click(opener);
    await act(async () => vi.runAllTimers());

    expect(pushState).toHaveBeenCalledWith(
      settingsHistoryState("home"),
      "",
      "/dev/t02p#settings",
    );
    expect(dialog(container)).not.toBeNull();
    expect(
      container
        .querySelector("[data-product-primary-layer]")
        ?.hasAttribute("inert"),
    ).toBe(true);
    expect(document.activeElement).toBe(buttonByLabel(container, "返回"));

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: primaryHistoryState("home") }),
      ),
    );
    await act(async () => vi.runAllTimers());

    expect(dialog(container)).toBeNull();
    expect(document.activeElement).toBe(opener);

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: settingsHistoryState("home"),
        }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(dialog(container)).not.toBeNull();
  });

  it("has no external Settings entry while preserving the owned Settings seam", async () => {
    const { container } = renderProductShell(<p>home content</p>, {
      primaryUtility: <SettingsRequester />,
    });
    await act(async () => vi.runAllTimers());

    expect(container.querySelector("[data-open-settings]")).toBeNull();
    const opener = buttonByLabel(container, "从用户页打开设置");
    opener.focus();
    click(opener);
    await act(async () => vi.runAllTimers());

    expect(dialog(container)).not.toBeNull();
    expect(
      container
        .querySelector("[data-product-primary-layer]")
        ?.hasAttribute("inert"),
    ).toBe(true);

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: primaryHistoryState("home") }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(dialog(container)).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("closes owned Settings with Escape and restores its exact opener", async () => {
    const back = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    const { container } = renderProductShell(<p>home content</p>, {
      primaryUtility: <SettingsRequester />,
    });
    await act(async () => vi.runAllTimers());
    const opener = buttonByLabel(container, "从用户页打开设置");
    opener.focus();
    click(opener);
    await act(async () => vi.runAllTimers());

    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    act(() => document.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(back).toHaveBeenCalledOnce();

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: primaryHistoryState("home") }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(dialog(container)).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("owns Topic history, inertness, navigation identity, Back/Forward, scroll, and focus", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { container } = renderTopicShell();
    await act(async () => vi.runAllTimers());
    replaceState.mockClear();
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;
    Object.defineProperty(home, "scrollHeight", {
      configurable: true,
      value: 1_000,
    });
    Object.defineProperty(home, "clientHeight", {
      configurable: true,
      value: 400,
    });
    home.scrollTop = 164;
    const opener = container.querySelector<HTMLButtonElement>(
      "[data-topic-test-opener]",
    )!;
    const navigation = container.querySelector<HTMLElement>(
      "[data-primary-navigation]",
    )!;

    click(opener);
    await act(async () => vi.runAllTimers());

    expect(pushState).toHaveBeenCalledWith(
      topicHistoryState("topic-one", 164),
      "",
      "/dev/t02p#topic-topic-one",
    );
    expect(replaceState).toHaveBeenCalledWith(
      primaryHistoryState("home", 164, "topic-one"),
      "",
      "/dev/t02p",
    );
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      container
        .querySelector("[data-product-primary-layer]")
        ?.hasAttribute("inert"),
    ).toBe(true);
    expect(container.querySelector("[data-primary-navigation]")).toBe(
      navigation,
    );
    expect(
      navigation
        .closest("[data-primary-navigation-layer]")
        ?.hasAttribute("hidden"),
    ).toBe(true);
    expect(document.activeElement).toBe(buttonByLabel(container, "返回专题"));

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: primaryHistoryState("home", 164, "topic-one"),
        }),
      ),
    );
    await act(async () => vi.runAllTimers());

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(home.scrollTop).toBe(164);
    expect(document.activeElement).toBe(opener);
    expect(container.querySelector("[data-primary-navigation]")).toBe(
      navigation,
    );

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: topicHistoryState("topic-one", 164),
        }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      container
        .querySelector("[data-product-shell]")
        ?.getAttribute("data-active-destination"),
    ).toBe("home");
  });

  it("restores the recorded Topic source scroll after a Topic-detail reload and Back", async () => {
    window.history.replaceState(
      topicHistoryState("topic-one", 164),
      "",
      "/dev/t02p#topic-topic-one",
    );
    const { container } = renderTopicShell();
    await act(async () => vi.runAllTimers());
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;
    Object.defineProperty(home, "scrollHeight", {
      configurable: true,
      value: 1_000,
    });
    Object.defineProperty(home, "clientHeight", {
      configurable: true,
      value: 400,
    });
    home.scrollTop = 0;

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: primaryHistoryState("home", 164, "topic-one"),
        }),
      ),
    );
    await act(async () => vi.runAllTimers());

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(home.scrollTop).toBe(164);
    expect(document.activeElement).toBe(
      container.querySelector("[data-topic-test-opener]"),
    );
  });

  it("owns Detail history, source/detail scroll, opener focus, and overlay exclusion", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { container } = renderDetailShell();
    await act(async () => vi.runAllTimers());
    replaceState.mockClear();
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;
    Object.defineProperty(home, "scrollHeight", {
      configurable: true,
      value: 1_000,
    });
    Object.defineProperty(home, "clientHeight", {
      configurable: true,
      value: 400,
    });
    home.scrollTop = 146;
    const opener = container.querySelector<HTMLButtonElement>(
      "[data-open-catalog]",
    )!;

    click(opener);
    await act(async () => vi.runAllTimers());

    expect(replaceState).toHaveBeenCalledWith(
      primaryHistoryState("home", 146, undefined, "catalog-one"),
      "",
      "/dev/t02p",
    );
    expect(pushState).toHaveBeenCalledWith(
      detailHistoryState("catalog-one", "home", 146),
      "",
      "/dev/t02p?catalogId=catalog-one#detail",
    );
    expect(
      container.querySelector('[aria-label="Detail catalog-one"]'),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-product-primary-layer]")
        ?.hasAttribute("inert"),
    ).toBe(true);
    expect(document.activeElement).toBe(buttonByLabel(container, "返回资料"));

    click(
      container.querySelector<HTMLButtonElement>("[data-detail-scroll-test]")!,
    );
    await act(async () => vi.runAllTimers());
    expect(parseProductHistoryState(window.history.state)).toEqual(
      detailHistoryState("catalog-one", "home", 146, 73),
    );

    click(buttonByLabel(container, "从用户页打开设置"));
    expect(dialog(container)).toBeNull();

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: primaryHistoryState("home", 146, undefined, "catalog-one"),
        }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(
      container.querySelector('[aria-label="Detail catalog-one"]'),
    ).toBeNull();
    expect(home.scrollTop).toBe(146);
    expect(document.activeElement).toBe(opener);

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: detailHistoryState("catalog-one", "home", 146, 73),
        }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(
      container.querySelector("[data-detail-initial-scroll]")?.textContent,
    ).toBe("73");
  });

  it("owns one Viewer history layer and replaces media navigation in place", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const replaceState = vi.spyOn(window.history, "replaceState");
    const { container } = renderDetailShell();
    await act(async () => vi.runAllTimers());
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;
    Object.defineProperties(home, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
    });
    home.scrollTop = 146;
    click(container.querySelector<HTMLButtonElement>("[data-open-catalog]")!);
    await act(async () => vi.runAllTimers());
    click(
      container.querySelector<HTMLButtonElement>("[data-detail-scroll-test]")!,
    );
    await act(async () => vi.runAllTimers());
    pushState.mockClear();
    replaceState.mockClear();

    click(
      container.querySelector<HTMLButtonElement>("[data-open-viewer-test]")!,
    );

    expect(replaceState).toHaveBeenCalledWith(
      detailHistoryState("catalog-one", "home", 146, 73),
      "",
      "/dev/t02p?catalogId=catalog-one#detail",
    );
    expect(pushState).toHaveBeenCalledWith(
      viewerHistoryState("catalog-one", "media-one", "home", 146, 73),
      "",
      "/dev/t02p?catalogId=catalog-one&image=media-one#viewer",
    );
    expect(
      container.querySelector("[data-viewer-media-test]")?.textContent,
    ).toBe("media-one");
    expect(
      container
        .querySelector("[data-product-shell]")
        ?.getAttribute("data-viewer-open"),
    ).toBe("true");

    replaceState.mockClear();
    click(
      container.querySelector<HTMLButtonElement>("[data-change-viewer-test]")!,
    );
    expect(replaceState).toHaveBeenCalledWith(
      viewerHistoryState("catalog-one", "media-two", "home", 146, 73),
      "",
      "/dev/t02p?catalogId=catalog-one&image=media-two#viewer",
    );
    expect(pushState).toHaveBeenCalledOnce();

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: detailHistoryState("catalog-one", "home", 146, 73),
        }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(
      container.querySelector("[data-viewer-media-test]")?.textContent,
    ).toBe("closed");
    expect(
      container.querySelector('[aria-label="Detail catalog-one"]'),
    ).not.toBeNull();

    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", {
          state: viewerHistoryState(
            "catalog-one",
            "media-two",
            "home",
            146,
            73,
          ),
        }),
      ),
    );
    await act(async () => vi.runAllTimers());
    expect(
      container.querySelector("[data-viewer-media-test]")?.textContent,
    ).toBe("media-two");
  });

  it.each(["home", "inscriptions", "calligraphy"] as const)(
    "opens Settings from the committed %s destination",
    async (destination) => {
      const pushState = vi.spyOn(window.history, "pushState");
      const { container } = renderProductShell();
      await act(async () => vi.runAllTimers());

      if (destination !== "home") {
        click(
          buttonByLabel(
            container,
            destination === "inscriptions" ? "碑刻" : "书帖",
          ),
        );
        await act(async () => vi.runAllTimers());
      }
      pushState.mockClear();

      click(buttonByLabel(container, "从用户页打开设置"));
      await act(async () => vi.runAllTimers());

      expect(pushState).toHaveBeenCalledOnce();
      expect(pushState).toHaveBeenCalledWith(
        settingsHistoryState(destination),
        "",
        "/dev/t02p#settings",
      );
      expect(dialog(container)).not.toBeNull();
      expect(
        container.querySelectorAll("[data-primary-destination]"),
      ).toHaveLength(3);
    },
  );

  it("updates the effective theme when the system preference changes", async () => {
    let systemIsDark = false;
    let notifySystemThemeChange = () => {};
    const media = {
      addEventListener: (_type: string, listener: () => void) => {
        notifySystemThemeChange = listener;
      },
      get matches() {
        return systemIsDark;
      },
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => media),
    });

    renderProductShell();
    await act(async () => vi.runAllTimers());
    expect(document.documentElement.dataset.effectiveTheme).toBe("light");

    systemIsDark = true;
    act(() => notifySystemThemeChange());
    expect(document.documentElement.dataset.effectiveTheme).toBe("dark");
  });

  it("loads, applies, cycles, and persists canonical preferences", async () => {
    window.localStorage.setItem("yoyi.theme-preference", "dark");
    window.localStorage.setItem("yoyi.home-feed-layout", "single");
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());

    expect(
      container
        .querySelector("[data-product-shell]")
        ?.getAttribute("data-theme-preference"),
    ).toBe("dark");
    expect(
      container
        .querySelector("[data-product-shell]")
        ?.getAttribute("data-feed-layout"),
    ).toBe("single");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.homeLayout).toBe("single");

    click(buttonByLabel(container, "从用户页打开设置"));
    click(buttonByLabel(container, /切换主题/));
    click(buttonByLabel(container, /切换布局/));

    expect(window.localStorage.getItem("yoyi.theme-preference")).toBe("system");
    expect(window.localStorage.getItem("yoyi.home-feed-layout")).toBe("double");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.dataset.homeLayout).toBe("double");
  });

  it("restores independent phone scroll positions without unmounting content", async () => {
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());
    const home = container.querySelector<HTMLElement>(
      '[data-primary-destination="home"]',
    )!;
    const inscriptions = container.querySelector<HTMLElement>(
      '[data-primary-destination="inscriptions"]',
    )!;
    for (const element of [home, inscriptions]) {
      Object.defineProperty(element, "scrollHeight", {
        configurable: true,
        value: 1_000,
      });
      Object.defineProperty(element, "clientHeight", {
        configurable: true,
        value: 400,
      });
    }

    home.scrollTop = 240;
    click(buttonByLabel(container, "碑刻"));
    await act(async () => vi.runAllTimers());
    inscriptions.scrollTop = 130;
    click(buttonByLabel(container, "首页"));
    await act(async () => vi.runAllTimers());

    expect(home.scrollTop).toBe(240);
    expect(inscriptions.scrollTop).toBe(130);
  });
});
