import { describe, expect, it } from "vitest";

import {
  applyCalligraphyCards,
  applyDiscoverCards,
  applyInscriptionCards,
  readT02Document,
  serveT02File,
} from "./t02-static-files";

import type { CatalogCardSummary } from "./t02-static-files";

const bodyText = async (response: Response) => response.text();

type CardOverrides = Omit<
  Partial<CatalogCardSummary>,
  "id" | "representativeMedia"
> & {
  id?: string;
  representativeMedia?: CatalogCardSummary["representativeMedia"];
};

const card = (overrides: CardOverrides = {}): CatalogCardSummary => {
  const { id = "catalog-001", ...values } = overrides;
  return {
    id: id as CatalogCardSummary["id"],
    kind: "inscription",
    title: "真实条目",
    ...values,
  };
};

const media: NonNullable<CatalogCardSummary["representativeMedia"]> = {
  id: "media-001" as NonNullable<
    CatalogCardSummary["representativeMedia"]
  >["id"],
  kind: "image" as const,
  src: "https://media.example.invalid/catalog-001.jpg",
  alt: "真实公开图像",
  width: 1200,
  height: 1600,
};

describe("formal T02 file serving", () => {
  it("binds real Discover identity and media without prototype residue", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyDiscoverCards(source, [
      card({
        id: "real-1",
        title: "真实第一条",
        representativeMedia: media,
      }),
      card({ id: "real-2", title: "真实第二条" }),
    ]);

    expect(result).toContain('data-content-id="real-1"');
    expect(result).toContain('data-title="真实第一条"');
    expect(result).toContain('data-catalog-source="public"');
    expect(result).toContain(`data-image="${media.src}"`);
    expect(result).toContain(
      `<img src="${media.src}" alt="${media.alt}" width="1200" height="1600"`,
    );
    expect(result).not.toContain('data-content-id="discover-cliff-gate"');
    expect(result).not.toContain("虚构山门摩崖图");
    expect(result).toContain('data-content-id="real-2"');
    expect(result).toContain('aria-label="暂无图像：真实第二条"');
    expect(result).toContain('data-title="龙门残字"');
    expect(result).toContain('data-content-id="discover-stone"');
  });

  it("binds real Inscription metadata and searchable text", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyInscriptionCards(source, [
      card({
        id: "real-inscription",
        periodLabel: "北魏",
        title: "真实碑刻",
        representativeMedia: media,
      }),
    ]);

    expect(result).toContain('data-content-id="real-inscription"');
    expect(result).toContain('data-search-text="真实碑刻 碑刻 北魏"');
    expect(result).toMatch(
      /class="app-inscription-card__meta"\s*>碑刻 · 北魏<\/span\s*>/,
    );
    expect(result).not.toContain("楷书 山东云峰山");
    expect(result).toContain('class="app-inscription-card"');
    expect(result).toContain("data-search-empty");
  });

  it("keeps API-backed Calligraphy unclassified outside the truthful all page", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyCalligraphyCards(source, [
      card({
        id: "real-calligraphy",
        kind: "calligraphy",
        periodLabel: "唐",
        title: "真实书帖",
      }),
    ]);

    expect(result).toContain('data-content-id="real-calligraphy"');
    expect(result).toContain('data-category="all"');
    expect(result).toContain('data-calligraphy-filter-text="真实书帖 书帖 唐"');
    expect(result).toMatch(/class="app-card__meta">唐 · 书帖<\/span>/);
    expect(result).not.toContain("宋 · 行书");
  });

  it("escapes public identity in attributes and visible text", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyCalligraphyCards(source, [
      card({
        id: 'catalog/a"&b',
        kind: "calligraphy",
        title: `真实 <b>"第一"</b> & '条'`,
      }),
    ]);

    expect(result).toContain('data-content-id="catalog/a&quot;&amp;b"');
    expect(result).toContain(
      'data-title="真实 &lt;b&gt;&quot;第一&quot;&lt;/b&gt; &amp; &#39;条&#39;"',
    );
    expect(result).toContain(
      "真实 &lt;b&gt;&quot;第一&quot;&lt;/b&gt; &amp; &#39;条&#39;",
    );
    expect(result).not.toContain('<b>"第一"</b>');
  });

  it("uses only explicit T02 virtual media in Owner QA", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyDiscoverCards(source, [card({ title: "无公开图像" })], {
      catalogDetailQa: true,
    });

    expect(result).toContain('data-media-origin="prototype-demo"');
    expect(result).toContain("../../design-system/assets/demo/cliff-gate.svg");
    expect(result).toContain(
      'alt="虚拟测试图，与真实记录无对应关系：无公开图像"',
    );
    expect(result).not.toContain('aria-label="暂无图像：无公开图像"');
  });

  it("uses the existing truthful missing-media card in production", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyInscriptionCards(source, [card({ title: "真实碑刻" })]);

    expect(result).toContain("app-inscription-card is-media-missing");
    expect(result).toContain('data-media-origin="missing"');
    expect(result).toContain(
      'class="app-card__media-fallback" role="img" aria-label="暂无图像：真实碑刻"',
    );
    expect(result).not.toContain("虚构云峰山题名缩略图");
  });

  it("leaves canonical cards unchanged when no Public records map to them", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();

    expect(applyDiscoverCards(source, [])).toBe(source);
    expect(applyInscriptionCards(source, [])).toBe(source);
    expect(applyCalligraphyCards(source, [])).toBe(source);
  });

  it("maps overflow Discover cards while preserving remaining prototype cards", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyDiscoverCards(
      source,
      Array.from({ length: 13 }, (_, index) =>
        card({
          id: `real-${index + 1}`,
          title: `真实条目 ${index + 1}`,
        }),
      ),
    );

    const discoverSection = result.match(
      /<div\s+class="app-masonry"\s+data-feed-grid="discover">([\s\S]*?)<\/div>/,
    )?.[1];

    expect(discoverSection).toBeDefined();
    expect(discoverSection).toContain("真实条目 13");
    expect(
      discoverSection?.match(/<button\b[^>]*data-open-detail/g),
    ).toHaveLength(13);
    expect(discoverSection).toContain('data-content-id="real-13"');
    expect(discoverSection).not.toContain(
      'data-content-id="discover-cliff-gate"',
    );
    expect(discoverSection).not.toContain("虚构山门摩崖图");
  });

  it("serves the canonical root document with one response-time base", async () => {
    const response = await readT02Document();
    const body = await bodyText(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(
      body.match(/<base href="\/docs\/prototypes\/mobile-preview\/" \/>/g),
    ).toHaveLength(1);
    expect(body).toContain('<script src="./device-platform.js"></script>');
    expect(body).toContain('data-view="home"');
  });

  it("marks Owner QA without exposing environment values", async () => {
    const body = await bodyText(
      await readT02Document("GET", {}, { catalogDetailQa: true }),
    );

    expect(body).toContain('<html data-catalog-detail-qa="true" lang="zh-CN">');
    expect(body).not.toContain("MOYA_CATALOG_DETAIL_QA");
    expect(body).not.toContain("MOYA_PUBLIC_API_BASE_URL");
  });

  it("supports bodyless HEAD responses", async () => {
    const response = await readT02Document("HEAD");

    expect(response.status).toBe(200);
    expect(await bodyText(response)).toBe("");
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
  });

  it.each([
    [
      "preview.js",
      { kind: "prototype", segments: ["preview.js"] },
      "text/javascript; charset=utf-8",
    ],
    [
      "preview.css",
      { kind: "prototype", segments: ["preview.css"] },
      "text/css; charset=utf-8",
    ],
    [
      "demo image",
      { kind: "demo-assets", segments: ["demo", "cliff-gate.svg"] },
      "image/svg+xml",
    ],
    [
      "settings icon",
      { kind: "ui-assets", segments: ["icons", "settings.svg"] },
      "image/svg+xml",
    ],
    [
      "navigation label",
      { kind: "ui-assets", segments: ["labels", "nav-home.png"] },
      "image/png",
    ],
    [
      "paper texture",
      { kind: "ui-assets", segments: ["textures", "paper-visible.svg"] },
      "image/svg+xml",
    ],
  ] as const)(
    "serves the allowlisted %s",
    async (_name, access, contentType) => {
      const response = await serveT02File(access, "GET");

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(contentType);
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    },
  );

  it.each([
    ["parent traversal", ["..", "package.json"]],
    ["encoded traversal", ["%2e%2e", "package.json"]],
    ["absolute path", ["/etc/passwd"]],
    ["directory request", ["fixtures"]],
    ["unallowlisted package file", ["package.json"]],
  ] as const)(
    "rejects %s without leaking filesystem details",
    async (_name, segments) => {
      const response = await serveT02File(
        { kind: "prototype", segments },
        "GET",
      );
      const body = await bodyText(response);

      expect(response.status).toBe(404);
      expect(body).toBe("");
      expect(body).not.toContain("/private/");
    },
  );
});
