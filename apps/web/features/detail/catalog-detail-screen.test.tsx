import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CatalogDetailScreen } from "./catalog-detail-screen";

import type { CatalogDetailPresentationState } from "./catalog-detail-presentation";
import type { MediaId } from "@moya/contracts";

const loadedState = {
  detail: {
    aliases: ["别名甲"],
    facts: [{ label: "朝代", value: "唐" }],
    id: "qa-detail-test",
    kind: "inscription",
    media: [
      {
        alt: "竖向测试图",
        height: 1_000,
        id: "media-portrait" as MediaId,
        kind: "image",
        src: "https://media.example.invalid/portrait.jpg",
        width: 600,
      },
      {
        alt: "超宽测试图",
        height: 400,
        id: "media-wide" as MediaId,
        kind: "image",
        src: "https://media.example.invalid/wide.jpg",
        width: 960,
      },
    ],
    periodLabel: "唐代",
    sections: [
      { content: "简介内容", id: "introduction", title: "简介" },
      { content: "释文内容", id: "transcription", title: "释文" },
      {
        content: "历史内容",
        id: "historical-context",
        title: "历史背景",
      },
      {
        content: "研究内容",
        id: "scholarly-research",
        title: "学术研究",
      },
    ],
    source: "qa",
    sourceCitations: [],
    title: "测试碑刻",
  },
  state: "loaded",
} satisfies CatalogDetailPresentationState;

const renderScreen = (state: CatalogDetailPresentationState) =>
  renderToStaticMarkup(
    <CatalogDetailScreen
      activeMediaIndex={0}
      onActiveMediaIndexChange={() => undefined}
      onBack={() => undefined}
      onOpenViewer={() => undefined}
      orientation="landscape"
      platform="tablet"
      state={state}
    />,
  );

describe("CatalogDetailScreen", () => {
  it("keeps Detail identity, facts, Gallery, and four reading sections separate", () => {
    const markup = renderScreen(loadedState);

    expect(markup).toContain('data-detail-composition="tablet-landscape"');
    expect(markup).toContain('data-gallery-count="2"');
    expect(markup).toContain('data-gallery-span="full"');
    for (const section of [
      "introduction",
      "transcription",
      "historical-context",
      "scholarly-research",
    ]) {
      expect(markup).toContain(`data-detail-section="${section}"`);
    }
    expect(markup).toContain("测试碑刻");
    expect(markup).toContain("别名甲");
    expect(markup).toContain("唐代");
  });

  it("renders truthful lifecycle and no-media states", () => {
    expect(renderScreen({ state: "loading" })).toContain(
      'data-detail-state="loading"',
    );
    expect(renderScreen({ state: "not-found" })).toContain("未找到这项资料");
    expect(renderScreen({ state: "unavailable" })).toContain("请稍后再试");
    expect(renderScreen({ state: "unexpected-error" })).toContain(
      'role="alert"',
    );
    expect(
      renderScreen({
        detail: { ...loadedState.detail, media: [] },
        state: "loaded",
      }),
    ).toContain('data-detail-media-state="missing"');
  });
});
