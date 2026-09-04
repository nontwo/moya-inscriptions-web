import { describe, expect, it } from "vitest";

import { toCatalogDetailPresentation } from "./catalog-detail-presentation";

import type { CatalogDetail, CatalogId, MediaId } from "@moya/contracts";

const completeDetail = {
  aliases: ["别名"],
  county: "县",
  contributors: [
    { name: "第二位撰文者", role: "textAuthor" },
    { name: "书者", role: "calligrapher" },
    { name: "第一位撰文者", role: "textAuthor" },
  ],
  currentCustodian: "现藏单位",
  currentLocation: "现址",
  dateText: "某年",
  description: "简介正文",
  dynasty: "某朝",
  historicalContext: "历史背景正文",
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
  scholarlyResearch: "学术研究正文",
  scriptStyle: "碑额篆书，正文楷书",
  sourceCitations: [
    { label: "旧来源" },
    {
      appliesTo: ["transcription", "historicalContext"],
      citation: "多范围引文",
      label: "分区来源",
      url: "https://example.test/source",
    },
  ],
  summary: "摘要",
  title: "完整详情",
  transcription: "第一行释文\n第二行释文",
} satisfies CatalogDetail;

describe("Catalog Detail presentation", () => {
  it("maps Content V1 in fixed order without repeating period chronology", () => {
    const presentation = toCatalogDetailPresentation(completeDetail, "runtime");

    expect(presentation).toMatchObject({
      facts: [
        { label: "撰文者", value: "第二位撰文者" },
        { label: "书者", value: "书者" },
        { label: "撰文者", value: "第一位撰文者" },
        { label: "书体", value: "碑额篆书，正文楷书" },
        { label: "地区", value: "省 · 府 · 县" },
        { label: "现址", value: "现址" },
        { label: "现藏单位", value: "现藏单位" },
      ],
      sections: [
        { key: "description", text: "简介正文", title: "简介" },
        {
          key: "transcription",
          text: "第一行释文\n第二行释文",
          title: "释文",
        },
        {
          key: "historicalContext",
          text: "历史背景正文",
          title: "历史背景",
        },
        {
          key: "scholarlyResearch",
          text: "学术研究正文",
          title: "学术研究",
        },
      ],
      sourceCitations: [
        { label: "旧来源", scopeLabel: "整体资料" },
        {
          citation: "多范围引文",
          label: "分区来源",
          scopeLabel: "释文、历史背景",
          url: "https://example.test/source",
        },
      ],
      source: "runtime",
      summary: "摘要",
    });
    expect(completeDetail.sourceCitations[0]).not.toHaveProperty("appliesTo");
  });

  it("uses dynasty and dateText only when periodLabel is absent", () => {
    const presentation = toCatalogDetailPresentation(
      {
        aliases: [],
        dateText: "某年",
        dynasty: "某朝",
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
    expect(presentation.facts).toEqual([
      { label: "朝代", value: "某朝" },
      { label: "年代", value: "某年" },
    ]);
    expect(presentation.sections).toEqual([]);
    expect(presentation.source).toBe("qa");
    expect(presentation.sourceCitations).toEqual([]);
  });

  it("omits every absent optional fact and content section", () => {
    const presentation = toCatalogDetailPresentation(
      {
        aliases: [],
        id: "catalog-sparse" as CatalogId,
        kind: "inscription",
        media: [],
        sourceCitations: [
          {
            appliesTo: ["historicalContext"],
            label: "缺失正文仍保留的来源",
          },
        ],
        title: "稀疏详情",
      },
      "runtime",
    );

    expect(presentation.facts).toEqual([]);
    expect(presentation.sections).toEqual([]);
    expect(presentation.sourceCitations).toEqual([
      { label: "缺失正文仍保留的来源", scopeLabel: "历史背景" },
    ]);
  });
});
