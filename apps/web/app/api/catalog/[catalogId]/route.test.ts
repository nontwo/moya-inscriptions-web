import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchServerCatalogDetailMock } = vi.hoisted(() => ({
  fetchServerCatalogDetailMock: vi.fn(),
}));

vi.mock("../../../../lib/public-api/server", () => ({
  fetchServerCatalogDetail: fetchServerCatalogDetailMock,
}));

import { GET } from "./route";

const request = new Request("http://localhost/api/catalog/catalog-001");
const context = (catalogId: string) => ({
  params: Promise.resolve({ catalogId }),
});

beforeEach(() => {
  fetchServerCatalogDetailMock.mockReset();
});

describe("same-origin Catalog Detail bridge", () => {
  it("returns validated Public Detail JSON", async () => {
    const detail = {
      id: "catalog-001",
      kind: "inscription",
      title: "真实碑刻",
      aliases: [],
      sourceCitations: [],
      media: [],
    };
    fetchServerCatalogDetailMock.mockResolvedValue({
      state: "success",
      detail,
    });

    const response = await GET(request, context(detail.id));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(detail);
    expect(fetchServerCatalogDetailMock).toHaveBeenCalledWith(detail.id);
  });

  it.each([
    ["not-found", 404],
    ["unavailable", 503],
    ["unexpected-error", 502],
  ] as const)("maps %s without exposing internals", async (state, status) => {
    fetchServerCatalogDetailMock.mockResolvedValue({ state });

    const response = await GET(request, context("catalog-001"));

    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
  });
});
