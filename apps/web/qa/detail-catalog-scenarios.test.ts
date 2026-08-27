import { describe, expect, it } from "vitest";

import { createQaCatalogDetails } from "./detail-catalog-scenarios";
import { createVisualCatalogItems } from "./home-catalog-scenarios";

describe("MIG-D1 Catalog Detail QA scenarios", () => {
  it("keeps QA identity aligned to each current-Contract Catalog record", () => {
    const details = createQaCatalogDetails("http://127.0.0.1:3100");
    const summaries = createVisualCatalogItems("http://127.0.0.1:3100");

    expect(details).toHaveLength(summaries.length);
    for (const detail of details) {
      const summary = summaries.find(({ id }) => id === detail.id);
      expect(summary).toBeDefined();
      expect(detail).toMatchObject({
        id: summary?.id,
        kind: summary?.kind,
        title: summary?.title,
      });
    }
  });

  it("covers no-media and multiple-media states without a future content model", () => {
    const details = createQaCatalogDetails("http://127.0.0.1:3100");
    expect(details.some(({ media }) => media.length === 0)).toBe(true);
    expect(details.some(({ media }) => media.length > 1)).toBe(true);
    expect(JSON.stringify(details)).not.toMatch(
      /transcription|historicalContext|scholarlyResearch|explanation/u,
    );
  });
});
