// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogPagingControl } from "./catalog-paging-control";

import type { Root } from "react-dom/client";
import type { CatalogPagingRequestState } from "./catalog-paging";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

const renderControl = (
  state: CatalogPagingRequestState,
  onLoadNextPage = vi.fn(),
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      <CatalogPagingControl onLoadNextPage={onLoadNextPage} state={state} />,
    ),
  );
  return { container, onLoadNextPage };
};

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe("CatalogPagingControl", () => {
  it.each([
    ["idle", "继续加载", false],
    ["loading", "正在加载…", true],
    ["next-page-error", "加载失败，重新加载", false],
  ] as const)("renders the %s state", (state, label, disabled) => {
    const { container, onLoadNextPage } = renderControl(state);

    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.textContent).toBe(label);
    expect(button.disabled).toBe(disabled);
    act(() => button.click());
    expect(onLoadNextPage).toHaveBeenCalledTimes(disabled ? 0 : 1);
  });

  it("removes the active control after completion", () => {
    const { container } = renderControl("complete");

    expect(container.childElementCount).toBe(0);
  });
});
