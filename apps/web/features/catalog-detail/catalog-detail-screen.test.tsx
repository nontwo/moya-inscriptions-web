import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CatalogDetailScreen, CatalogDetailStatus } from "./catalog-detail-screen";

import type { CatalogDetail } from "@moya/contracts";

const detail = (overrides: Partial<CatalogDetail> = {}): CatalogDetail =>
  ({
    id: "catalog-001",
    kind: "inscription",
    title: "云峰山题名",
    aliases: ["云峰题名"],
    summary: "公开摘要。",
    periodLabel: "北魏",
    dynasty: "北魏",
    dateText: "永平年间",
    province: "山东",
    prefecture: "泰安",
    county: "岱岳",
    currentLocation: "云峰山崖壁",
    currentCustodian: "云峰山文保所",
    description: "公开简介。",
    representativeMedia: {
      id: "media-001",
      kind: "image",
      src: "https://media.example.invalid/representative.jpg",
      alt: "代表图像",
      width: 1200,
      height: 1600,
    },
    media: [
      {
        id: "media-001",
        kind: "image",
        src: "https://media.example.invalid/first.jpg",
        alt: "第一张图像",
        width: 1200,
        height: 1600,
      },
      {
        id: "media-002",
        kind: "image",
        src: "https://media.example.invalid/second.jpg",
        alt: "第二张图像",
        width: 1600,
        height: 1200,
      },
    ],
    sourceCitations: [
      {
        label: "公开资料",
        citation: "卷一。",
        url: "https://source.example.invalid/catalog-001",
      },
    ],
    ...overrides,
  }) as CatalogDetail;

describe("CatalogDetailScreen", () => {
  it("renders public rich detail fields and API media in order", () => {
    const markup = renderToStaticMarkup(<CatalogDetailScreen detail={detail()} />);

    expect(markup).toContain("云峰山题名");
    expect(markup).toContain("碑刻");
    expect(markup).toContain("云峰题名");
    expect(markup).toContain("公开摘要。");
    expect(markup).toContain("北魏");
    expect(markup).toContain("永平年间");
    expect(markup).toContain("山东 · 泰安 · 岱岳");
    expect(markup).toContain("公开简介。");
    expect(markup).toContain("资料来源");
    expect(markup).toContain('src="https://media.example.invalid/first.jpg"');
    expect(markup).toContain('aria-label="上一张图像"');
    expect(markup).toContain('aria-label="下一张图像"');
    expect(markup).toContain("1 / 2");
    expect(markup).toContain('target="_blank"');
    expect(markup).not.toContain("objectKey");
    expect(markup).not.toContain("inscription");
  });

  it("uses periodLabel only when dynasty and dateText are both absent", () => {
    const periodOnly = renderToStaticMarkup(
      <CatalogDetailScreen
        detail={detail({ dynasty: undefined, dateText: undefined })}
      />,
    );
    const dynastyAndDate = renderToStaticMarkup(<CatalogDetailScreen detail={detail()} />);

    expect(periodOnly).toContain("时期");
    expect(periodOnly).toContain("北魏");
    expect(dynastyAndDate).not.toContain(">时期<");
  });

  it("omits independent optional sections for sparse no-media detail", () => {
    const markup = renderToStaticMarkup(
      <CatalogDetailScreen
        detail={detail({
          aliases: [],
          summary: undefined,
          periodLabel: undefined,
          dynasty: undefined,
          dateText: undefined,
          province: undefined,
          prefecture: undefined,
          county: undefined,
          currentLocation: undefined,
          currentCustodian: undefined,
          description: undefined,
          representativeMedia: undefined,
          media: [],
          sourceCitations: [],
        })}
      />,
    );

    expect(markup).not.toContain("图像");
    expect(markup).not.toContain("又名");
    expect(markup).not.toContain("基本资料");
    expect(markup).not.toContain("简介");
    expect(markup).not.toContain("资料来源");
    expect(markup).not.toMatch(/未知|暂无/);
  });

  it("uses representativeMedia only when the detail media list is empty", () => {
    const markup = renderToStaticMarkup(
      <CatalogDetailScreen detail={detail({ media: [] })} />,
    );

    expect(markup).toContain(
      'src="https://media.example.invalid/representative.jpg"',
    );
    expect(markup).not.toContain("上一张");
  });

  it.each([
    ["not-found", "未找到这项资料"],
    ["unavailable", "档案服务暂时不可用"],
    ["unexpected-error", "无法加载这项资料"],
  ] as const)("renders the %s status", (state, title) => {
    expect(renderToStaticMarkup(<CatalogDetailStatus state={state} />)).toContain(
      title,
    );
  });
});
