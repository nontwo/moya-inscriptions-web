import { describe, expect, it, vi } from "vitest";

import { fetchSameOriginCatalogPage } from "./catalog-list-client";

import type { CatalogId, CatalogPage } from "@moya/contracts";

const page = {
  items: [
    {
      aliases: [],
      id: "inscription-025" as CatalogId,
      kind: "inscription",
      title: "第二页碑刻",
    },
  ],
  page: 2,
  pageSize: 24,
  total: 55,
  totalPages: 3,
} satisfies CatalogPage;

const context = (fetch: typeof globalThis.fetch) => ({
  baseUrl: new URL("https://example.test/formal"),
  fetch,
});

describe("same-origin Catalog list client", () => {
  it("constructs and validates the declared same-origin query", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(page));

    await expect(
      fetchSameOriginCatalogPage(
        { kind: "inscription", page: "2", pageSize: "24" },
        undefined,
        context(fetch),
      ),
    ).resolves.toEqual({ page, state: "success" });
    expect(fetch).toHaveBeenCalledWith(
      new URL(
        "https://example.test/api/catalog?kind=inscription&page=2&pageSize=24",
      ),
      expect.objectContaining({
        cache: "no-store",
        method: "GET",
      }),
    );
    expect(fetch.mock.instances[0]).toBe(globalThis);
  });

  it("supports an omitted query without contacting a backend URL", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        items: [],
        page: 1,
        pageSize: 24,
        total: 0,
        totalPages: 0,
      }),
    );

    await fetchSameOriginCatalogPage({}, undefined, context(fetch));

    const requested = fetch.mock.calls[0]?.[0];
    expect(requested).toEqual(new URL("https://example.test/api/catalog"));
    expect(String(requested)).not.toContain("MOYA_PUBLIC_API_BASE_URL");
    expect(String(requested)).not.toContain("/v1/catalog");
  });

  it.each([
    ["invalid page", { page: "0" }],
    ["oversized page", { pageSize: "101" }],
    ["invalid kind", { kind: "painting" }],
  ])("rejects an %s query before fetch", async (_name, query) => {
    const fetch = vi.fn();

    await expect(
      fetchSameOriginCatalogPage(query as never, undefined, context(fetch)),
    ).resolves.toEqual({ state: "unexpected-error" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [503, "unavailable"],
    [400, "unexpected-error"],
    [502, "unexpected-error"],
  ] as const)("maps HTTP %s to %s", async (status, state) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));

    await expect(
      fetchSameOriginCatalogPage({}, undefined, context(fetch)),
    ).resolves.toEqual({ state });
  });

  it.each([
    [new Response("not json", { status: 200 }), "invalid JSON"],
    [Response.json({ ...page, pageSize: 0 }), "invalid schema"],
  ])("maps %s to an unexpected error", async (response) => {
    const fetch = vi.fn().mockResolvedValue(response);

    await expect(
      fetchSameOriginCatalogPage({}, undefined, context(fetch)),
    ).resolves.toEqual({ state: "unexpected-error" });
  });

  it("propagates an intentional abort", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("Aborted", "AbortError");
    });

    await expect(
      fetchSameOriginCatalogPage({}, controller.signal, context(fetch)),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
