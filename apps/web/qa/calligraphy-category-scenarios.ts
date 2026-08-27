import type { CatalogPage, CatalogSummary } from "@moya/contracts";
import type {
  CalligraphyCategoryState,
  CalligraphyCategorySurfaceData,
  ClassifiedCalligraphyCategory,
} from "../features/calligraphy/calligraphy-category";
import type { HomeCatalogState } from "../features/home/catalog-state";

/*
 * This map is explicit synthetic QA scenario ownership. It is not derived from
 * any Catalog field and must never be imported by formal runtime composition.
 */
export const syntheticQaCalligraphyCategories: Readonly<
  Record<string, ClassifiedCalligraphyCategory>
> = {
  "qa-scenario-calligraphy-no-media": "ink",
  "qa-visual-calligraphy-01": "ink",
  "qa-visual-calligraphy-02": "ink",
  "qa-visual-calligraphy-03": "ink",
  "qa-visual-calligraphy-04": "ink",
  "qa-visual-calligraphy-05": "ink",
  "qa-visual-calligraphy-06": "ink",
  "qa-visual-calligraphy-07": "rubbing",
  "qa-visual-calligraphy-08": "rubbing",
  "qa-visual-calligraphy-09": "rubbing",
  "qa-visual-calligraphy-10": "rubbing",
  "qa-visual-calligraphy-11": "rubbing",
  "qa-visual-calligraphy-12": "rubbing",
};

const categoryPage = (
  page: CatalogPage,
  category: ClassifiedCalligraphyCategory,
): CatalogPage => {
  const items = page.items.filter(
    ({ id }) => syntheticQaCalligraphyCategories[id] === category,
  );
  return {
    ...page,
    items,
    page: 1,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
  };
};

const categoryState = (
  state: HomeCatalogState,
  category: ClassifiedCalligraphyCategory,
): CalligraphyCategoryState => {
  if (state.state !== "populated") return state;
  const page = categoryPage(state.page, category);
  return page.total === 0
    ? { page, state: "empty" }
    : { page, state: "populated" };
};

export const createQaCalligraphyCategorySurface = (
  all: HomeCatalogState,
): CalligraphyCategorySurfaceData => ({
  categories: {
    all,
    ink: categoryState(all, "ink"),
    rubbing: categoryState(all, "rubbing"),
  },
  classificationSource: "qa-synthetic",
});

export const classifiedSyntheticQaCalligraphyItems = (
  items: readonly CatalogSummary[],
  category: ClassifiedCalligraphyCategory,
) =>
  items.filter(({ id }) => syntheticQaCalligraphyCategories[id] === category);
