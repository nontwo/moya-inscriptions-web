import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CatalogDetailScreen } from "./catalog-detail-screen";

const renderState = (
  state: Parameters<typeof CatalogDetailScreen>[0]["state"],
) =>
  renderToStaticMarkup(
    <CatalogDetailScreen
      activeMediaIndex={0}
      backButtonRef={createRef<HTMLButtonElement>()}
      onActiveMediaIndexChange={vi.fn()}
      onBack={vi.fn()}
      onOpenViewer={vi.fn()}
      orientation="portrait"
      platform="phone"
      state={state}
    />,
  );

describe("CatalogDetailScreen", () => {
  it.each([
    ["not-found", "未找到这项资料"],
    ["unavailable", "资料服务当前不可用"],
    ["unexpected-error", "发生了未预期的错误"],
  ] as const)(
    "renders truthful %s state with Back and no Retry",
    (state, copy) => {
      const markup = renderState({ state });
      expect(markup).toContain(copy);
      expect(markup).toContain('aria-label="返回"');
      expect(markup).not.toContain("重试");
    },
  );

  it("renders approved Content V1 sections and citation scopes once in order", () => {
    const markup = renderState({
      detail: {
        aliases: ["别名"],
        facts: [
          { label: "撰文者", value: "撰文者甲" },
          { label: "书者", value: "书者乙" },
          { label: "书体", value: "楷书" },
        ],
        id: "complete-content",
        kind: "inscription",
        media: [],
        periodLabel: "唐",
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
        source: "runtime",
        sourceCitations: [
          { label: "旧来源", scopeLabel: "整体资料" },
          {
            citation: "多范围引文",
            label: "分区来源",
            scopeLabel: "释文、历史背景",
          },
        ],
        summary: "标题摘要只出现一次",
        title: "完整内容",
      },
      state: "loaded",
    });

    expect(markup.match(/标题摘要只出现一次/gu)).toHaveLength(1);
    expect(markup).toContain("第一行释文\n第二行释文");
    expect(markup.match(/旧来源/gu)).toHaveLength(1);
    expect(markup).toContain("适用于：整体资料");
    expect(markup).toContain("适用于：释文、历史背景");
    const orderedSections = [
      'data-detail-section="description"',
      'data-detail-section="transcription"',
      'data-detail-section="historicalContext"',
      'data-detail-section="scholarlyResearch"',
      'data-detail-section="sources"',
    ];
    for (let index = 1; index < orderedSections.length; index += 1) {
      expect(markup.indexOf(orderedSections[index] ?? "")).toBeGreaterThan(
        markup.indexOf(orderedSections[index - 1] ?? ""),
      );
    }
  });

  it("renders the truthful sparse no-media state without absent sections", () => {
    const markup = renderState({
      detail: {
        aliases: [],
        facts: [],
        id: "no-media",
        kind: "inscription",
        media: [],
        sections: [],
        source: "qa",
        sourceCitations: [],
        title: "无图资料",
      },
      state: "loaded",
    });

    expect(markup).toContain('data-detail-media-state="missing"');
    expect(markup).toContain("暂无公开图像");
    expect(markup).not.toMatch(
      /简介|释文|历史背景|学术研究|transcription|Viewer|Gallery/u,
    );
  });
});
