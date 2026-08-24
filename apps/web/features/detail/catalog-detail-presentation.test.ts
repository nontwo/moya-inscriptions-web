import { describe, expect, it } from "vitest";

import { toRuntimeCatalogDetailPresentation } from "./catalog-detail-presentation";

import type { CatalogDetail, CatalogId } from "@moya/contracts";

const detail = (overrides: Partial<CatalogDetail> = {}): CatalogDetail => ({
  aliases: ["云峰刻石"],
  id: "catalog-runtime-001" as CatalogId,
  kind: "inscription",
  media: [],
  sourceCitations: [],
  title: "云峰山刻石",
  ...overrides,
});

describe("toRuntimeCatalogDetailPresentation", () => {
  it("maps formal fields without redefining summary as introduction", () => {
    const presentation = toRuntimeCatalogDetailPresentation(
      detail({
        currentLocation: "山东莱州",
        dateText: "北魏永平年间",
        description: "正式简介",
        dynasty: "北魏",
        periodLabel: "北魏",
        province: "山东",
        summary: "列表摘要不得进入详情简介",
      }),
      "production",
    );

    expect(presentation.source).toBe("runtime");
    expect(presentation.facts).toEqual(
      expect.arrayContaining([
        { label: "朝代", value: "北魏" },
        { label: "年代", value: "北魏永平年间" },
        { label: "地区", value: "山东" },
        { label: "现址", value: "山东莱州" },
      ]),
    );
    expect(presentation.sections).toEqual([
      { content: "正式简介", id: "introduction", title: "简介" },
    ]);
    expect(JSON.stringify(presentation)).not.toContain(
      "列表摘要不得进入详情简介",
    );
  });

  it("keeps all four required reading sections separate in Development", () => {
    const presentation = toRuntimeCatalogDetailPresentation(
      detail({ description: "正式简介" }),
      "development",
    );

    expect(presentation.sections.map(({ id }) => id)).toEqual([
      "introduction",
      "transcription",
      "historical-context",
      "scholarly-research",
      "explanation",
    ]);
    expect(presentation.sections[0]).toEqual({
      content: "正式简介",
      id: "introduction",
      title: "简介",
    });
    expect(
      presentation.sections.slice(1).every(({ placeholder }) => placeholder),
    ).toBe(true);
    expect(presentation.factsPlaceholder).toBe("资料待接入");
    expect(presentation.sourcesPlaceholder).toBe("内容待接入");
  });

  it("omits every missing optional section and placeholder in Production", () => {
    const presentation = toRuntimeCatalogDetailPresentation(
      detail(),
      "production",
    );

    expect(presentation.sections).toEqual([]);
    expect(presentation.factsPlaceholder).toBeUndefined();
    expect(presentation.sourcesPlaceholder).toBeUndefined();
    expect(JSON.stringify(presentation)).not.toContain("待接入");
  });

  it("never supplies QA media to a truthful no-media runtime record", () => {
    const presentation = toRuntimeCatalogDetailPresentation(
      detail({ media: [], representativeMedia: undefined }),
      "development",
    );

    expect(presentation.media).toEqual([]);
  });
});
