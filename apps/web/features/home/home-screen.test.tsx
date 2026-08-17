import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeScreen } from "./home-screen";

import type { CatalogPage, CatalogSummary, PublicMedia } from "@moya/contracts";

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

    const markup = renderToStaticMarkup(<HomeScreen state={state} />);

    expect(markup).toContain("公开档案");
    expect(markup).toContain("云峰山刻石");
    expect(markup).toContain(
      'src="https://media.example.invalid/catalog-001.jpg"',
    );
    expect(markup).not.toContain("objectKey");
    expect(markup).not.toContain("object_key");
    expect(markup).not.toContain("<a ");
  });

  it("keeps the Catalog total out of presentation", () => {
    const markup = renderToStaticMarkup(
      <HomeScreen
        state={{
          state: "populated",
          page: page([catalogItem()], 987_654),
        }}
      />,
    );

    expect(markup).toContain("云峰山刻石");
    expect(markup).not.toContain("987654");
  });

  it("renders a semantic no-media fallback", () => {
    const markup = renderToStaticMarkup(
      <HomeScreen
        state={{ state: "populated", page: page([catalogItem()]) }}
      />,
    );

    expect(markup).toContain("暂无公开图像");
    expect(markup).not.toContain("<img");
  });

  it.each([
    [{ state: "empty", page: page([]) }, "暂无公开档案"],
    [{ state: "unavailable" }, "档案服务暂时不可用"],
    [{ state: "unexpected-error" }, "无法加载公开档案"],
  ] as const)("renders the %s state", (state, expectedText) => {
    expect(renderToStaticMarkup(<HomeScreen state={state} />)).toContain(
      expectedText,
    );
  });
});
