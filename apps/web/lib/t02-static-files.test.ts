import { describe, expect, it } from "vitest";

import {
  applyDiscoverTitles,
  applyCalligraphyTitles,
  applyInscriptionTitles,
  readT02Document,
  serveT02File,
} from "./t02-static-files";

const bodyText = async (response: Response) => response.text();

describe("formal T02 file serving", () => {
  it("replaces only the visible Discover titles in API order", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyDiscoverTitles(source, [
      { id: "real-1", title: "真实第一条" },
      { id: "real-2", title: "真实第二条" },
    ]);

    expect(result).toContain("真实第一条");
    expect(result).toContain("真实第二条");
    expect(result).toContain('data-title="山门北壁题记"');
    expect(result).toContain('data-content-id="discover-cliff-gate"');
    expect(result).toContain('data-title="纸上墨痕"');
    expect(result).toContain('data-content-id="discover-ink"');
    expect(result).toContain('data-title="龙门残字"');
    expect(result).toContain('data-content-id="discover-stone"');
    expect(result).toContain('data-title="山崖旧刻"');
  });

  it("replaces only the visible Inscription titles in API order", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyInscriptionTitles(source, [
      { id: "real-1", title: "真实碑刻一" },
      { id: "real-2", title: "真实碑刻二" },
    ]);

    expect(result).toContain("真实碑刻一");
    expect(result).toContain("真实碑刻二");
    expect(result).toContain('data-title="云峰山题名"');
    expect(result).toContain('data-content-id="inscription-yunfeng"');
    expect(result).toContain('class="app-inscription-card"');
    expect(result).toContain('class="app-inscription-card__meta"');
    expect(result).toContain("data-search-empty");
    expect(result).toContain(
      "../../design-system/assets/demo/rubbing-fragment.svg",
    );
  });

  it("replaces only the visible Calligraphy titles in API order", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyCalligraphyTitles(source, [
      { id: "real-1", title: "真实书帖一" },
      { id: "real-2", title: "真实书帖二" },
    ]);

    expect(result).toContain("真实书帖一");
    expect(result).toContain("真实书帖二");
    expect(result).toContain('data-title="秋山札"');
    expect(result).toContain('data-content-id="calligraphy-autumn"');
    expect(result).toContain('data-category="ink"');
    expect(result).toContain('class="app-card__meta"');
    expect(result).toContain("../../design-system/assets/demo/ink-album.svg");
  });

  it("escapes visible title text before injecting it into HTML", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyCalligraphyTitles(source, [
      { id: "real-1", title: `真实 <b>"第一"</b> & '条'` },
    ]);

    expect(result).toContain(
      "真实 &lt;b&gt;&quot;第一&quot;&lt;/b&gt; &amp; &#39;条&#39;",
    );
    expect(result).toContain('data-title="秋山札"');
    expect(result).not.toContain('<b>"第一"</b>');
    expect(result).not.toContain("real-discover");
  });

  it("links API-backed cards to their encoded official Catalog detail route", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyDiscoverTitles(source, [
      { id: 'catalog/a"&b', title: `API <b>标题</b>` },
    ]);

    expect(result).toMatch(
      /href="\/catalog\/catalog%2Fa%22%26b"\s+class="app-card"/,
    );
    expect(result).toContain(
      '<span class="app-card__title">API &lt;b&gt;标题&lt;/b&gt;</span>',
    );
    expect(result.match(/<a\b[\s\S]*?<\/a>/)?.[0]).not.toContain(
      "data-open-detail",
    );
    expect(result).toContain('data-content-id="discover-ink"');
    expect(result).toContain("data-open-detail");
  });

  it("links API-backed inscription cards while leaving prototype cards intact", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyInscriptionTitles(source, [
      { id: "catalog/inscription-1", title: "真实碑刻" },
    ]);

    expect(result).toMatch(
      /href="\/catalog\/catalog%2Finscription-1"\s+class="app-inscription-card"/,
    );
    expect(result).toMatch(
      /class="app-inscription-card__title"\s*>\s*真实碑刻\s*<\/span>/,
    );
    expect(result).toContain('data-content-id="inscription-shimen"');
    expect(result).toContain("data-open-detail");
  });

  it("leaves the canonical browse source unchanged when there are no titles", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();

    expect(applyDiscoverTitles(source, [])).toBe(source);
    expect(applyInscriptionTitles(source, [])).toBe(source);
    expect(applyCalligraphyTitles(source, [])).toBe(source);
  });

  it("clones the existing Discover card presentation for overflow titles", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = applyDiscoverTitles(
      source,
      Array.from({ length: 13 }, (_, index) => ({
        id: `real-${index + 1}`,
        title: `真实条目 ${index + 1}`,
      })),
    );

    const discoverSection = result.match(
      /<div\s+class="app-masonry"\s+data-feed-grid="discover">([\s\S]*?)<\/div>/,
    )?.[1];

    expect(discoverSection).toBeDefined();
    expect(discoverSection).toContain("真实条目 13");
    expect(
      discoverSection?.match(/<a\b[^>]*href="\/catalog\/real-/g),
    ).toHaveLength(13);
    expect(result).toContain('data-content-id="discover-cliff-gate"');
    expect(result).toContain('data-content-id="discover-ink"');
    expect(result).toContain("../../design-system/assets/demo/cliff-gate.svg");
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
