// @vitest-environment jsdom
/// <reference lib="dom" />

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CatalogDetailSurface } from "./catalog-detail";
import { demoCatalogById, type DemoContentId } from "./demo-data";

import type { CatalogSummary } from "@moya/contracts";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Catalog Detail continuity boundary", () => {
  it("renders REAL summaries without Synthetic facts or unsupported sections", () => {
    const summary = {
      id: "catalog-real",
      kind: "inscription",
      title: "北魏永平四年郑道昭浮丘子题字",
      aliases: ["浮丘子题字"],
      summary: "不得进入 summary-only Detail 的列表摘要",
      periodLabel: "北魏",
    } as CatalogSummary;
    act(() =>
      root.render(
        <CatalogDetailSurface
          onBack={vi.fn()}
          target={{ source: "real-summary", summary }}
        />,
      ),
    );

    const detail = document.querySelector(
      '[data-detail-source="real-summary"]',
    )!;
    expect(detail.textContent).toContain(summary.title);
    expect(detail.textContent).toContain("浮丘子题字");
    expect(detail.textContent).toContain("暂无公开图像");
    expect(detail.textContent).not.toContain(summary.summary);
    expect(detail.textContent).not.toMatch(
      /基本资料|资料来源|说明|DEMO|开发中/,
    );
  });

  it("preserves multi-media navigation, viewer and Back for Synthetic Detail", () => {
    const id = "inscription-yunfeng" as DemoContentId;
    expect(demoCatalogById.get(id)?.media).toHaveLength(5);
    const onBack = vi.fn();
    act(() =>
      root.render(
        <CatalogDetailSurface
          onBack={onBack}
          target={{ source: "demo", id }}
        />,
      ),
    );

    expect(document.body.textContent).toContain("1 / 5");
    act(() =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="下一张"]')
        ?.click(),
    );
    expect(document.body.textContent).toContain("2 / 5");
    act(() =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="查看图像"]')
        ?.click(),
    );
    expect(
      document.querySelector('[role="dialog"][data-media-viewer]'),
    ).not.toBeNull();
    act(() =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(document.querySelector("[data-media-viewer]")).toBeNull();
    act(() =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="返回"]')
        ?.click(),
    );
    expect(onBack).toHaveBeenCalledOnce();
  });

  it.each([
    ["d08-loading", "正在加载档案", "status"],
    ["d09-not-found", "未找到档案", "status"],
    ["d10-unavailable", "档案服务暂时不可用", "status"],
    ["d10-error", "无法加载档案", "alert"],
  ] as const)("preserves the %s lifecycle state", (id, text, role) => {
    act(() =>
      root.render(
        <CatalogDetailSurface
          onBack={vi.fn()}
          target={{ source: "demo", id: id as DemoContentId }}
        />,
      ),
    );
    expect(document.querySelector(`[role="${role}"]`)?.textContent).toBe(text);
  });
});
