import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchServerCatalogPageMock } = vi.hoisted(() => ({
  fetchServerCatalogPageMock: vi.fn(),
}));

vi.mock("../../lib/public-api/server", () => ({
  fetchServerCatalogPage: fetchServerCatalogPageMock,
}));

import { loadHomeCatalogState } from "./load-home-catalog";

import type { CatalogPage } from "@moya/contracts";

const page = (total: number): CatalogPage => ({
  items: [],
  total,
  page: 1,
  pageSize: 20,
  totalPages: total === 0 ? 0 : Math.ceil(total / 20),
});

beforeEach(() => {
  fetchServerCatalogPageMock.mockReset();
});

describe("Home Catalog loader", () => {
  it.each([
    {
      transport: { state: "success", page: page(0) },
      expected: { state: "empty", page: page(0) },
    },
    {
      transport: { state: "success", page: page(21) },
      expected: { state: "populated", page: page(21) },
    },
    {
      transport: { state: "unavailable" },
      expected: { state: "unavailable" },
    },
    {
      transport: { state: "unexpected-error" },
      expected: { state: "unexpected-error" },
    },
  ] as const)(
    "maps $transport.state through the T06-A boundary",
    async (testCase) => {
      fetchServerCatalogPageMock.mockResolvedValue(testCase.transport);

      await expect(loadHomeCatalogState()).resolves.toEqual(testCase.expected);
      expect(fetchServerCatalogPageMock).toHaveBeenCalledOnce();
      expect(fetchServerCatalogPageMock).toHaveBeenCalledWith();
    },
  );
});
