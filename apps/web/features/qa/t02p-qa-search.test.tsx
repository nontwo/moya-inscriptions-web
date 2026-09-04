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

const renderSearch = (
  props: React.ComponentProps<typeof T02pQaSearch> = {},
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<T02pQaSearch {...props} />));
  return container;
};

const element = <T extends Element>(
  container: ParentNode,
  selector: string,
) => {
  const match = container.querySelector<T>(selector);
  if (match === null) throw new Error(`Missing ${selector}`);
  return match;
};

const click = (target: HTMLElement) => act(() => target.click());

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

  it("opens locally and focuses the accessible input", () => {
    const container = renderSearch();
    const trigger = element<HTMLButtonElement>(
      container,
      "[data-search-trigger]",
    );

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(element(container, "[data-search-panel]")).toBeTruthy();
    expect(element<HTMLInputElement>(container, 'input[type="search"]')).toBe(
      document.activeElement,
    );
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

    click(
      element<HTMLButtonElement>(container, '[data-search-suggestion="碑刻"]'),
    );

    expect(onSuggestionIntent).toHaveBeenCalledWith("碑刻");
    expect(
      element<HTMLInputElement>(container, 'input[type="search"]').value,
    ).toBe("碑刻");
    expect(container.textContent).toContain("已记录建议意图：碑刻");
  });

  it("renders the explicit QA empty scenario and closes with Escape", () => {
    const container = renderSearch({
      initialKeyword: "未收录题刻",
      initialOpen: true,
      showEmptyState: true,
    });
    expect(element(container, "[data-search-empty]").textContent).toContain(
      "没有找到相关内容",
    );

    act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(container.querySelector("[data-search-panel]")).toBeNull();
    expect(element(container, "[data-search-trigger]")).toBe(
      document.activeElement,
    );
  });

  it.each(["phone", "tablet"] as const)(
    "uses the compact search surface on %s",
    (platform) => {
      shellState.platform = platform;
      const container = renderSearch({ initialOpen: true });
      expect(container.querySelector('[data-platform="pc"]')).toBeNull();
      expect(element(container, "[data-search-close]").textContent).toBe("");
      expect(element(container, "[data-search-panel]")).toBeTruthy();
    },
  );
});
