import { describe, expect, it } from "vitest";

import { createQaCatalogDetails } from "./detail-catalog-scenarios";
import { createVisualCatalogItems } from "./home-catalog-scenarios";

describe("Catalog Detail QA scenarios", () => {
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

  it("covers one complete synthetic Content V1 record plus existing media states", () => {
    const details = createQaCatalogDetails("http://127.0.0.1:3100");
    const complete = details.find(
      ({ id }) => id === "qa-visual-inscription-01",
    );

    expect(complete).toMatchObject({
      contributors: [
        { name: "QA 合成撰文者", role: "textAuthor" },
        { name: "QA 合成书者", role: "calligrapher" },
      ],
      historicalContext:
        "这是仅用于 Development QA 的合成历史背景，不代表真实碑刻事实。",
      scholarlyResearch:
        "这是仅用于 Development QA 的合成学术研究，不代表真实研究结论。",
      scriptStyle: "QA 合成书体说明，不代表真实书体判断",
      sourceCitations: [
        { label: "QA 合成旧来源" },
        {
          appliesTo: ["transcription", "historicalContext"],
          label: "QA 合成分区来源",
        },
      ],
    });
    expect(complete?.transcription).toContain(
      "第一行：Development QA 合成释文。\n第二行：不代表真实碑刻事实。\n第三行：不得进入 Production。",
    );
    expect(details.some(({ media }) => media.length === 0)).toBe(true);
    expect(details.some(({ media }) => media.length > 1)).toBe(true);
  });
});
