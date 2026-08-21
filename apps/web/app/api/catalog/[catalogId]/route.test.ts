import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchServerCatalogDetailMock } = vi.hoisted(() => ({
  fetchServerCatalogDetailMock: vi.fn(),
}));

vi.mock("../../../../lib/public-api/server", () => ({
  fetchServerCatalogDetail: fetchServerCatalogDetailMock,
}));

import { GET } from "./route";

const detail = {
  id: "catalog-001",
  kind: "inscription" as const,
  title: "云峰山题名",
  aliases: ["云峰题名"],
  description: "公开简介。",
  media: [],
  sourceCitations: [],
};

const request = new Request(
  "http://web.example.invalid/api/catalog/catalog-001",
);

const get = (catalogId = detail.id) =>
  GET(request, { params: Promise.resolve({ catalogId }) });

beforeEach(() => {
  fetchServerCatalogDetailMock.mockReset();
});

describe("same-origin Catalog detail bridge", () => {
  it("returns only validated server detail on success", async () => {
    fetchServerCatalogDetailMock.mockResolvedValue({
      state: "success",
      detail,
    });

    const response = await get("catalog/a&b");

    expect(fetchServerCatalogDetailMock).toHaveBeenCalledWith("catalog/a&b");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(detail);
  });

  it.each([
    ["not-found", 404],
    ["unavailable", 503],
    ["unexpected-error", 502],
  ] as const)(
    "maps %s to HTTP %s without an internal body",
    async (state, status) => {
      fetchServerCatalogDetailMock.mockResolvedValue({ state });

      const response = await get();

      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    },
  );
});
