import { describe, expect, it, vi } from "vitest";

import { fetchCatalogDetail } from "./catalog-detail.js";

const detail = {
  id: "catalog-001",
  kind: "inscription",
  title: "云峰山题名",
  aliases: ["云峰题名"],
  summary: "公开摘要",
  periodLabel: "北魏",
  dynasty: "北魏",
  dateText: "永平年间",
  province: "山东",
  prefecture: "泰安",
  currentLocation: "云峰山崖壁",
  currentCustodian: "云峰山文保所",
  description: "公开简介。",
  representativeMedia: {
    id: "media-001",
    kind: "image",
    src: "https://media.example.invalid/catalog-001.jpg",
    alt: "云峰山题名图像",
    width: 1200,
    height: 1600,
  },
  media: [
    {
      id: "media-001",
      kind: "image",
      src: "https://media.example.invalid/catalog-001.jpg",
      alt: "云峰山题名图像",
      width: 1200,
      height: 1600,
    },
  ],
  sourceCitations: [{ label: "公开资料", citation: "卷一。" }],
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("Public Catalog detail transport", () => {
  it("constructs an encoded detail request without freezing a cache policy", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ...detail, id: "catalog/001" }));

    await fetchCatalogDetail(
      {
        baseUrl: new URL("https://api.example.invalid/"),
        fetch: fetchMock,
      },
      "catalog/001",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.invalid/v1/catalog/catalog%2F001",
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("cache");
  });

  it("preserves a configured API path prefix", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(detail));

    await fetchCatalogDetail(
      {
        baseUrl: new URL("https://gateway.example.invalid/api/"),
        fetch: fetchMock,
      },
      detail.id,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example.invalid/api/v1/catalog/catalog-001",
      expect.any(Object),
    );
  });

  it("returns a validated CatalogDetail", async () => {
    await expect(
      fetchCatalogDetail(
        {
          baseUrl: new URL("https://api.example.invalid/"),
          fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(detail)),
        },
        detail.id,
      ),
    ).resolves.toEqual({ state: "success", detail });
  });

  it("returns not-found without fetching for an invalid ID", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    await expect(
      fetchCatalogDetail(
        { baseUrl: new URL("https://api.example.invalid/"), fetch: fetchMock },
        "",
      ),
    ).resolves.toEqual({ state: "not-found" });
    expect(fetchMock).not.toHaveBeenCalled();
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
        detail.id,
      ),
    ).resolves.toEqual({ state });
  });

  it.each([
    new Response("{", { status: 200 }),
    jsonResponse({
      ...detail,
      media: [{ ...detail.media[0], objectKey: "private" }],
    }),
  ])(
    "maps malformed successful responses to unexpected-error",
    async (response) => {
      await expect(
        fetchCatalogDetail(
          {
            baseUrl: new URL("https://api.example.invalid/"),
            fetch: vi.fn<typeof fetch>().mockResolvedValue(response),
          },
          detail.id,
        ),
      ).resolves.toEqual({ state: "unexpected-error" });
    },
  );

  it("maps network failures to unexpected-error", async () => {
    await expect(
      fetchCatalogDetail(
        {
          baseUrl: new URL("https://api.example.invalid/"),
          fetch: vi
            .fn<typeof fetch>()
            .mockRejectedValue(new TypeError("offline")),
        },
        detail.id,
      ),
    ).resolves.toEqual({ state: "unexpected-error" });
  });
});
