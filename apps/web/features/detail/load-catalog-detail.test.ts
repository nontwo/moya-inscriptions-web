import { describe, expect, it, vi } from "vitest";

import { loadCatalogDetailPresentation } from "./load-catalog-detail";

import type { CatalogDetail, CatalogId } from "@moya/contracts";

const runtimeDetail = {
  aliases: [],
  id: "runtime-detail" as CatalogId,
  kind: "inscription",
  media: [],
  sourceCitations: [],
  title: "运行时详情",
} satisfies CatalogDetail;

describe("loadCatalogDetailPresentation", () => {
  it("maps a successful Public response", async () => {
    const source = vi.fn().mockResolvedValue({
      detail: runtimeDetail,
      state: "success",
    });

    await expect(
      loadCatalogDetailPresentation("runtime-detail", "production", source),
    ).resolves.toMatchObject({
      detail: { id: "runtime-detail", source: "runtime" },
      state: "loaded",
    });
    expect(source).toHaveBeenCalledWith("runtime-detail");
  });

  it.each(["not-found", "unavailable", "unexpected-error"] as const)(
    "preserves the truthful %s lifecycle without QA fallback",
    async (state) => {
      await expect(
        loadCatalogDetailPresentation(
          "runtime-detail",
          "development",
          vi.fn().mockResolvedValue({ state }),
        ),
      ).resolves.toEqual({ state });
    },
  );
});
