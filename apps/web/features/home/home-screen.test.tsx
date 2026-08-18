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

    expect(markup).toContain("首页内容范围");
    expect(markup).toContain('aria-label="发现"');
    expect(markup).toContain('aria-selected="true"');
    expect(markup.match(/aria-selected="false"/g)).toHaveLength(2);
    expect(markup).toContain('aria-label="附近"');
    expect(markup).toContain('aria-label="专题"');
    expect(markup).toContain("云峰山刻石");
    expect(markup).toContain("北魏");
    expect(markup).not.toContain("公开摘要");
    expect(markup).toContain(
      'src="https://media.example.invalid/catalog-001.jpg"',
    );
    expect(markup).not.toContain("objectKey");
    expect(markup).not.toContain("object_key");
    expect(markup).not.toContain("<a ");
    expect(markup).not.toContain("data-open-detail");
    expect(markup).not.toContain("p5-pilot.snapshot");
    expect(markup).toContain('data-label="nav-home"');
    expect(markup).toContain('data-label="nav-inscriptions"');
    expect(markup).toContain('data-label="nav-calligraphy"');
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

  it("keeps API order and all future destinations non-navigating", () => {
    const markup = renderToStaticMarkup(
      <HomeScreen
        state={{
          state: "populated",
          page: page([
            catalogItem({ title: "第一条" }),
            catalogItem({
              id: "catalog-002" as CatalogSummary["id"],
              title: "第二条",
            }),
          ]),
        }}
      />,
    );

    expect(markup.indexOf("第一条")).toBeLessThan(markup.indexOf("第二条"));
    expect(markup.match(/data-home-card="true"/g)).toHaveLength(2);
    expect(markup.match(/disabled=""/g)).toHaveLength(4);
    expect(markup).not.toMatch(
      /href="\/(nearby|topics|inscriptions|calligraphy)/,
    );
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
