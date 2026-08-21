import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  CatalogDetailScreen,
  CatalogDetailStatus,
  catalogDetailGalleryKey,
  detailAliases,
  detailIdentityLine,
  detailTokensOverlap,
  qaMediaForTitle,
} from "./catalog-detail-screen";

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
    const markup = renderToStaticMarkup(
      <CatalogDetailScreen detail={detail()} />,
    );

    expect(markup).toContain("云峰山题名");
    expect(markup).toContain('aria-label="返回"');
    expect(markup).not.toContain("返回首页");
    expect(markup).toContain("碑刻");
    expect(markup).toContain("云峰题名");
    expect(markup).not.toContain("公开摘要。");
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

  it("uses only the approved public fact fields in their formal order", () => {
    const markup = renderToStaticMarkup(
      <CatalogDetailScreen detail={detail()} />,
    );

    expect(markup).toContain(">碑刻</p>");
    expect(markup.indexOf("朝代")).toBeLessThan(markup.indexOf("年代"));
    expect(markup.indexOf("年代")).toBeLessThan(markup.indexOf("地区"));
    expect(markup.indexOf("地区")).toBeLessThan(markup.indexOf("现址"));
    expect(markup.indexOf("现址")).toBeLessThan(
      markup.indexOf("保管 / 现藏单位"),
    );
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
    expect(markup).not.toContain("释文");
    expect(markup).not.toContain("说明");
    expect(markup).not.toMatch(/未知|暂无/);
  });

  it("renders approved QA-only structure and virtual media without public-media leakage", () => {
    const markup = renderToStaticMarkup(
      <CatalogDetailScreen
        detail={detail({
          aliases: [],
          county: undefined,
          currentCustodian: undefined,
          currentLocation: undefined,
          dateText: undefined,
          description: undefined,
          dynasty: undefined,
          media: [],
          prefecture: undefined,
          province: undefined,
          representativeMedia: undefined,
          sourceCitations: [],
        })}
        qa
      />,
    );

    expect(markup).toContain("资料待接入");
    expect(markup).toContain("简介");
    expect(markup).toContain("释文");
    expect(markup).toContain("说明");
    expect(markup).toContain("资料来源");
    expect(markup).toContain("内容待接入");
    expect(markup).toContain("虚拟测试图，与真实记录无对应关系：云峰山题名");
    expect(markup).toContain(
      "/docs/design-system/assets/demo/stone-detail.svg",
    );
  });

  it("keeps only non-duplicated period tokens in the identity line", () => {
    expect(detailIdentityLine(detail())).toBe("碑刻");
    expect(
      detailIdentityLine(
        detail({
          dateText: undefined,
          dynasty: undefined,
          periodLabel: "北魏",
        }),
      ),
    ).toBe("碑刻 · 北魏");
    expect(
      detailIdentityLine(detail({ periodLabel: "北魏 · 永平年间 · 山间" })),
    ).toBe("碑刻 · 山间");
  });

  it("uses the T02 fact-overlap rule for period and alias presentation", () => {
    expect(detailTokensOverlap("北魏", "北魏")).toBe(true);
    expect(detailTokensOverlap("永平年间", "永平元年")).toBe(true);
    expect(
      detailIdentityLine(detail({ periodLabel: "北魏时期 · 云峰山 · 山间" })),
    ).toBe("碑刻 · 山间");
    expect(
      detailAliases(detail({ aliases: ["云峰山崖壁", "云峰题名"] })),
    ).toEqual(["云峰题名"]);
  });

  it("uses the exact T02 QA media stress presets", () => {
    expect(
      qaMediaForTitle("云峰山题名").map(({ height, src, width }) => [
        src.split("/").at(-1),
        width,
        height,
      ]),
    ).toEqual([
      ["stone-detail.svg", 360, 610],
      ["inscription-rubbing.svg", 600, 420],
      ["discovery-stone.svg", 800, 800],
      ["stone-detail.svg", 360, 1400],
      ["valley-wall.svg", 1600, 400],
      ["stele-shadow.svg", 900, 960],
      ["cliff-gate.svg", 480, 720],
    ]);
  });

  it("keys gallery state by Catalog identity", () => {
    expect(catalogDetailGalleryKey("catalog-001")).toBe("catalog-001");
    expect(catalogDetailGalleryKey("catalog-001")).not.toBe(
      catalogDetailGalleryKey("catalog-002"),
    );
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
    [
      "not-found",
      "未找到这项资料",
      "这项资料可能不存在，或已无法访问。",
      "返回上一页",
    ],
    ["unavailable", "暂时无法加载资料", "重试", "返回"],
    ["unexpected-error", "暂时无法显示此页面", "重试", "返回"],
  ] as const)(
    "renders the %s lifecycle copy",
    (state, title, firstAction, secondAction) => {
      const markup = renderToStaticMarkup(
        <CatalogDetailStatus state={state} />,
      );

      expect(markup).toContain(title);
      expect(markup).toContain(firstAction);
      expect(markup).toContain(secondAction);
    },
  );
});
