// @vitest-environment jsdom
/// <reference lib="dom" />

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeShell } from "./home-shell";
import {
  homeLayoutPreferenceKey,
  themePreferenceKey,
} from "./presentation-preferences";

let container: HTMLDivElement;
let root: Root;

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.getAttribute("aria-label") === label,
  );

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.dataset.homeLayout = "double";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("T02-authoritative production Home shell", () => {
  it("keeps only the approved presentation controls in full-screen Settings", () => {
    act(() => root.render(<HomeShell>Catalog</HomeShell>));
    const trigger = button("打开设置");
    act(() => trigger?.click());

    const dialog = document.querySelector('[role="dialog"]');
    const back = button("返回");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("设置");
    expect(dialog?.textContent).not.toMatch(/调试|日志|搜索|附近|专题/);
    expect(document.activeElement).toBe(back);
    expect(document.querySelector("nav")?.hidden).toBe(true);

    const theme = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((item) => item.getAttribute("aria-label")?.startsWith("切换主题"));
    const layout = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((item) => item.getAttribute("aria-label")?.startsWith("切换布局"));
    act(() => theme?.click());
    act(() => layout?.click());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.homeLayout).toBe("single");
    expect(window.localStorage.getItem(themePreferenceKey)).toBe("light");
    expect(window.localStorage.getItem(homeLayoutPreferenceKey)).toBe("single");

    act(() => back?.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("restores Settings focus with Escape and survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    act(() => root.render(<HomeShell>Catalog</HomeShell>));
    const trigger = button("打开设置");
    act(() => trigger?.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    act(() =>
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Escape",
        }),
      ),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("preserves 12px minimize, 24px restore, idle restore, and active-tap restore", () => {
    act(() => root.render(<HomeShell>Catalog</HomeShell>));
    const scroll = document.querySelector<HTMLElement>("[data-home-scroll]")!;
    const navigation = document.querySelector<HTMLElement>("nav")!;

    scroll.scrollTop = 13;
    act(() => scroll.dispatchEvent(new Event("scroll")));
    expect(navigation.dataset.minimized).toBe("true");

    act(() => button("首页")?.click());
    expect(navigation.hasAttribute("data-minimized")).toBe(false);

    scroll.scrollTop = 50;
    act(() => scroll.dispatchEvent(new Event("scroll")));
    expect(navigation.dataset.minimized).toBe("true");
    act(() => vi.advanceTimersByTime(400));
    expect(navigation.hasAttribute("data-minimized")).toBe(false);

    scroll.scrollTop = 75;
    act(() => scroll.dispatchEvent(new Event("scroll")));
    expect(navigation.dataset.minimized).toBe("true");
    scroll.scrollTop = 51;
    act(() => scroll.dispatchEvent(new Event("scroll")));
    expect(navigation.hasAttribute("data-minimized")).toBe(false);
  });
});
