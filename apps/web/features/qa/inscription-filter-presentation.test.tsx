// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { shellState } = vi.hoisted(() => ({
  shellState: { platform: "pc" as "phone" | "tablet" | "pc" },
}));

vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => shellState,
}));

import { QaInscriptionFilter } from "./inscription-filter-presentation";

import type { Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

const renderFilter = (
  props: React.ComponentProps<typeof QaInscriptionFilter> = {},
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<QaInscriptionFilter {...props} />));
  return container;
};

const click = (element: Element | null) => {
  if (!(element instanceof HTMLElement))
    throw new Error("Missing click target");
  act(() => element.click());
};

describe("QaInscriptionFilter", () => {
  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    shellState.platform = "pc";
    vi.restoreAllMocks();
  });

  it("commits PC selections through the optional presentation seam", () => {
    const onFilterIntent = vi.fn();
    const onApplyFilter = vi.fn();
    const container = renderFilter({ onApplyFilter, onFilterIntent });

    click(container.querySelector("[data-filter-trigger]"));
    expect(container.querySelector("[data-filter-panel]")).not.toBeNull();
    click(container.querySelector('[data-filter-category="dynasty"]'));
    expect(
      container.querySelector('[data-filter-popover="dynasty"]'),
    ).not.toBeNull();
    click(
      Array.from(container.querySelectorAll('[role="option"]')).find(
        (option) => option.textContent === "隋唐",
      ) ?? null,
    );

    expect(onFilterIntent).toHaveBeenLastCalledWith({ dynasty: "隋唐" });
    expect(onApplyFilter).toHaveBeenLastCalledWith({ dynasty: "隋唐" });
    expect(
      container.querySelector('[data-filter-category="dynasty"]')?.textContent,
    ).toBe("隋唐 ×");

    click(container.querySelector('[data-filter-category="dynasty"]'));
    expect(onApplyFilter).toHaveBeenLastCalledWith({});
    expect(container.textContent).toContain("朝代⌄");
  });

  it.each([
    ["dynasty", "秦汉"],
    ["script", "篆书"],
    ["type", "摩崖"],
    ["region", "地区"],
  ] as const)("opens the PC %s option popover", (category, option) => {
    const container = renderFilter();

    click(container.querySelector("[data-filter-trigger]"));
    click(container.querySelector(`[data-filter-category="${category}"]`));

    const popover = container.querySelector(
      `[data-filter-popover="${category}"]`,
    );
    expect(popover).not.toBeNull();
    expect(popover?.textContent).toContain(option);
  });

  it.each(["phone", "tablet"] as const)(
    "uses a cancellable confirmation sheet on %s",
    (platform) => {
      shellState.platform = platform;
      const onApplyFilter = vi.fn();
      const container = renderFilter({ onApplyFilter });

      click(container.querySelector("[data-filter-trigger]"));
      click(container.querySelector('[data-filter-category="script"]'));
      expect(
        container.querySelector('[data-filter-sheet="script"]'),
      ).not.toBeNull();

      const runningScript = Array.from(
        container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
      ).find((input) => input.parentElement?.textContent?.includes("行书"));
      if (runningScript === undefined) throw new Error("Missing 行书 option");
      act(() => runningScript.click());
      expect(onApplyFilter).not.toHaveBeenCalled();
      click(container.querySelector("[data-filter-confirm]"));

      expect(onApplyFilter).toHaveBeenCalledWith({ script: "行书" });
      expect(container.textContent).toContain("行书 ×");
    },
  );

  it("resets local presentation state without filtering records", () => {
    const onResetFilter = vi.fn();
    const onFilterIntent = vi.fn();
    const container = renderFilter({ onFilterIntent, onResetFilter });

    click(container.querySelector("[data-filter-trigger]"));
    click(container.querySelector('[data-filter-category="type"]'));
    click(
      Array.from(container.querySelectorAll('[role="option"]')).find(
        (option) => option.textContent === "碑刻",
      ) ?? null,
    );
    click(container.querySelector("[data-filter-reset]"));

    expect(onFilterIntent).toHaveBeenLastCalledWith({});
    expect(onResetFilter).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("类型⌄");
  });
});
