// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { shellState } = vi.hoisted(() => ({
  shellState: { platform: "pc" as "phone" | "tablet" | "pc" },
}));

vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => shellState,
}));

import { QaSearchTrigger, T02pQaSearch } from "./t02p-qa-search";

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

const SearchFixture = (props: React.ComponentProps<typeof T02pQaSearch>) => {
  const [localOpen, setLocalOpen] = useState(props.initialOpen ?? false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = props.open ?? localOpen;
  const update = (next: boolean) => {
    if (props.open === undefined) setLocalOpen(next);
    props.onOpenChange?.(next);
  };
  return (
    <div
      data-t02p-qa-harness=""
      data-product-shell=""
      data-settings-open="false"
    >
      <aside data-qa-controls="">
        <button>场景</button>
      </aside>
      <div data-primary-navigation-pager="">
        <div data-primary-destination="inscriptions">来源内容</div>
      </div>
      <nav data-primary-navigation-dock="">
        <QaSearchTrigger
          open={open}
          onOpenChange={update}
          openerRef={openerRef}
          searchInputRef={inputRef}
        />
      </nav>
      <button data-user-trigger="">用户</button>
      <T02pQaSearch
        {...props}
        open={open}
        onOpenChange={update}
        openerRef={openerRef}
        searchInputRef={inputRef}
      />
    </div>
  );
};
const renderSearch = (props: React.ComponentProps<typeof T02pQaSearch> = {}) =>
  renderNode(<SearchFixture {...props} />);

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

  it("opens from the dock and focuses a mounted input within the same click", () => {
    const container = renderSearch();
    const trigger = element<HTMLButtonElement>(
      container,
      "[data-search-trigger]",
    );

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toBe("打开搜索");
    click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-label")).toBe("打开搜索");
    expect(trigger.closest("[data-primary-navigation-dock]")).not.toBeNull();
    expect(
      element(container, "[data-search-panel]").getAttribute("aria-modal"),
    ).toBe("true");
    expect(element(container, "[data-search-panel]").getAttribute("role")).toBe(
      "dialog",
    );
    expect(container.querySelectorAll("[data-search-trigger]")).toHaveLength(1);
    expect(element(container, "[data-search-no-recent]").textContent).toContain(
      "暂无搜索记录",
    );
    expect(container.textContent).toContain("最近搜索会显示在这里");
    expect(container.querySelector("[data-search-suggestion]")).toBeNull();
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
    const container = renderSearch({
      initialOpen: true,
      onSuggestionIntent,
      showRecentSearches: true,
    });
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
    expect(clearingContainer.textContent).toContain("暂无搜索记录");
    expect(
      clearingContainer.querySelector("[data-search-suggestion]"),
    ).toBeNull();
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

  it("keeps a fullscreen modal open on unrelated outside pointer events", () => {
    const container = renderSearch({ initialOpen: true });
    const outside = document.createElement("button");
    outside.textContent = "设置";
    document.body.append(outside);
    outside.focus();

    pointerDown(outside);

    expect(container.querySelector("[data-search-panel]")).not.toBeNull();
    expect(outside).toBe(document.activeElement);
  });

  it.each(["phone", "tablet"] as const)(
    "uses the same fullscreen search composition on %s",
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

  it("submits only trimmed nonempty input and keeps clear distinct from close", () => {
    const onSearchIntent = vi.fn();
    const container = renderSearch({ initialOpen: true, onSearchIntent });
    const input = element<HTMLInputElement>(container, "input");
    typeInto(input, "   ");
    click(element(container, "[data-search-submit]"));
    expect(onSearchIntent).not.toHaveBeenCalled();
    typeInto(input, "  魏碑  ");
    act(() =>
      element(container, "form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(onSearchIntent).toHaveBeenCalledExactlyOnceWith("魏碑");
    expect(
      element(container, "[data-search-clear]").getAttribute("aria-label"),
    ).not.toBe(
      element(container, "[data-search-close]").getAttribute("aria-label"),
    );
    click(element(container, "[data-search-clear]"));
    expect(container.querySelector("[data-search-panel]")).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("enterkeyhint")).toBe("search");
  });

  it("does not submit during Chinese composition and accepts Enter after it ends", () => {
    const onSearchIntent = vi.fn();
    const container = renderSearch({ initialOpen: true, onSearchIntent });
    const input = element<HTMLInputElement>(container, "input");
    typeInto(input, "龙门");
    act(() =>
      input.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      ),
    );
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    });
    act(() => input.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(true);
    click(element(container, "[data-search-submit]"));
    expect(onSearchIntent).not.toHaveBeenCalled();
    act(() =>
      input.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      ),
    );
    act(() =>
      element(container, "form").dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(onSearchIntent).toHaveBeenCalledExactlyOnceWith("龙门");
    const legacyImeEnter = new KeyboardEvent("keydown", {
      key: "Enter",
      keyCode: 229,
      bubbles: true,
      cancelable: true,
    });
    act(() => input.dispatchEvent(legacyImeEnter));
    expect(legacyImeEnter.defaultPrevented).toBe(true);
  });

  it("starts a new composition session after closing before compositionend", () => {
    const onSearchIntent = vi.fn();
    const container = renderSearch({ initialOpen: true, onSearchIntent });
    const input = element<HTMLInputElement>(container, "input");
    typeInto(input, "魏碑");
    act(() =>
      input.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      ),
    );
    click(element(container, "[data-search-close]"));
    click(element(container, "[data-search-trigger]"));
    click(element(container, "[data-search-submit]"));
    expect(onSearchIntent).toHaveBeenCalledExactlyOnceWith("魏碑");
  });

  it("isolates only the nearest harness, restores exact attributes and source scroll", () => {
    document.body.style.overflow = "clip";
    const outside = document.createElement("aside");
    outside.dataset.qaControls = "";
    outside.setAttribute("aria-hidden", "false");
    document.body.append(outside);
    const container = renderSearch();
    const controls = element<HTMLElement>(container, "[data-qa-controls]");
    controls.inert = true;
    controls.setAttribute("inert", "already");
    controls.setAttribute("aria-hidden", "false");
    const source = element<HTMLElement>(
      container,
      "[data-primary-destination]",
    );
    source.scrollTop = 218;
    click(element(container, "[data-search-trigger]"));
    for (const selector of [
      "[data-qa-controls]",
      "[data-primary-navigation-pager]",
      "[data-primary-navigation-dock]",
      "[data-user-trigger]",
    ]) {
      expect(element<HTMLElement>(container, selector).inert).toBe(true);
      expect(element(container, selector).getAttribute("aria-hidden")).toBe(
        "true",
      );
    }
    expect(outside.hasAttribute("inert")).toBe(false);
    expect(outside.getAttribute("aria-hidden")).toBe("false");
    expect(document.body.style.overflow).toBe("hidden");
    source.scrollTop = 0;
    click(element(container, "[data-search-close]"));
    expect(source.scrollTop).toBe(218);
    expect(controls.inert).toBe(true);
    expect(controls.getAttribute("inert")).toBe("already");
    expect(controls.getAttribute("aria-hidden")).toBe("false");
    expect(
      element(container, "[data-primary-navigation-dock]").hasAttribute(
        "inert",
      ),
    ).toBe(false);
    expect(document.body.style.overflow).toBe("clip");
    document.body.style.overflow = "";
  });

  it("traps forward and backward Tab inside the surface", () => {
    const container = renderSearch({ initialOpen: true });
    const first = element<HTMLElement>(container, "[data-search-submit]");
    const last = element<HTMLElement>(container, "[data-search-close]");
    last.focus();
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
      ),
    );
    expect(document.activeElement).toBe(first);
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(last);
  });

  it("tracks simulated VisualViewport resize, pan and orientation without a second keyboard inset", () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 450,
      width: 390,
      offsetTop: 42,
      offsetLeft: 0,
    });
    vi.stubGlobal("visualViewport", viewport);
    const remove = vi.spyOn(viewport, "removeEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const cancel = vi.spyOn(window, "cancelAnimationFrame");
    const container = renderSearch({ initialOpen: true });
    const panel = element<HTMLElement>(container, "[data-search-panel]");
    expect(panel.style.getPropertyValue("--qa-search-viewport-height")).toBe(
      "450px",
    );
    expect(panel.style.getPropertyValue("--qa-search-viewport-top")).toBe(
      "42px",
    );
    expect(panel.style.getPropertyValue("--qa-search-bottom-safe-area")).toBe(
      "0px",
    );
    viewport.height = 390;
    viewport.offsetTop = 80;
    act(() => viewport.dispatchEvent(new Event("scroll")));
    expect(panel.style.getPropertyValue("--qa-search-viewport-height")).toBe(
      "390px",
    );
    expect(panel.style.getPropertyValue("--qa-search-viewport-top")).toBe(
      "80px",
    );
    viewport.height = window.innerHeight;
    viewport.offsetTop = 0;
    act(() => viewport.dispatchEvent(new Event("resize")));
    expect(panel.style.getPropertyValue("--qa-search-bottom-safe-area")).toBe(
      "env(safe-area-inset-bottom)",
    );
    viewport.width = 844;
    act(() => window.dispatchEvent(new Event("orientationchange")));
    expect(panel.style.getPropertyValue("--qa-search-viewport-width")).toBe(
      "844px",
    );
    vi.mocked(window.requestAnimationFrame).mockReturnValueOnce(987);
    act(() => viewport.dispatchEvent(new Event("resize")));
    click(element(container, "[data-search-close]"));
    expect(cancel).toHaveBeenCalledWith(987);
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeWindow).toHaveBeenCalledWith(
      "orientationchange",
      expect.any(Function),
    );
    vi.unstubAllGlobals();
  });

  it("falls back to the changing browser height without VisualViewport", () => {
    vi.stubGlobal("visualViewport", undefined);
    const container = renderSearch({ initialOpen: true });
    const panel = element<HTMLElement>(container, "[data-search-panel]");
    expect(panel.style.getPropertyValue("--qa-search-viewport-height")).toBe(
      `${window.innerHeight}px`,
    );
    vi.stubGlobal("innerHeight", 360);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(panel.style.getPropertyValue("--qa-search-viewport-height")).toBe(
      "360px",
    );
    vi.unstubAllGlobals();
  });
});
