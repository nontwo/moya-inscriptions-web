// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { shellState } = vi.hoisted(() => ({
  shellState: { platform: "pc" as "phone" | "tablet" | "pc" },
}));

vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => shellState,
}));

import { T02pQaSearch } from "./t02p-qa-search";

import type { Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

const renderNode = (node: React.ReactNode) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(node));
  return container;
};

const renderSearch = (props: React.ComponentProps<typeof T02pQaSearch> = {}) =>
  renderNode(<T02pQaSearch {...props} />);

const element = <T extends Element>(
  container: ParentNode,
  selector: string,
) => {
  const match = container.querySelector<T>(selector);
  if (match === null) throw new Error(`Missing ${selector}`);
  return match;
};

const click = (target: HTMLElement) => act(() => target.click());

const pointerDown = (target: HTMLElement) =>
  act(() => target.dispatchEvent(new Event("pointerdown", { bubbles: true })));

const typeInto = (input: HTMLInputElement, value: string) => {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setValue === undefined) throw new Error("Missing native input setter");
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("T02pQaSearch", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    shellState.platform = "pc";
    vi.restoreAllMocks();
  });

  it("opens locally with a dynamic trigger name and focuses the input", () => {
    const container = renderSearch();
    const trigger = element<HTMLButtonElement>(
      container,
      "[data-search-trigger]",
    );

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBe("打开搜索");
    click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-label")).toBe("关闭搜索");
    expect(element(container, "[data-search-panel]")).toBeTruthy();
    expect(element<HTMLInputElement>(container, 'input[type="search"]')).toBe(
      document.activeElement,
    );
  });

  it("supports controlled open state through onOpenChange", () => {
    const onOpenChange = vi.fn();
    const container = renderSearch({ onOpenChange, open: false });
    const trigger = element<HTMLButtonElement>(
      container,
      "[data-search-trigger]",
    );

    click(trigger);

    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("[data-search-panel]")).toBeNull();

    const openContainer = renderSearch({ onOpenChange, open: true });
    click(element(openContainer, "[data-search-close]"));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(element(openContainer, "[data-search-panel]")).toBeTruthy();
  });

  it("uses an explicit label relationship without nesting action buttons", () => {
    const container = renderSearch({
      initialKeyword: "龙门",
      initialOpen: true,
    });
    const input = element<HTMLInputElement>(container, 'input[type="search"]');
    const label = element<HTMLLabelElement>(container, "label");
    const clear = element<HTMLButtonElement>(container, "[data-search-clear]");

    expect(label.textContent).toBe("搜索关键词");
    expect(label.htmlFor).toBe(input.id);
    expect(input.labels?.item(0)).toBe(label);
    expect(input.closest("label")).toBeNull();
    expect(clear.closest("label")).toBeNull();
  });

  it("types, submits and clears only through the presentation callbacks", () => {
    const onClearIntent = vi.fn();
    const onSearchIntent = vi.fn();
    const container = renderSearch({ onClearIntent, onSearchIntent });
    click(element(container, "[data-search-trigger]"));
    const input = element<HTMLInputElement>(container, 'input[type="search"]');

    typeInto(input, "  龙门石窟  ");
    click(element(container, "[data-search-submit]"));
    expect(onSearchIntent).toHaveBeenCalledWith("龙门石窟");
    expect(container.textContent).toContain("已记录搜索意图：龙门石窟");

    click(element(container, "[data-search-clear]"));
    expect(input.value).toBe("");
    expect(onClearIntent).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("最近搜索");
  });

  it("treats QA suggestions as intent without searching records", () => {
    const onSuggestionIntent = vi.fn();
    const container = renderSearch({ initialOpen: true, onSuggestionIntent });
    const catalogIds = ["catalog-a", "catalog-b"];

    click(
      element<HTMLButtonElement>(container, '[data-search-suggestion="碑刻"]'),
    );

    expect(onSuggestionIntent).toHaveBeenCalledWith("碑刻");
    expect(
      element<HTMLInputElement>(container, 'input[type="search"]').value,
    ).toBe("碑刻");
    expect(container.textContent).toContain("已记录建议意图：碑刻");
    expect(catalogIds).toEqual(["catalog-a", "catalog-b"]);
  });

  it("clears the seeded empty state after editing, clearing and suggesting", () => {
    const container = renderSearch({
      initialKeyword: "未收录题刻",
      initialOpen: true,
      showEmptyState: true,
    });
    expect(element(container, "[data-search-empty]").textContent).toContain(
      "没有找到相关内容",
    );

    const input = element<HTMLInputElement>(container, 'input[type="search"]');
    typeInto(input, "龙门");
    expect(container.querySelector("[data-search-empty]")).toBeNull();
    expect(container.textContent).toContain("QA 搜索建议");

    click(
      element<HTMLButtonElement>(
        container,
        '[data-search-suggestion="龙门石窟"]',
      ),
    );
    expect(input.value).toBe("龙门石窟");
    expect(container.querySelector("[data-search-empty]")).toBeNull();

    const clearingContainer = renderSearch({
      initialKeyword: "未收录题刻",
      initialOpen: true,
      showEmptyState: true,
    });
    click(element(clearingContainer, "[data-search-clear]"));
    expect(clearingContainer.querySelector("[data-search-empty]")).toBeNull();
    expect(clearingContainer.textContent).toContain("最近搜索");
    expect(clearingContainer.textContent).toContain("搜索建议");
  });

  it("restores trigger focus after explicit close", () => {
    const container = renderSearch({ initialOpen: true });
    const trigger = element<HTMLButtonElement>(
      container,
      "[data-search-trigger]",
    );

    click(element(container, "[data-search-close]"));

    expect(container.querySelector("[data-search-panel]")).toBeNull();
    expect(trigger).toBe(document.activeElement);
    expect(trigger.getAttribute("aria-label")).toBe("打开搜索");
  });

  it("restores trigger focus after Escape", () => {
    const container = renderSearch({ initialOpen: true });

    act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(container.querySelector("[data-search-panel]")).toBeNull();
    expect(element(container, "[data-search-trigger]")).toBe(
      document.activeElement,
    );
  });

  it("closes on outside pointer without reclaiming focus", () => {
    const container = renderSearch({ initialOpen: true });
    const outside = document.createElement("button");
    outside.textContent = "设置";
    document.body.append(outside);
    outside.focus();

    pointerDown(outside);

    expect(container.querySelector("[data-search-panel]")).toBeNull();
    expect(outside).toBe(document.activeElement);
  });

  it.each(["phone", "tablet"] as const)(
    "uses the compact search surface on %s",
    (platform) => {
      shellState.platform = platform;
      const container = renderSearch({ initialOpen: true });
      expect(container.querySelector('[data-platform="pc"]')).toBeNull();
      expect(element(container, "[data-search-close]").textContent).toBe("");
      expect(element(container, "[data-search-panel]")).toBeTruthy();
      expect(container.querySelector("label button")).toBeNull();
      expect(
        element<HTMLInputElement>(container, 'input[type="search"]').labels
          ?.length,
      ).toBe(1);
    },
  );
});
