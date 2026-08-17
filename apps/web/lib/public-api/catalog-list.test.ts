import { describe, expect, it, vi } from "vitest";

import { fetchCatalogPage } from "./catalog-list.js";

const populatedPage = {
  items: [
    {
      id: "catalog-001",
      kind: "inscription",
      title: "摩崖碑刻",
      aliases: ["别名"],
      summary: "公开摘要",
      periodLabel: "唐",
      representativeMedia: {
        id: "media-001",
        kind: "image",
        src: "https://media.example.invalid/catalog-001.jpg",
        alt: "碑刻拓片",
        width: 1200,
        height: 1600,
      },
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("Public Catalog list transport", () => {
  it("constructs the default request without freezing a cache policy", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(populatedPage));

    await fetchCatalogPage({
      baseUrl: new URL("https://api.example.invalid/"),
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/v1/catalog",
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("cache");
  });

  it("preserves a base path and constructs approved query parameters deterministically", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(populatedPage));

    await fetchCatalogPage(
      {
        baseUrl: new URL("https://gateway.example.invalid/api/"),
        fetch: fetchMock,
      },
      { kind: "inscription", page: "2", pageSize: "10" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.invalid/api/v1/catalog?kind=inscription&page=2&pageSize=10",
      expect.any(Object),
    );
  });

  it("rejects invalid outgoing query values without making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const result = await fetchCatalogPage(
      {
        baseUrl: new URL("https://api.example.invalid/"),
        fetch: fetchMock,
      },
      { pageSize: "101" },
    );

    expect(result).toEqual({ state: "unexpected-error" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a validated populated Public Catalog page", async () => {
    const result = await fetchCatalogPage({
      baseUrl: new URL("https://api.example.invalid/"),
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(populatedPage)),
    });

    expect(result).toEqual({ state: "success", page: populatedPage });
  });

  it("returns an empty Catalog page as transport success", async () => {
    const emptyPage = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    };

    const result = await fetchCatalogPage({
      baseUrl: new URL("https://api.example.invalid/"),
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(emptyPage)),
    });

    expect(result).toEqual({ state: "success", page: emptyPage });
  });

  it("keeps an out-of-range empty page with a positive total as transport success", async () => {
    const outOfRangePage = {
      items: [],
      total: 21,
      page: 3,
      pageSize: 10,
      totalPages: 3,
    };

    const result = await fetchCatalogPage({
      baseUrl: new URL("https://api.example.invalid/"),
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(outOfRangePage)),
    });

    expect(result).toEqual({ state: "success", page: outOfRangePage });
  });

  it.each([
    ["malformed JSON", new Response("{", { status: 200 })],
    [
      "invalid page invariants",
      jsonResponse({ ...populatedPage, totalPages: 2 }),
    ],
    [
      "private storage fields",
      jsonResponse({
        ...populatedPage,
        items: [
          {
            ...populatedPage.items[0],
            representativeMedia: {
              ...populatedPage.items[0]?.representativeMedia,
              object_key: "private/catalog-001.jpg",
            },
          },
        ],
      }),
    ],
  ])("classifies %s as an unexpected response", async (_label, response) => {
    const result = await fetchCatalogPage({
      baseUrl: new URL("https://api.example.invalid/"),
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
    });

    expect(result).toEqual({ state: "unexpected-error" });
  });

  it("classifies HTTP 503 as unavailable without trusting its body", async () => {
    const result = await fetchCatalogPage({
      baseUrl: new URL("https://api.example.invalid/"),
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("upstream unavailable", { status: 503 }),
        ),
    });

    expect(result).toEqual({ state: "unavailable" });
  });

  it("classifies other HTTP failures as unexpected", async () => {
    const result = await fetchCatalogPage({
      baseUrl: new URL("https://api.example.invalid/"),
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ error: "failure" }, 500)),
    });

    expect(result).toEqual({ state: "unexpected-error" });
  });

  it.each([
    new TypeError("network failed"),
    new DOMException("request aborted", "AbortError"),
  ])("classifies fetch rejection as unexpected", async (error) => {
    const result = await fetchCatalogPage({
      baseUrl: new URL("https://api.example.invalid/"),
      fetch: vi.fn<typeof fetch>().mockRejectedValue(error),
    });

    expect(result).toEqual({ state: "unexpected-error" });
  });
});
