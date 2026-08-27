import { describe, expect, it, vi } from "vitest";

import { loadCatalogDetailPresentation } from "./load-catalog-detail";

import type { CatalogDetail, CatalogId } from "@moya/contracts";

const detail = {
  aliases: [],
  id: "catalog-one" as CatalogId,
  kind: "inscription",
  media: [],
  sourceCitations: [],
  title: "详情",
} satisfies CatalogDetail;

describe("loadCatalogDetailPresentation", () => {
  it("maps a successful source and forwards cancellation", async () => {
    const controller = new AbortController();
    const source = vi.fn().mockResolvedValue({ detail, state: "success" });

    await expect(
      loadCatalogDetailPresentation(
        "catalog-one",
        controller.signal,
        source,
        "qa",
      ),
    ).resolves.toMatchObject({
      detail: { id: "catalog-one", source: "qa" },
      state: "loaded",
    });
    expect(source).toHaveBeenCalledWith("catalog-one", controller.signal);
  });

  it.each(["not-found", "unavailable", "unexpected-error"] as const)(
    "preserves the truthful %s state without fallback or Retry",
    async (state) => {
      await expect(
        loadCatalogDetailPresentation(
          "catalog-one",
          undefined,
          vi.fn().mockResolvedValue({ state }),
        ),
      ).resolves.toEqual({ state });
    },
  );
});
