import { describe, expect, it, vi } from "vitest";
import { fetchSameOriginCatalogSearchPage } from "./catalog-search-client";
import { fetchCatalogSearchPage } from "./catalog-search";

const page = {
  items: [
    {
      id: "synthetic-search-1",
      kind: "calligraphy",
      title: "测试书帖",
      aliases: [],
      matchKind: "title-exact",
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
  totalPages: 1,
};
const context = (fetch: typeof globalThis.fetch) => ({
  baseUrl: new URL("https://example.test/base/"),
  fetch,
});
const browser = (
  fetch: typeof globalThis.fetch,
  query: never,
  signal?: AbortSignal,
) => fetchSameOriginCatalogSearchPage(query, signal, context(fetch));
const server = (
  fetch: typeof globalThis.fetch,
  query: never,
  signal?: AbortSignal,
) => fetchCatalogSearchPage(context(fetch), query, signal);

describe.each([
  ["browser", browser, "/api/catalog-search"],
  ["server", server, "/base/v1/catalog-search"],
] as const)("Catalog Search %s HTTP transport", (_name, invoke, path) => {
  it("transports literal text and validates the response without echoing a query", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(page));
    await expect(
      invoke(fetch, {
        q: "篆 %_\\",
        kind: "calligraphy",
        page: "1",
        pageSize: "20",
      } as never),
    ).resolves.toEqual({ state: "success", page });
    const url = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get("q")).toBe("篆 %_\\");
    expect(url.searchParams.get("kind")).toBe("calligraphy");
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      cache: "no-store",
    });
  });
  it.each([
    {},
    { q: " " },
    { q: "文".repeat(201) },
    { q: "文", kind: "painting" },
    { q: "文", page: "0" },
    { q: "文", pageSize: "101" },
    { q: "文\u0000" },
  ])("rejects invalid input before any fetch", async (query) => {
    const fetch = vi.fn();
    await expect(invoke(fetch, query as never)).resolves.toEqual({
      state: "invalid-query",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [400, "invalid-query"],
    [503, "unavailable"],
    [502, "unexpected-error"],
  ] as const)("preserves HTTP failure %s as %s", async (status, state) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(invoke(fetch, { q: "文" } as never)).resolves.toEqual({
      state,
    });
  });
  it("rejects malformed and unknown match kinds without rendering success", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        ...page,
        items: [{ ...page.items[0], matchKind: "near" }],
      }),
    );
    await expect(invoke(fetch, { q: "文" } as never)).resolves.toEqual({
      state: "unexpected-error",
    });
  });
  it("preserves a genuine empty page", async () => {
    const empty = { ...page, items: [], total: 0, totalPages: 0 };
    const fetch = vi.fn().mockResolvedValue(Response.json(empty));
    await expect(invoke(fetch, { q: "文" } as never)).resolves.toEqual({
      state: "success",
      page: empty,
    });
  });
  it("propagates intentional cancellation", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(
      invoke(fetch, { q: "文" } as never, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
