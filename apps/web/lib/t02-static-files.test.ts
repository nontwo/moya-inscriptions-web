import { describe, expect, it } from "vitest";

import {
  appendCalligraphyItems,
  appendDiscoverItems,
  appendInscriptionItems,
  ensureDevelopmentTranscriptionSection,
  injectRuntimeCatalogRecords,
  readT02Document,
  serveT02File,
} from "./t02-static-files";

const bodyText = async (response: Response) => response.text();

const runtimeItem = (title: string, kind: "inscription" | "calligraphy") => ({
  id: `runtime-${title}`,
  kind,
  title,
  aliases: [],
  summary: `${title}摘要`,
  periodLabel: "唐",
  representativeMedia: {
    id: `media-${title}`,
    kind: "image" as const,
    src: "https://example.com/runtime.jpg",
    alt: `${title}真实图像`,
    width: 1200,
    height: 1600,
  },
});

describe("formal T02 file serving", () => {
  it("appends real Discover cards without replacing canonical QA cards", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = appendDiscoverItems(source, [
      runtimeItem("真实第一条", "inscription"),
      runtimeItem("真实第二条", "inscription"),
    ]);

    expect(result).toContain("真实第一条");
    expect(result).toContain("真实第二条");
    expect(result).toContain('data-record-origin="runtime"');
    expect(result).toContain('data-content-id="discover-cliff-gate"');
    expect(result).toContain('data-title="山门北壁题记"');
    expect(result).toContain('data-content-id="discover-ink"');
    expect(result).toContain('data-title="纸上墨痕"');
    expect(result).toContain("../../design-system/assets/demo/cliff-gate.svg");
    expect(result).toContain("https://example.com/runtime.jpg");
  });

  it("appends real Inscription records while preserving every QA card identity", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = appendInscriptionItems(source, [
      runtimeItem("真实碑刻一", "inscription"),
      runtimeItem("真实碑刻二", "inscription"),
    ]);

    expect(result).toContain("真实碑刻一");
    expect(result).toContain("真实碑刻二");
    expect(result).toContain('data-content-id="runtime-真实碑刻一"');
    expect(result).toContain('data-content-id="inscription-yunfeng"');
    expect(result).toContain('data-title="云峰山题名"');
    expect(result).toContain('data-content-id="inscription-shimen"');
    expect(result).toContain('data-title="石门东侧残刻"');
    expect(result).toContain(
      "../../design-system/assets/demo/rubbing-fragment.svg",
    );
    expect(result).toContain("data-search-empty");
  });

  it("appends real Calligraphy records while preserving every QA card identity", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = appendCalligraphyItems(source, [
      runtimeItem("真实书帖一", "calligraphy"),
      runtimeItem("真实书帖二", "calligraphy"),
    ]);

    expect(result).toContain("真实书帖一");
    expect(result).toContain("真实书帖二");
    expect(result).toContain('data-content-id="runtime-真实书帖一"');
    expect(result).toContain('data-category="all"');
    expect(result).toContain('data-content-id="calligraphy-autumn"');
    expect(result).toContain('data-title="秋山札"');
    expect(result).toContain('data-content-id="calligraphy-pine"');
    expect(result).toContain('data-title="松窗帖"');
    expect(result).toContain("../../design-system/assets/demo/ink-album.svg");
  });

  it("never mutates canonical source when there are no runtime items", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();

    expect(appendDiscoverItems(source, [])).toBe(source);
    expect(appendInscriptionItems(source, [])).toBe(source);
    expect(appendCalligraphyItems(source, [])).toBe(source);
  });

  it("escapes runtime content before appending it to T02 HTML", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const item = runtimeItem(`真实 <b>"第一"</b> & '条'`, "calligraphy");
    const result = appendCalligraphyItems(source, [item]);

    expect(result).toContain(
      "真实 &lt;b&gt;&quot;第一&quot;&lt;/b&gt; &amp; &#39;条&#39;",
    );
    expect(result).not.toContain('<b>"第一"</b>');
    expect(result).toContain('data-title="秋山札"');
  });

  it("adds the missing Development transcription section exactly once", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const once = ensureDevelopmentTranscriptionSection(source);
    const twice = ensureDevelopmentTranscriptionSection(once);

    expect(once).toContain("<h2>释文</h2>");
    expect(once).toContain("内容待接入");
    expect(once.match(/data-detail-transcription(?:\s|>)/g)).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("binds a runtime card to its own truthful record before preview.js", async () => {
    const source = await (
      await serveT02File({ kind: "prototype", segments: ["index.html"] }, "GET")
    ).text();
    const result = injectRuntimeCatalogRecords(source, {
      discover: [runtimeItem("真实书帖", "calligraphy")],
    });

    expect(result).toContain("data-runtime-catalog-bridge");
    expect(result).toContain('"id":"runtime-真实书帖"');
    expect(result).toContain('"kind":"calligraphy"');
    expect(result).toContain('"title":"真实书帖"');
    expect(result.indexOf("data-runtime-catalog-bridge")).toBeLessThan(
      result.indexOf("./preview.js"),
    );
  });

  it("serves the formal root with canonical QA records, runtime records, and one base", async () => {
    const response = await readT02Document("GET", {
      discover: [runtimeItem("真实发现", "inscription")],
      inscriptions: [runtimeItem("真实碑刻", "inscription")],
      calligraphy: [runtimeItem("真实书帖", "calligraphy")],
    });
    const body = await bodyText(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(
      body.match(/<base href="\/docs\/prototypes\/mobile-preview\/" \/>/g),
    ).toHaveLength(1);
    expect(body).toContain("真实发现");
    expect(body).toContain("真实碑刻");
    expect(body).toContain("真实书帖");
    expect(body).toContain('data-title="山门北壁题记"');
    expect(body).toContain('data-title="云峰山题名"');
    expect(body).toContain('data-title="秋山札"');
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
      const body = await response.text();

      expect(response.status).toBe(404);
      expect(body).toBe("");
      expect(body).not.toContain("/private/");
    },
  );
});
