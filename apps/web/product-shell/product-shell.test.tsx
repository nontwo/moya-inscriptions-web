// @vitest-environment jsdom
/// <reference lib="dom" />

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeCatalogCard } from "../features/home/home-catalog-card";
import { ProductShell } from "./product-shell";
import {
  contentWallLayoutPreferenceKey,
  themePreferenceKey,
} from "./presentation-preferences";

import type { CatalogSummary } from "@moya/contracts";

let container: HTMLDivElement;
let root: Root;

const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) =>
      item.getAttribute("aria-label") === label || item.textContent === label,
  );

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  localStorage.clear();
  document.documentElement.dataset.platform = "phone";
  document.documentElement.dataset.deviceClass = "desktop";
  document.documentElement.dataset.contentWallLayout = "double";
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 390,
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

describe("formal ProductShell continuity", () => {
  it("keeps all approved primary destinations usable", () => {
    act(() => root.render(<ProductShell homeDiscover={<p>REAL HOME</p>} />));
    expect(document.body.textContent).toContain("REAL HOME");
    expect(button("碑刻")?.disabled).toBe(false);
    expect(button("书帖")?.disabled).toBe(false);

    act(() => button("碑刻")?.click());
    expect(
      document
        .querySelector('[data-primary-surface="inscriptions"]')
        ?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      document.querySelector('input[aria-label="搜索碑刻"]'),
    ).not.toBeNull();

    act(() => button("书帖")?.click());
    expect(
      document
        .querySelector('[data-primary-surface="calligraphy"]')
        ?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      document.querySelector('[role="tablist"][aria-label="书帖分类"]'),
    ).not.toBeNull();
  });

  it("opens full-screen Settings and persists only approved preferences", () => {
    act(() => root.render(<ProductShell homeDiscover={<p>REAL HOME</p>} />));
    const trigger = button("打开设置");
    act(() => trigger?.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.textContent).toContain("设置");
    expect(dialog?.textContent).not.toMatch(/调试|日志|账号/);
    expect(document.activeElement).toBe(button("返回"));

    const theme = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((item) => item.ariaLabel?.startsWith("切换主题"));
    const layout = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((item) => item.ariaLabel?.startsWith("切换布局"));
    act(() => theme?.click());
    act(() => layout?.click());
    expect(localStorage.getItem(themePreferenceKey)).toBe("light");
    expect(localStorage.getItem(contentWallLayoutPreferenceKey)).toBe("single");
    expect(document.documentElement.dataset.contentWallLayout).toBe("single");
  });

  it("preserves 12px minimize, 24px restore, idle restore and active-tap restore", () => {
    act(() => root.render(<ProductShell homeDiscover={<p>REAL HOME</p>} />));
    const scroll = document.querySelector<HTMLElement>(
      '[data-surface-scroll="home:discover"]',
    )!;
    const navigation = document.querySelector<HTMLElement>(
      'nav[aria-label="主导航"]',
    )!;
    scroll.scrollTop = 13;
    act(() => scroll.dispatchEvent(new Event("scroll")));
    expect(navigation.dataset.minimized).toBe("true");
    act(() => {
      const active = button("首页");
      active?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }),
      );
      active?.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
      );
      active?.click();
    });
    expect(navigation.hasAttribute("data-minimized")).toBe(false);
    scroll.scrollTop = 40;
    act(() => scroll.dispatchEvent(new Event("scroll")));
    expect(navigation.dataset.minimized).toBe("true");
    act(() => vi.advanceTimersByTime(400));
    expect(navigation.hasAttribute("data-minimized")).toBe(false);
    scroll.scrollTop = 75;
    act(() => scroll.dispatchEvent(new Event("scroll")));
    scroll.scrollTop = 51;
    act(() => scroll.dispatchEvent(new Event("scroll")));
    expect(navigation.hasAttribute("data-minimized")).toBe(false);
  });

  it("opens an honest summary-only bridge for REAL Home cards", () => {
    const item = {
      id: "catalog-001",
      kind: "inscription",
      title: "真实目录条目",
      aliases: ["真实别名"],
      summary: "首页不应把摘要制造成详情",
      periodLabel: "北魏",
    } as CatalogSummary;
    act(() =>
      root.render(
        <ProductShell homeDiscover={<HomeCatalogCard item={item} />} />,
      ),
    );
    act(() =>
      document.querySelector<HTMLButtonElement>("[data-home-card]")?.click(),
    );
    const detail = document.querySelector(
      '[data-detail-source="real-summary"]',
    );
    expect(detail?.textContent).toContain("真实目录条目");
    expect(detail?.textContent).toContain("真实别名");
    expect(detail?.textContent).not.toContain("首页不应把摘要制造成详情");
    expect(detail?.textContent).not.toMatch(/DEMO|开发中|尚未接入/);
    expect(detail?.querySelector('[aria-label="资料来源"]')).toBeNull();
  });

  it("keeps rich Synthetic Detail and media stress behavior", () => {
    act(() => root.render(<ProductShell homeDiscover={<p>REAL HOME</p>} />));
    act(() => button("碑刻")?.click());
    const yunfeng = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((item) => item.textContent?.includes("云峰山题名"));
    act(() => yunfeng?.click());
    expect(
      document.querySelector('[data-detail-source="demo"]')?.textContent,
    ).toContain("1 / 5");
    act(() => button("查看图像")?.click());
    expect(document.querySelector("[data-media-viewer]")).not.toBeNull();
  });
});
