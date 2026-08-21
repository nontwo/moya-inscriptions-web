import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => vi.unstubAllEnvs());

describe("Catalog detail page", () => {
  it("loads the detail at request time and renders validated success", async () => {
    fetchServerCatalogDetailMock.mockResolvedValue({
      state: "success",
      detail,
    });

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

  it("keeps QA presentation disabled in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MOYA_CATALOG_DETAIL_QA", "1");
    fetchServerCatalogDetailMock.mockResolvedValue({
      state: "success",
      detail,
    });

    const page = await CatalogDetailPage({
      params: Promise.resolve({ catalogId: "catalog-001" }),
    });

    expect(renderToStaticMarkup(page)).not.toContain("释文");
  });

  it.each([
    ["unavailable", "暂时无法加载资料"],
    ["unexpected-error", "暂时无法显示此页面"],
  ] as const)("renders the %s state", async (state, text) => {
    fetchServerCatalogDetailMock.mockResolvedValue({ state });

    const page = await CatalogDetailPage({
      params: Promise.resolve({ catalogId: "catalog-001" }),
    });

    expect(renderToStaticMarkup(page)).toContain(text);
  });
});
