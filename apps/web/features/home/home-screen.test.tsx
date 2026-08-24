import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CatalogCard, isUltraWideCatalogMedia } from "./catalog-card";
import { CatalogBrowseScreen } from "./catalog-screen";
import { HomeScreen } from "./home-screen";

import type {
  CatalogId,
  CatalogPage,
  CatalogSummary,
  PublicMedia,
} from "@moya/contracts";

const catalogItem = (overrides: Partial<CatalogSummary> = {}): CatalogSummary =>
  ({
    id: "catalog-001",
    kind: "inscription",
    title: "云峰山刻石",
    aliases: [],
    summary: "公开摘要",
    periodLabel: "北魏",
    ...overrides,
  }) as CatalogSummary;

const page = (items: CatalogSummary[], total = items.length): CatalogPage =>
  ({
    items,
    total,
    page: 1,
    pageSize: 20,
    totalPages: total === 0 ? 0 : Math.ceil(total / 20),
  }) as CatalogPage;

describe("isUltraWideCatalogMedia", () => {
  it.each([
    [{ height: 1_000, width: 2_399 }, false],
    [{ height: 1_000, width: 2_400 }, true],
    [{ height: 280, width: 960 }, true],
  ] as const)("classifies %o as %s", (media, expected) => {
    expect(isUltraWideCatalogMedia(media)).toBe(expected);
  });

  it.each([
    undefined,
    { height: 0, width: 960 },
    { height: -1, width: 960 },
    { height: 280, width: 0 },
    { height: 280, width: -1 },
    { height: Number.NaN, width: 960 },
    { height: 280, width: Number.POSITIVE_INFINITY },
  ])("returns false for missing or invalid dimensions: %o", (media) => {
    expect(isUltraWideCatalogMedia(media)).toBe(false);
  });
});

describe("CatalogCard", () => {
  const ultraWideMedia = {
    alt: "合成超宽媒体",
    height: 1_000,
    id: "media-ultra-wide",
    kind: "image",
    src: "/ultra-wide.svg",
    width: 2_400,
  } as PublicMedia;

  it("marks only ultra-wide feed cards for full feed span", () => {
    const ultraWideItem = catalogItem({ representativeMedia: ultraWideMedia });
    const regularItem = catalogItem({
      representativeMedia: {
        ...ultraWideMedia,
        id: "media-regular",
        width: 2_399,
      } as PublicMedia,
    });

    expect(
      renderToStaticMarkup(<CatalogCard item={ultraWideItem} variant="feed" />),
    ).toContain('data-catalog-feed-span="full"');
    expect(
      renderToStaticMarkup(<CatalogCard item={regularItem} variant="feed" />),
    ).not.toContain("data-catalog-feed-span");
    expect(
      renderToStaticMarkup(
        <CatalogCard
          item={catalogItem({ representativeMedia: undefined })}
          variant="feed"
        />,
      ),
    ).not.toContain("data-catalog-feed-span");
  });

  it("does not mark inscription cards even when their media is ultra-wide", () => {
    expect(
      renderToStaticMarkup(
        <CatalogCard
          item={catalogItem({ representativeMedia: ultraWideMedia })}
          variant="inscription"
        />,
      ),
    ).not.toContain("data-catalog-feed-span");
  });
});

describe("HomeScreen", () => {
  it("renders populated Catalog content and only the PublicMedia runtime URL", () => {
    const state = {
      state: "populated",
      page: page([
        catalogItem({
          representativeMedia: {
            id: "media-001",
            kind: "image",
            src: "https://media.example.invalid/catalog-001.jpg",
            alt: "云峰山刻石公开图像",
            width: 1200,
            height: 1600,
          } as PublicMedia,
        }),
      ]),
    } as const;

    const markup = renderToStaticMarkup(
      <HomeScreen feedLayout="double" state={state} />,
    );

    expect(markup).toContain('data-catalog-presentation="home"');
    expect(markup).toContain("发现");
    expect(markup).toContain("云峰山刻石");
    expect(markup).toContain(
      'src="https://media.example.invalid/catalog-001.jpg"',
    );
    expect(markup).toContain('data-catalog-media-state="valid"');
    expect(markup).not.toContain("objectKey");
    expect(markup).not.toContain("object_key");
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("<button");
  });

  it("keeps the Catalog total out of presentation", () => {
    const markup = renderToStaticMarkup(
      <HomeScreen
        feedLayout="double"
        state={{
          state: "populated",
          page: page([catalogItem()], 987_654),
        }}
      />,
    );

    expect(markup).toContain("云峰山刻石");
    expect(markup).not.toContain("987654");
  });

  it("renders semantic no-media fallback and sparse metadata", () => {
    const markup = renderToStaticMarkup(
      <HomeScreen
        feedLayout="single"
        state={{
          state: "populated",
          page: page([
            catalogItem({
              aliases: [],
              periodLabel: undefined,
              representativeMedia: undefined,
              summary: undefined,
            }),
          ]),
        }}
      />,
    );

    expect(markup).toContain('data-feed-layout="single"');
    expect(markup).toContain('data-catalog-media-state="missing"');
    expect(markup).toContain("暂无公开图像");
    expect(markup).toContain("碑刻");
    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain("<img");
  });

  it("renders a very long synthetic title without truncating content", () => {
    const longTitle =
      "合成长题名用于验证多行排版与稀疏元数据时卡片仍然保持完整可读且不暗示真实文物身份";
    const markup = renderToStaticMarkup(
      <HomeScreen
        feedLayout="double"
        state={{
          state: "populated",
          page: page([catalogItem({ title: longTitle })]),
        }}
      />,
    );

    expect(markup).toContain(longTitle);
  });

  it.each([
    [{ state: "empty", page: page([]) }, "暂无公开档案"],
    [{ state: "unavailable" }, "档案服务暂时不可用"],
    [{ state: "unexpected-error" }, "无法加载公开档案"],
  ] as const)("renders the %s state", (state, expectedText) => {
    expect(
      renderToStaticMarkup(<HomeScreen feedLayout="double" state={state} />),
    ).toContain(expectedText);
  });
});

describe("CatalogBrowseScreen", () => {
  const mixedState = {
    state: "populated",
    page: page([
      catalogItem({
        id: "inscription-001" as CatalogId,
        title: "合成碑刻",
      }),
      catalogItem({
        id: "calligraphy-001" as CatalogId,
        kind: "calligraphy",
        title: "合成书帖",
      }),
    ]),
  } as const;

  it("filters the shared Catalog state to inscription list rows", () => {
    const markup = renderToStaticMarkup(
      <CatalogBrowseScreen
        feedLayout="double"
        kind="inscription"
        state={mixedState}
      />,
    );

    expect(markup).toContain('data-catalog-presentation="inscription"');
    expect(markup).toContain('data-catalog-item-count="1"');
    expect(markup).toContain('data-catalog-card-variant="inscription"');
    expect(markup).toContain("合成碑刻");
    expect(markup).not.toContain("合成书帖");
  });

  it("filters the shared Catalog state to calligraphy feed cards", () => {
    const markup = renderToStaticMarkup(
      <CatalogBrowseScreen
        feedLayout="single"
        kind="calligraphy"
        state={mixedState}
      />,
    );

    expect(markup).toContain('data-catalog-presentation="calligraphy"');
    expect(markup).toContain('data-catalog-item-count="1"');
    expect(markup).toContain('data-catalog-card-variant="feed"');
    expect(markup).toContain('data-feed-layout="single"');
    expect(markup).toContain("合成书帖");
    expect(markup).not.toContain("合成碑刻");
  });
});
