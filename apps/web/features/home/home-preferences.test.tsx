// @vitest-environment jsdom
/// <reference lib="dom" />

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomePreferences } from "./home-preferences";
import {
  homeLayoutPreferenceKey,
  presentationPreferenceBootstrap,
  themePreferenceKey,
} from "./presentation-preferences";

let container: HTMLDivElement;
let root: Root;

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
    item.getAttribute("aria-label")?.startsWith(label),
  );

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-home-layout");
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
  vi.restoreAllMocks();
});

describe("Home presentation preferences", () => {
  it("opens the focused full-screen Settings surface and returns focus", () => {
    act(() => root.render(<HomePreferences />));
    const trigger = button("打开设置");
    expect(trigger).toBeTruthy();

    act(() => trigger?.click());
    const dialog = document.querySelector('[role="dialog"]');
    const back = button("返回");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("设置");
    expect(dialog?.textContent).not.toMatch(/调试|日志|搜索|附近配置|专题配置/);
    expect(document.activeElement).toBe(back);

    act(() => back?.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("cycles and persists only the approved theme and layout values", () => {
    act(() => root.render(<HomePreferences />));
    act(() => button("打开设置")?.click());

    const theme = button("切换主题");
    const layout = button("切换布局");
    expect(theme?.dataset.themeMode).toBe("system");
    expect(layout?.dataset.layoutMode).toBe("double");

    act(() => theme?.click());
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem(themePreferenceKey)).toBe("light");

    act(() => layout?.click());
    expect(document.documentElement.dataset.homeLayout).toBe("single");
    expect(window.localStorage.getItem(homeLayoutPreferenceKey)).toBe("single");
  });

  it("keeps focus inside Settings while it is open", () => {
    act(() => root.render(<HomePreferences />));
    act(() => button("打开设置")?.click());
    const dialog = document.querySelector('[role="dialog"]');
    const back = button("返回");
    const layout = button("切换布局");

    back?.focus();
    act(() =>
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "Tab",
          shiftKey: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(layout);

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
  });

  it("applies validated preferences before paint and rejects invalid values", () => {
    window.localStorage.setItem(themePreferenceKey, "dark");
    window.localStorage.setItem(homeLayoutPreferenceKey, "single");
    Function(presentationPreferenceBootstrap)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.homeLayout).toBe("single");

    window.localStorage.setItem(themePreferenceKey, "sepia");
    window.localStorage.setItem(homeLayoutPreferenceKey, "triple");
    Function(presentationPreferenceBootstrap)();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.dataset.homeLayout).toBe("double");
  });

  it("continues with session state when browser storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });

    act(() => root.render(<HomePreferences />));
    act(() => button("打开设置")?.click());
    act(() => button("切换主题")?.click());
    act(() => button("切换布局")?.click());

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.homeLayout).toBe("single");
  });
});
