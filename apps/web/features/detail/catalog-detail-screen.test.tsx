import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { CatalogDetailScreen } from "./catalog-detail-screen";

import type { ReactNode } from "react";
import type { PresentationPlatform } from "../shell/device-platform";

const renderState = (
  state: Parameters<typeof CatalogDetailScreen>[0]["state"],
  commentSection?: ReactNode,
  platform: PresentationPlatform = "phone",
  orientation: "landscape" | "portrait" = "portrait",
) =>
  renderToStaticMarkup(
    <CatalogDetailScreen
      activeMediaIndex={0}
      backButtonRef={createRef<HTMLButtonElement>()}
      commentSection={commentSection}
      onActiveMediaIndexChange={vi.fn()}
      onBack={vi.fn()}
      onOpenViewer={vi.fn()}
      orientation={orientation}
      platform={platform}
      state={state}
    />,
  );

describe("CatalogDetailScreen", () => {
  it("mounts an injected comment section only for a loaded Detail", () => {
    const comments = <section data-comment-section="">comments</section>;
    expect(renderState({ state: "loading" }, comments)).not.toContain(
      "data-comment-section",
    );
    expect(
      renderState(
        {
          detail: {
            aliases: [],
            facts: [],
            id: "with-comments",
            kind: "inscription",
            media: [],
            sections: [],
            source: "qa",
            sourceCitations: [],
            title: "评论挂载测试",
          },
          state: "loaded",
        },
        comments,
      ),
    ).toContain("data-comment-section");
  });

  it("pages compact Detail content and stacks comments under wide compositions", () => {
    const state = {
      detail: {
        aliases: [],
        facts: [],
        id: "paged-comments",
        kind: "inscription" as const,
        media: [],
        sections: [],
        source: "qa" as const,
        sourceCitations: [],
        title: "分页评论测试",
      },
      state: "loaded" as const,
    };
    const comments = <section data-comment-section="">comments</section>;
    const phone = renderState(state, comments);
    const tabletLandscape = renderState(state, comments, "tablet", "landscape");
    const pc = renderState(state, comments, "pc", "landscape");

    expect(phone).toContain("data-detail-content-pager");
    expect(
      phone.indexOf('data-detail-content-panel="information"'),
    ).toBeLessThan(phone.indexOf('data-detail-content-panel="comments"'));
    expect(phone).toContain('data-detail-content-active-page="information"');
    expect(tabletLandscape).not.toContain("data-detail-content-pager");
    expect(tabletLandscape).toContain("data-detail-landscape-layout");
    expect(tabletLandscape).toContain("data-detail-landscape-media");
    expect(tabletLandscape).toContain("data-detail-landscape-comments");
    expect(tabletLandscape.indexOf("data-detail-landscape-media")).toBeLessThan(
      tabletLandscape.indexOf("data-detail-info-panel"),
    );
    expect(tabletLandscape.indexOf("data-detail-info-panel")).toBeLessThan(
      tabletLandscape.indexOf("data-detail-landscape-comments"),
    );
    expect(pc).not.toContain("data-detail-content-pager");
    expect(pc).toContain("data-comment-section");
    expect(pc).toContain("data-detail-landscape-layout");
    expect(pc.indexOf("data-detail-landscape-media")).toBeLessThan(
      pc.indexOf("data-detail-info-panel"),
    );
    expect(pc.indexOf("data-detail-info-panel")).toBeLessThan(
      pc.indexOf("data-detail-landscape-comments"),
    );
  });

  it("collapses the reading flow only where comments render", () => {
    const state = {
      detail: {
        aliases: [],
        facts: [],
        id: "reading-disclosure",
        kind: "inscription" as const,
        media: [],
        sections: [
          { key: "transcription" as const, text: "释文", title: "释文" },
        ],
        source: "qa" as const,
        sourceCitations: [],
        title: "详情折叠测试",
      },
      state: "loaded" as const,
    };
    const comments = <section data-comment-section="">comments</section>;

    for (const [platform, orientation] of [
      ["tablet", "landscape"],
      ["pc", "landscape"],
    ] as const) {
      const withComments = renderState(state, comments, platform, orientation);
      expect(withComments).toContain("data-detail-reading-disclosure");
      expect(withComments).toContain('data-detail-section="transcription"');

      const formal = renderState(state, undefined, platform, orientation);
      expect(formal).not.toContain("data-detail-reading-disclosure");
      expect(formal).not.toContain("data-detail-landscape-layout");
      expect(formal).toContain('data-detail-section="transcription"');
    }

    expect(renderState(state, comments)).not.toContain(
      "data-detail-reading-disclosure",
    );
  });

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
