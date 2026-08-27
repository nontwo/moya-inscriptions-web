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

  it("renders the truthful no-media state without future sections", () => {
    const markup = renderState({
      detail: {
        aliases: [],
        facts: [],
        id: "no-media",
        kind: "inscription",
        media: [],
        source: "qa",
        sourceCitations: [],
        title: "无图资料",
      },
      state: "loaded",
    });

    expect(markup).toContain('data-detail-media-state="missing"');
    expect(markup).toContain("暂无公开图像");
    expect(markup).not.toMatch(
      /释文|历史背景|学术研究|说明|transcription|Viewer|Gallery/u,
    );
  });
});
