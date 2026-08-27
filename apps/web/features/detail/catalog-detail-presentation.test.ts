import { describe, expect, it } from "vitest";

import { toCatalogDetailPresentation } from "./catalog-detail-presentation";

import type { CatalogDetail, CatalogId, MediaId } from "@moya/contracts";

const completeDetail = {
  aliases: ["别名"],
  county: "县",
  currentCustodian: "现藏单位",
  currentLocation: "现址",
  dateText: "某年",
  description: "当前 Contract 的说明文字",
  dynasty: "某朝",
  id: "catalog-complete" as CatalogId,
  kind: "inscription",
  media: [
    {
      alt: "详情图像",
      height: 600,
      id: "media-detail" as MediaId,
      kind: "image",
      src: "https://example.test/detail.jpg",
      width: 400,
    },
  ],
  periodLabel: "时期",
  prefecture: "府",
  province: "省",
  sourceCitations: [{ label: "来源" }],
  summary: "摘要",
  title: "完整详情",
} satisfies CatalogDetail;

describe("Catalog Detail presentation", () => {
  it("maps only current CatalogDetail Contract fields", () => {
    const presentation = toCatalogDetailPresentation(completeDetail, "runtime");

    expect(presentation).toMatchObject({
      description: "当前 Contract 的说明文字",
      facts: [
        { label: "朝代", value: "某朝" },
        { label: "年代", value: "某年" },
        { label: "地区", value: "省 · 府 · 县" },
        { label: "现址", value: "现址" },
        { label: "保管 / 现藏单位", value: "现藏单位" },
      ],
      source: "runtime",
      summary: "摘要",
    });
    expect(presentation).not.toHaveProperty("sections");
    expect(JSON.stringify(presentation)).not.toMatch(
      /transcription|historicalContext|scholarlyResearch|explanation/u,
    );
  });

  it("falls back to representativeMedia without inventing missing content", () => {
    const presentation = toCatalogDetailPresentation(
      {
        aliases: [],
        id: "catalog-partial" as CatalogId,
        kind: "calligraphy",
        media: [],
        representativeMedia: completeDetail.media[0],
        sourceCitations: [],
        title: "部分详情",
      },
      "qa",
    );

    expect(presentation.media).toEqual(completeDetail.media);
    expect(presentation.facts).toEqual([]);
    expect(presentation.source).toBe("qa");
    expect(presentation).not.toHaveProperty("description");
  });
});
