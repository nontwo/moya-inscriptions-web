import { describe, expect, it } from "vitest";

import {
  createDevelopmentHomeData,
  createDevelopmentHomeScenario,
} from "./home-scenarios";

import type { CatalogId, CatalogSummary } from "@moya/contracts";

const catalogRecord: CatalogSummary = {
  aliases: [],
  id: "catalog-development-source" as CatalogId,
  kind: "inscription",
  title: "开发期 Catalog 条目",
};

describe("Development Home sources", () => {
  it("composes bounded Nearby DEMO identities and both explicit Topic kinds", () => {
    const data = createDevelopmentHomeData("http://localhost:3100", {
      items: [catalogRecord],
      state: "populated",
    });

    expect(data.nearby.state).toBe("populated");
    if (data.nearby.state === "populated") {
      expect(data.nearby.items).toHaveLength(10);
      expect(
        data.nearby.items.every(({ id }) => id.startsWith("nearby-demo-")),
      ).toBe(true);
      expect(data.nearby.items.some(({ id }) => id === catalogRecord.id)).toBe(
        false,
      );
    }

    expect(data.topics.state).toBe("populated");
    if (data.topics.state === "populated") {
      expect(new Set(data.topics.items.map(({ kind }) => kind))).toEqual(
        new Set(["editorialTopic", "catalogCollection"]),
      );
      const collection = data.topics.items.find(
        ({ kind }) => kind === "catalogCollection",
      );
      expect(collection?.kind).toBe("catalogCollection");
      if (collection?.kind === "catalogCollection") {
        expect(collection.records.map(({ id }) => id)).toEqual([
          catalogRecord.id,
        ]);
      }
    }
  });

  it("keeps unavailable and long-block scenarios explicit and bounded", () => {
    const unavailable = createDevelopmentHomeScenario(
      "nearby-unavailable",
      "http://localhost:3100",
      [catalogRecord],
    );
    expect(unavailable.data.nearby).toEqual({ state: "unavailable" });

    const longBlocks = createDevelopmentHomeScenario(
      "topic-long-blocks",
      "http://localhost:3100",
      [catalogRecord],
    );
    expect(longBlocks.initialFeed).toBe("topics");
    expect(longBlocks.initialTopicId).toBe("topic-cliff-paths");
    if (longBlocks.data.topics.state === "populated") {
      const topic = longBlocks.data.topics.items.find(
        ({ id }) => id === longBlocks.initialTopicId,
      );
      expect(topic?.kind).toBe("editorialTopic");
      if (topic?.kind === "editorialTopic") {
        expect(topic.blocks.map(({ type }) => type)).toEqual([
          "lead",
          "image",
          "rich-text",
          "quote",
          "video",
        ]);
      }
    }
  });
});
