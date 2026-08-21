import { describe, expect, it } from "vitest";

import { deriveCatalogPeriodLabel } from "@moya/api";

describe("Catalog read projections", () => {
  it("derives periodLabel from canonical chronology before legacy fallback", () => {
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "VALUE", value: "唐" },
        dateText: { state: "VALUE", value: "贞观十年" },
        legacyPeriodLabel: "Legacy period",
      }),
    ).toBe("唐 · 贞观十年");
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "VALUE", value: "唐" },
        legacyPeriodLabel: "Legacy period",
      }),
    ).toBe("唐");
    expect(
      deriveCatalogPeriodLabel({
        dateText: { state: "VALUE", value: "贞观十年" },
        legacyPeriodLabel: "Legacy period",
      }),
    ).toBe("贞观十年");
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "UNKNOWN" },
        dateText: { state: "CLEAR" },
        legacyPeriodLabel: "Legacy period",
      }),
    ).toBe("Legacy period");
    expect(
      deriveCatalogPeriodLabel({
        dynasty: { state: "UNSUPPLIED" },
        dateText: { state: "NOT_APPLICABLE" },
      }),
    ).toBeUndefined();
  });
});
