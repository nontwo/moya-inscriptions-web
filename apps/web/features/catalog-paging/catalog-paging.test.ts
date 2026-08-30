// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCatalogPaging } from "./catalog-paging";

import type {
  CatalogId,
  CatalogKind,
  CatalogPage,
  CatalogSummary,
} from "@moya/contracts";
import type { HomeCatalogState } from "../home/catalog-state";
import type { CatalogPageTransportResult } from "../../lib/public-api/catalog-list";
import type { Root } from "react-dom/client";
import type {
  CatalogPagingOptions,
  CatalogPagingResult,
} from "./catalog-paging";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

const PagingHarness = ({
  onRender,
  options,
}: {
  readonly onRender: (result: CatalogPagingResult) => void;
  readonly options: CatalogPagingOptions;
}) => {
  onRender(useCatalogPaging(options));
  return null;
};

const mountPaging = (initialOptions: CatalogPagingOptions) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  let current: CatalogPagingResult | undefined;
  const rerender = (options: CatalogPagingOptions) =>
    act(() =>
      root.render(
        createElement(PagingHarness, {
          onRender: (next) => {
            current = next;
          },
          options,
        }),
      ),
    );
  rerender(initialOptions);
  return {
    result: {
      get current() {
        if (current === undefined) throw new Error("Missing paging result");
        return current;
      },
    },
    rerender,
    unmount: () => {
      act(() => root.unmount());
      const index = roots.indexOf(root);
      if (index >= 0) roots.splice(index, 1);
    },
  };
};

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
});

const item = (
  id: string,
  kind: CatalogKind = "inscription",
): CatalogSummary => ({
  aliases: [],
  id: id as CatalogId,
  kind,
  title: id,
});

const page = (
  pageNumber: number,
  items: readonly CatalogSummary[],
  options: Partial<Pick<CatalogPage, "pageSize" | "total" | "totalPages">> = {},
): CatalogPage => ({
  items: [...items],
  page: pageNumber,
  pageSize: options.pageSize ?? 24,
  total: options.total ?? 55,
  totalPages: options.totalPages ?? 3,
});

const populated = (
  transportPage: CatalogPage,
): Extract<HomeCatalogState, { readonly state: "populated" }> => ({
  page: transportPage,
  state: "populated",
});

const firstPage = populated(
  page(1, [item("one"), item("duplicate"), item("duplicate")]),
);

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

describe("bounded Catalog paging state", () => {
  it("initializes from page 1 without refetching and keeps first identities authoritative", () => {
    const loadPage = vi.fn();
    const { result } = mountPaging({
      initialState: firstPage,
      kind: "inscription",
      loadPage,
    });

    expect(result.current.initialState).toBe(firstPage);
    expect(result.current.latestPage).toBe(firstPage.page);
    expect(result.current.items.map(({ id }) => id)).toEqual([
      "one",
      "duplicate",
    ]);
    expect(result.current.requestState).toBe("idle");
    expect(loadPage).not.toHaveBeenCalled();
  });

  it("appends page 2 and page 3 in API order, deduplicates, and stops at completion", async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({
        page: page(2, [item("two"), item("duplicate"), item("three")]),
        state: "success",
      })
      .mockResolvedValueOnce({
        page: page(3, [item("four")]),
        state: "success",
      });
    const { result } = mountPaging({
      initialState: firstPage,
      kind: "inscription",
      loadPage,
    });

    await act(() => result.current.loadNextPage());
    expect(result.current.items.map(({ id }) => id)).toEqual([
      "one",
      "duplicate",
      "two",
      "three",
    ]);
    expect(result.current.latestPage?.page).toBe(2);
    expect(result.current.requestState).toBe("idle");

    await act(() => result.current.loadNextPage());
    expect(result.current.items.map(({ id }) => id)).toEqual([
      "one",
      "duplicate",
      "two",
      "three",
      "four",
    ]);
    expect(result.current.requestState).toBe("complete");
    await act(() => result.current.loadNextPage());
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(loadPage.mock.calls.map(([query]) => query.page)).toEqual([
      "2",
      "3",
    ]);
  });

  it("allows only one active request and exposes loading until it settles", async () => {
    const pending = deferred<CatalogPageTransportResult>();
    const loadPage = vi.fn(() => pending.promise);
    const { result } = mountPaging({
      initialState: firstPage,
      kind: "inscription",
      loadPage,
    });

    let first!: Promise<void>;
    await act(async () => {
      first = result.current.loadNextPage();
      await result.current.loadNextPage();
    });
    expect(loadPage).toHaveBeenCalledOnce();
    expect(result.current.requestState).toBe("loading");

    pending.resolve({ page: page(2, [item("two")]), state: "success" });
    await act(() => first);
    expect(result.current.requestState).toBe("idle");
  });

  it("retains existing records after failure and retries the same page only on activation", async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ state: "unavailable" })
      .mockResolvedValueOnce({
        page: page(2, [item("two")]),
        state: "success",
      });
    const { result } = mountPaging({
      initialState: firstPage,
      kind: "inscription",
      loadPage,
    });

    await act(() => result.current.loadNextPage());
    expect(result.current.requestState).toBe("next-page-error");
    expect(result.current.items.map(({ id }) => id)).toEqual([
      "one",
      "duplicate",
    ]);
    expect(loadPage).toHaveBeenCalledOnce();

    await act(() => result.current.loadNextPage());
    expect(result.current.requestState).toBe("idle");
    expect(loadPage.mock.calls.map(([query]) => query.page)).toEqual([
      "2",
      "2",
    ]);
  });

  it.each([
    ["wrong page", page(3, [item("two")])],
    ["wrong page size", page(2, [item("two")], { pageSize: 12 })],
    ["wrong kind", page(2, [item("two", "calligraphy")])],
    [
      "invalid identity",
      { ...page(2, [item("two")]), items: [{ ...item("two"), id: "bad id" }] },
    ],
    ["invalid metadata", { ...page(2, [item("two")]), totalPages: 9 }],
  ])("rejects a %s response without replacing page 1", async (_name, next) => {
    const loadPage = vi
      .fn()
      .mockResolvedValue({ page: next, state: "success" });
    const { result } = mountPaging({
      initialState: firstPage,
      kind: "inscription",
      loadPage,
    });

    await act(() => result.current.loadNextPage());

    expect(result.current.requestState).toBe("next-page-error");
    expect(result.current.latestPage).toBe(firstPage.page);
    expect(result.current.items.map(({ id }) => id)).toEqual([
      "one",
      "duplicate",
    ]);
  });

  it("aborts an unfinished request when the owner unmounts", async () => {
    let observedSignal: AbortSignal | undefined;
    const loadPage = vi.fn((_query, signal: AbortSignal) => {
      observedSignal = signal;
      return new Promise<CatalogPageTransportResult>((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    });
    const { result, unmount } = mountPaging({
      initialState: firstPage,
      kind: "inscription",
      loadPage,
    });

    let request!: Promise<void>;
    await act(async () => {
      request = result.current.loadNextPage();
    });
    unmount();
    await request;

    expect(observedSignal?.aborted).toBe(true);
  });

  it("aborts and discards a stale response when initial state changes", async () => {
    const pending = deferred<CatalogPageTransportResult>();
    let observedSignal: AbortSignal | undefined;
    const loadPage = vi.fn((_query, signal: AbortSignal) => {
      observedSignal = signal;
      return pending.promise;
    });
    const replacement = populated(
      page(1, [item("replacement")], { total: 1, totalPages: 1 }),
    );
    const { result, rerender } = mountPaging({
      initialState: firstPage,
      kind: "inscription",
      loadPage,
    });

    let request!: Promise<void>;
    await act(async () => {
      request = result.current.loadNextPage();
    });
    rerender({
      initialState: replacement,
      kind: "inscription",
      loadPage,
    });
    expect(observedSignal?.aborted).toBe(true);
    pending.resolve({ page: page(2, [item("stale")]), state: "success" });
    await act(() => request);

    expect(result.current.items.map(({ id }) => id)).toEqual(["replacement"]);
    expect(result.current.requestState).toBe("complete");
  });
});
