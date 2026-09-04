import { describe, expect, it } from "vitest";

import { deriveCatalogPeriodLabel } from "@moya/api";

describe("Catalog read projections", () => {
  it("prefers an explicit stored periodLabel before deriving chronology", () => {
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "VALUE", value: "唐" },
        dateText: { state: "VALUE", value: "贞观十年" },
        storedPeriodLabel: "唐贞观十年（636）",
      }),
    ).toBe("唐贞观十年（636）");
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "VALUE", value: "唐" },
        dateText: { state: "VALUE", value: "贞观十年" },
      }),
    ).toBe("唐 · 贞观十年");
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "VALUE", value: "唐" },
      }),
    ).toBe("唐");
    expect(
      deriveCatalogPeriodLabel({
        dateText: { state: "VALUE", value: "贞观十年" },
      }),
    ).toBe("贞观十年");
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "UNKNOWN" },
        dateText: { state: "CLEAR" },
      }),
    ).toBeUndefined();
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "UNSUPPLIED" },
        dateText: { state: "NOT_APPLICABLE" },
      }),
    ).toBeUndefined();
  });
});
