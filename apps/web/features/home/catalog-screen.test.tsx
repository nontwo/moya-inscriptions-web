// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchSameOriginCatalogPageMock } = vi.hoisted(() => ({
  fetchSameOriginCatalogPageMock: vi.fn(),
}));

vi.mock("../../lib/public-api/catalog-list-client", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchSameOriginCatalogPage: fetchSameOriginCatalogPageMock,
}));

import { CatalogBrowseScreen } from "./catalog-screen";

import type { Root } from "react-dom/client";
import type { CatalogId, CatalogPage, CatalogSummary } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

const item = (number: number): CatalogSummary => ({
  aliases: [],
  id: `paging-inscription-${String(number).padStart(2, "0")}` as CatalogId,
  kind: "inscription",
  title: `分页碑刻 ${number}`,
});

const page = (pageNumber: number, start: number): CatalogPage => ({
  items: Array.from({ length: 24 }, (_, index) => item(start + index)),
  page: pageNumber,
  pageSize: 24,
  total: 55,
  totalPages: 3,
});

const initialState = {
  page: page(1, 1),
  state: "populated",
} satisfies HomeCatalogState;

const renderBrowse = (onOpenCatalog = vi.fn()) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      <div data-test-mounted-destination="">
        <CatalogBrowseScreen
          feedLayout="double"
          kind="inscription"
          onOpenCatalog={onOpenCatalog}
          state={initialState}
        />
      </div>,
    ),
  );
  return { container, onOpenCatalog };
};

beforeEach(() => {
  fetchSameOriginCatalogPageMock.mockReset();
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe("CatalogBrowseScreen paging", () => {
  it("appends page 2 without refetching page 1, replacing records, or changing scroll", async () => {
    fetchSameOriginCatalogPageMock.mockResolvedValue({
      page: page(2, 25),
      state: "success",
    });
    const { container, onOpenCatalog } = renderBrowse();
    const screen = container.querySelector<HTMLElement>(
      '[data-catalog-presentation="inscription"]',
    )!;
    screen.scrollTop = 180;

    expect(container.querySelectorAll("[data-catalog-card]")).toHaveLength(24);
    expect(fetchSameOriginCatalogPageMock).not.toHaveBeenCalled();
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-catalog-paging-control]")
        ?.click();
    });

    expect(fetchSameOriginCatalogPageMock).toHaveBeenCalledOnce();
    expect(fetchSameOriginCatalogPageMock).toHaveBeenCalledWith(
      { kind: "inscription", page: "2", pageSize: "24" },
      expect.any(AbortSignal),
    );
    expect(container.querySelectorAll("[data-catalog-card]")).toHaveLength(48);
    expect(screen.scrollTop).toBe(180);
    expect(container.textContent).toContain("分页碑刻 1");
    expect(container.textContent).toContain("分页碑刻 48");

    const pageTwoOpener = container.querySelector<HTMLButtonElement>(
      '[data-catalog-id="paging-inscription-25"] [data-open-catalog]',
    )!;
    act(() => pageTwoOpener.click());
    expect(onOpenCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ id: "paging-inscription-25" }),
      pageTwoOpener,
    );

    const mountedDestination = container.querySelector<HTMLElement>(
      "[data-test-mounted-destination]",
    )!;
    mountedDestination.hidden = true;
    mountedDestination.hidden = false;
    expect(container.querySelectorAll("[data-catalog-card]")).toHaveLength(48);
  });

  it("retains existing rows and exposes manual retry after a next-page failure", async () => {
    fetchSameOriginCatalogPageMock.mockResolvedValue({ state: "unavailable" });
    const { container } = renderBrowse();

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>("[data-catalog-paging-control]")
        ?.click();
    });

    expect(container.querySelectorAll("[data-catalog-card]")).toHaveLength(24);
    expect(
      container.querySelector<HTMLButtonElement>(
        "[data-catalog-paging-control]",
      )?.textContent,
    ).toBe("加载失败，重新加载");
  });
});
