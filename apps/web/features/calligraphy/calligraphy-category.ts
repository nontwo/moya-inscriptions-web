import type { HomeCatalogState } from "../home/catalog-state";

export const calligraphyCategories = ["all", "ink", "rubbing"] as const;

export type CalligraphyCategory = (typeof calligraphyCategories)[number];
export type ClassifiedCalligraphyCategory = Exclude<CalligraphyCategory, "all">;

export type CalligraphyCategoryState =
  HomeCatalogState | { readonly state: "classification-unavailable" };

export interface CalligraphyCategorySurfaceData {
  readonly categories: {
    readonly all: HomeCatalogState;
    readonly ink: CalligraphyCategoryState;
    readonly rubbing: CalligraphyCategoryState;
  };
  readonly classificationSource: "qa-synthetic" | "runtime-unclassified";
}

export const createRuntimeCalligraphyCategorySurface = (
  all: HomeCatalogState,
): CalligraphyCategorySurfaceData => ({
  categories: {
    all,
    ink: { state: "classification-unavailable" },
    rubbing: { state: "classification-unavailable" },
  },
  classificationSource: "runtime-unclassified",
});
