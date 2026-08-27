import { describe, expect, it } from "vitest";

import {
  createQaCalligraphyCategorySurface,
  syntheticQaCalligraphyCategories,
} from "./calligraphy-category-scenarios";

import type { CatalogId, CatalogPage, CatalogSummary } from "@moya/contracts";
import type { HomeCatalogState } from "../features/home/catalog-state";

const item = (id: string): CatalogSummary => ({
  aliases: [],
  id: id as CatalogId,
  kind: "calligraphy",
  title: `${id}（视觉 QA 合成）`,
});

const populated = (items: CatalogSummary[]): HomeCatalogState => ({
  page: {
    items,
    page: 1,
    pageSize: 24,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  } satisfies CatalogPage,
  state: "populated",
});

describe("synthetic Calligraphy category scenarios", () => {
  it("uses only the explicit QA map while keeping all item identities unchanged", () => {
    const items = [
      item("qa-visual-calligraphy-01"),
      item("qa-visual-calligraphy-07"),
      item("qa-unclassified-synthetic-calligraphy"),
    ];
    const data = createQaCalligraphyCategorySurface(populated(items));

    expect(data.classificationSource).toBe("qa-synthetic");
    expect(data.categories.all).toMatchObject({
      page: { items },
      state: "populated",
    });
    expect(data.categories.ink).toMatchObject({
      page: { items: [items[0]], total: 1 },
      state: "populated",
    });
    expect(data.categories.rubbing).toMatchObject({
      page: { items: [items[1]], total: 1 },
      state: "populated",
    });
    expect(syntheticQaCalligraphyCategories).not.toHaveProperty(
      "qa-unclassified-synthetic-calligraphy",
    );
  });

  it("propagates transport truth instead of inventing classified records", () => {
    expect(
      createQaCalligraphyCategorySurface({ state: "unavailable" }),
    ).toMatchObject({
      categories: {
        all: { state: "unavailable" },
        ink: { state: "unavailable" },
        rubbing: { state: "unavailable" },
      },
    });
  });
});
