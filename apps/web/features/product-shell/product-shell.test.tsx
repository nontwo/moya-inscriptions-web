// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductShell } from "./product-shell";
import { primaryHistoryState, settingsHistoryState } from "./product-history";

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

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const renderProductShell = () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() =>
    root.render(
      <ProductShell
        calligraphy={<p>calligraphy content</p>}
        home={<p>home content</p>}
        initialPlatform="phone"
        inscriptions={<p>inscriptions content</p>}
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

  it("owns Settings history, inertness, Back restoration, and opener focus", async () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const { container } = renderProductShell();
    await act(async () => vi.runAllTimers());
    const opener = buttonByLabel(container, "打开设置");

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

      click(buttonByLabel(container, "打开设置"));
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

    click(buttonByLabel(container, "打开设置"));
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
