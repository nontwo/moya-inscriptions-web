import { describe, expect, it, vi } from "vitest";

import { fetchCatalogDetail } from "./catalog-detail.js";

const catalogDetail = {
  id: "catalog-001",
  kind: "inscription",
  title: "摩崖碑刻",
  aliases: ["别名"],
  summary: "列表摘要",
  periodLabel: "唐",
  dynasty: "唐",
  dateText: "开元年间",
  province: "河南省",
  currentLocation: "洛阳市",
  currentCustodian: "某博物馆",
  description: "正式简介",
  representativeMedia: {
    id: "media-001",
    kind: "image",
    src: "https://media.example.invalid/catalog-001.jpg",
    alt: "碑刻拓片",
    width: 1200,
    height: 1600,
  },
  media: [],
  sourceCitations: [{ label: "地方志", citation: "卷一" }],
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("Public Catalog detail transport", () => {
  it("encodes a valid CatalogId and preserves a gateway base path", async () => {
    const detail = { ...catalogDetail, id: "碑刻/001" };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(detail));

    const result = await fetchCatalogDetail(
      {
        baseUrl: new URL("https://api.example.invalid/gateway/"),
        fetch: fetchMock,
      },
      detail.id,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/gateway/v1/catalog/%E7%A2%91%E5%88%BB%2F001",
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );
    expect(result).toEqual({ state: "success", detail });
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("cache");
  });

  it("rejects an invalid CatalogId without making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      fetchCatalogDetail(
        {
          baseUrl: new URL("https://api.example.invalid/"),
          fetch: fetchMock,
        },
        "invalid id",
      ),
    ).resolves.toEqual({ state: "not-found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a validated CatalogDetail", async () => {
    await expect(
      fetchCatalogDetail(
        {
          baseUrl: new URL("https://api.example.invalid/"),
          fetch: vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse(catalogDetail)),
        },
        catalogDetail.id,
      ),
    ).resolves.toEqual({ state: "success", detail: catalogDetail });
  });

  it.each([
    [404, "not-found"],
    [503, "unavailable"],
    [500, "unexpected-error"],
  ] as const)("maps HTTP %s to %s", async (status, state) => {
    await expect(
      fetchCatalogDetail(
        {
          baseUrl: new URL("https://api.example.invalid/"),
          fetch: vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response(null, { status })),
        },
        catalogDetail.id,
      ),
    ).resolves.toEqual({ state });
  });

  it.each([
    ["malformed JSON", new Response("{", { status: 200 })],
    ["invalid contract", jsonResponse({ ...catalogDetail, media: undefined })],
    ["wrong identity", jsonResponse({ ...catalogDetail, id: "catalog-002" })],
  ])("rejects a %s response", async (_label, response) => {
    await expect(
      fetchCatalogDetail(
        {
          baseUrl: new URL("https://api.example.invalid/"),
          fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
        },
        catalogDetail.id,
      ),
    ).resolves.toEqual({ state: "unexpected-error" });
  });

  it("maps a network failure to unexpected-error", async () => {
    await expect(
      fetchCatalogDetail(
        {
          baseUrl: new URL("https://api.example.invalid/"),
          fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
        },
        catalogDetail.id,
      ),
    ).resolves.toEqual({ state: "unexpected-error" });
  });
});
