// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRuntimeCalligraphyCategorySurface } from "./calligraphy-category";
import { CalligraphyCategoryScreen } from "./calligraphy-category-screen";

import type { Root } from "react-dom/client";
import type { CatalogId, CatalogPage, CatalogSummary } from "@moya/contracts";
import type { ReactNode } from "react";
import type { CalligraphyCategorySurfaceData } from "./calligraphy-category";

const openCatalog = vi.fn();
const readActiveScrollTop = vi.fn(() => 0);
const restoreActiveScrollTop = vi.fn();

vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => ({
    activeCatalogId: null,
    activeDestination: "calligraphy",
    feedLayout: "double",
    openCatalog,
    platform: "phone",
    readActiveScrollTop,
    restoreActiveScrollTop,
  }),
}));

vi.mock("../home/catalog-masonry", () => ({
  CatalogMasonry: ({
    items,
    renderItem,
  }: {
    readonly items: readonly CatalogSummary[];
    readonly renderItem: (
      item: CatalogSummary,
      settled: () => void,
    ) => ReactNode;
  }) => (
    <div data-test-masonry="">
      {items.map((item) => (
        <div key={item.id}>{renderItem(item, vi.fn())}</div>
      ))}
    </div>
  ),
}));

vi.mock("../home/catalog-card", () => ({
  CatalogCard: ({
    item,
    onOpenCatalog,
  }: {
    readonly item: CatalogSummary;
    readonly onOpenCatalog?: (
      item: CatalogSummary,
      opener: HTMLButtonElement,
    ) => void;
  }) => (
    <button
      type="button"
      data-catalog-id={item.id}
      onClick={(event) => onOpenCatalog?.(item, event.currentTarget)}
    >
      {item.title}
    </button>
  ),
  isUltraWideCatalogMedia: () => false,
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
let scrollToCalls: ScrollToOptions[] = [];
let viewportHeight = 800;
let viewportWidth = 400;

const page = (items: readonly CatalogSummary[]): CatalogPage => ({
  items: [...items],
  page: 1,
  pageSize: 24,
  total: items.length,
  totalPages: items.length === 0 ? 0 : 1,
});

const item = (id: string, title: string): CatalogSummary => ({
  aliases: [],
  id: id as CatalogId,
  kind: "calligraphy",
  title,
});

const renderScreen = (data: CalligraphyCategorySurfaceData) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      <section data-primary-destination="calligraphy">
        <CalligraphyCategoryScreen data={data} />
      </section>,
    ),
  );
  const frame = container.querySelector<HTMLElement>(
    "[data-calligraphy-category-pager]",
  )!;
  return { container, frame };
};

const activateCategory = (
  container: HTMLElement,
  frame: HTMLElement,
  category: "all" | "ink" | "rubbing",
) => {
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        `[data-calligraphy-category-tab="${category}"]`,
      )
      ?.click(),
  );
  act(() => frame.dispatchEvent(new Event("scrollend")));
};

describe("CalligraphyCategoryScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    scrollToCalls = [];
    openCatalog.mockReset();
    readActiveScrollTop.mockReset();
    readActiveScrollTop.mockReturnValue(0);
    restoreActiveScrollTop.mockReset();
    viewportHeight = 800;
    viewportWidth = 400;
    vi.spyOn(window, "innerHeight", "get").mockImplementation(
      () => viewportHeight,
    );
    vi.spyOn(window, "innerWidth", "get").mockImplementation(
      () => viewportWidth,
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(
      function (this: HTMLElement) {
        return (
          { all: 0, ink: 400, rubbing: 800 }[
            this.dataset.calligraphyCategoryPanel ?? "all"
          ] ?? 0
        );
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 400,
        toJSON: () => undefined,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
      }),
    );
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value(this: HTMLElement, options: ScrollToOptions) {
        scrollToCalls.push(options);
        this.scrollLeft = Number(options.left ?? 0);
        this.dispatchEvent(new Event("scroll"));
      },
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
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    Object.defineProperty(HTMLElement.prototype, "onscrollend", {
      configurable: true,
      value: null,
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    Reflect.deleteProperty(HTMLElement.prototype, "onscrollend");
    vi.restoreAllMocks();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("shows the frozen tabs with continuous progress and truthful runtime states", () => {
    const data = createRuntimeCalligraphyCategorySurface({
      page: page([item("runtime-calligraphy", "运行时书帖")]),
      state: "populated",
    });
    const { container, frame } = renderScreen(data);
    expect(
      Array.from(container.querySelectorAll('[role="tab"]')).map(
        (tab) => tab.textContent,
      ),
    ).toEqual(["全部", "墨迹", "拓本"]);
    expect(container.querySelector('input[type="search"]')).toBeNull();
    expect(container.querySelector("[data-test-masonry]")?.textContent).toBe(
      "运行时书帖",
    );

    act(() => {
      frame.scrollLeft = 200;
      frame.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(0);
    });
    expect(
      container
        .querySelector("[data-calligraphy-category-indicator]")
        ?.getAttribute("data-calligraphy-category-progress"),
    ).toBe("0.5");

    activateCategory(container, frame, "ink");
    expect(
      container
        .querySelector("[data-calligraphy-category-surface]")
        ?.getAttribute("data-active-calligraphy-category"),
    ).toBe("ink");
    expect(container.textContent).toContain("墨迹分类数据尚未接入");
    expect(container.textContent).toContain("当前公开目录尚未提供规范分类");
  });

  it("preserves independent category scroll and opens the unchanged Catalog identity", () => {
    const allItems = [
      item("qa-ink", "墨迹（视觉 QA 合成）"),
      item("qa-rubbing", "拓本（视觉 QA 合成）"),
    ];
    const data: CalligraphyCategorySurfaceData = {
      categories: {
        all: { page: page(allItems), state: "populated" },
        ink: { page: page([allItems[0]!]), state: "populated" },
        rubbing: { page: page([allItems[1]!]), state: "populated" },
      },
      classificationSource: "qa-synthetic",
    };
    readActiveScrollTop.mockReturnValueOnce(137).mockReturnValueOnce(88);
    const { container, frame } = renderScreen(data);

    activateCategory(container, frame, "ink");
    expect(restoreActiveScrollTop).toHaveBeenLastCalledWith(0);
    activateCategory(container, frame, "rubbing");
    expect(restoreActiveScrollTop).toHaveBeenLastCalledWith(0);
    activateCategory(container, frame, "all");
    expect(restoreActiveScrollTop).toHaveBeenLastCalledWith(137);

    const opener = container.querySelector<HTMLButtonElement>(
      '[data-calligraphy-category-panel="all"] [data-catalog-id="qa-ink"]',
    )!;
    act(() => opener.click());
    expect(openCatalog).toHaveBeenCalledWith("qa-ink", opener);
  });

  it("reapplies the active category scroll after resize and orientation", () => {
    readActiveScrollTop.mockReturnValue(146);
    const data = createRuntimeCalligraphyCategorySurface({
      page: page([item("runtime-calligraphy", "运行时书帖")]),
      state: "populated",
    });
    const { container } = renderScreen(data);
    const destination = container.querySelector<HTMLElement>(
      '[data-primary-destination="calligraphy"]',
    )!;

    act(() => destination.dispatchEvent(new Event("scroll")));
    readActiveScrollTop.mockReturnValue(0);
    viewportHeight = 400;
    viewportWidth = 800;
    act(() => {
      destination.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("resize"));
    });
    act(() => vi.runAllTimers());

    expect(restoreActiveScrollTop).toHaveBeenCalledWith(146);
  });
});
