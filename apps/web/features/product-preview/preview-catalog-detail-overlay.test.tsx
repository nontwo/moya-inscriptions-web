// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PreviewCatalogDetailOverlay } from "./preview-catalog-detail-overlay";
import { ProductShell, useProductShell } from "../product-shell/product-shell";

import type { Root } from "react-dom/client";
import type { CatalogDetailPresentationLoader } from "../detail/load-catalog-detail";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const OverlayHost = () => {
  const { activeCatalogId, openCatalog } = useProductShell();
  return (
    <button
      data-catalog-id="catalog-a"
      onClick={(event) => openCatalog("catalog-a", event.currentTarget)}
      type="button"
    >
      {activeCatalogId ?? "open"}
    </button>
  );
};

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  window.history.replaceState(null, "", "/dev/t02p");
  vi.restoreAllMocks();
});

beforeEach(() => {
  document.documentElement.dataset.yoyiBootStarted = String(performance.now());
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: null,
  });
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("PreviewCatalogDetailOverlay", () => {
  it("suppresses a stale response after the requested identity changes", async () => {
    const first =
      deferred<Awaited<ReturnType<CatalogDetailPresentationLoader>>>();
    const second =
      deferred<Awaited<ReturnType<CatalogDetailPresentationLoader>>>();
    const loader = vi.fn((catalogId: string) =>
      catalogId === "catalog-a" ? first.promise : second.promise,
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const backButtonRef = { current: null };
    const renderOverlay = (catalogId: string) => (
      <ProductShell
        calligraphy={<p>calligraphy</p>}
        home={<OverlayHost />}
        initialPlatform="phone"
        inscriptions={<p>inscriptions</p>}
        renderDetailOverlay={() => (
          <PreviewCatalogDetailOverlay
            backButtonRef={backButtonRef}
            catalogId={catalogId}
            initialScrollTop={0}
            loader={loader}
            onClose={vi.fn()}
            onScrollTopChange={vi.fn()}
          />
        )}
      />
    );

    await act(async () => root.render(renderOverlay("catalog-a")));
    act(() =>
      container.querySelector<HTMLButtonElement>("[data-catalog-id]")?.click(),
    );
    await act(async () => root.render(renderOverlay("catalog-b")));
    await act(async () =>
      first.resolve({
        detail: {
          aliases: [],
          facts: [],
          id: "catalog-a",
          kind: "inscription",
          media: [],
          source: "runtime",
          sourceCitations: [],
          title: "过期详情",
        },
        state: "loaded",
      }),
    );
    expect(container.textContent).not.toContain("过期详情");
    await act(async () =>
      second.resolve({
        detail: {
          aliases: [],
          facts: [],
          id: "catalog-b",
          kind: "calligraphy",
          media: [],
          source: "runtime",
          sourceCitations: [],
          title: "当前详情",
        },
        state: "loaded",
      }),
    );
    expect(container.textContent).toContain("当前详情");
  });
});
