import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectionMock } = vi.hoisted(() => ({ connectionMock: vi.fn() }));
const { notFoundMock } = vi.hoisted(() => ({ notFoundMock: vi.fn() }));
const { fetchServerCatalogDetailMock } = vi.hoisted(() => ({
  fetchServerCatalogDetailMock: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: connectionMock }));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("../../../lib/public-api/server", () => ({
  fetchServerCatalogDetail: fetchServerCatalogDetailMock,
}));

import CatalogDetailPage from "./page";

const detail = {
  id: "catalog-001",
  kind: "inscription",
  title: "公开碑刻",
  aliases: [],
  media: [],
  sourceCitations: [],
};

beforeEach(() => {
  connectionMock.mockReset();
  notFoundMock.mockReset();
  fetchServerCatalogDetailMock.mockReset();
  connectionMock.mockResolvedValue(undefined);
  notFoundMock.mockImplementation(() => {
    throw new Error("not-found");
  });
});

describe("Catalog detail page", () => {
  it("loads the detail at request time and renders validated success", async () => {
    fetchServerCatalogDetailMock.mockResolvedValue({ state: "success", detail });

    const page = await CatalogDetailPage({
      params: Promise.resolve({ catalogId: "catalog-001" }),
    });

    expect(connectionMock).toHaveBeenCalledOnce();
    expect(fetchServerCatalogDetailMock).toHaveBeenCalledWith("catalog-001");
    expect(renderToStaticMarkup(page)).toContain("公开碑刻");
  });

  it("delegates a missing detail to Next notFound", async () => {
    fetchServerCatalogDetailMock.mockResolvedValue({ state: "not-found" });

    await expect(
      CatalogDetailPage({ params: Promise.resolve({ catalogId: "missing" }) }),
    ).rejects.toThrow("not-found");
    expect(notFoundMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["unavailable", "档案服务暂时不可用"],
    ["unexpected-error", "无法加载这项资料"],
  ] as const)("renders the %s state", async (state, text) => {
    fetchServerCatalogDetailMock.mockResolvedValue({ state });

    const page = await CatalogDetailPage({
      params: Promise.resolve({ catalogId: "catalog-001" }),
    });

    expect(renderToStaticMarkup(page)).toContain(text);
  });
});
