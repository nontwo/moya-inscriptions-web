import { describe, expect, it, vi } from "vitest";

import { toHomeCatalogState } from "./catalog-state.js";

import type { CatalogPage } from "@moya/contracts";

const page = (
  total: number,
  items: CatalogPage["items"] = [],
): CatalogPage => ({
  items,
  total,
  page: 1,
  pageSize: 20,
  totalPages: total === 0 ? 0 : Math.ceil(total / 20),
});

describe("T06 Home Catalog state", () => {
  it("maps a zero-total Catalog to empty", () => {
    const catalogPage = page(0);

    expect(toHomeCatalogState({ state: "success", page: catalogPage })).toEqual(
      { state: "empty", page: catalogPage },
    );
  });

  it("maps a positive-total Catalog to populated even when this page has no items", () => {
    const catalogPage = page(21);

    expect(toHomeCatalogState({ state: "success", page: catalogPage })).toEqual(
      { state: "populated", page: catalogPage },
    );
  });

  it.each(["unavailable", "unexpected-error"] as const)(
    "preserves the %s transport state",
    (state) => {
      expect(toHomeCatalogState({ state })).toEqual({ state });
    },
  );

  it("is pure and performs no HTTP request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    toHomeCatalogState({ state: "success", page: page(0) });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
