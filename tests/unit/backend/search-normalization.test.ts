import { describe, expect, it } from "vitest";
import {
  matchCatalogSearchDocument,
  normalizeSearchText,
  projectCatalogSearchDocument,
  SEARCH_NORMALIZATION_VERSION,
} from "@moya/search";

describe("fixed backend OpenCC search normalization", () => {
  it("uses the evaluated conversion without adding unapproved variant relations", () => {
    expect(SEARCH_NORMALIZATION_VERSION).toBe("opencc-1.4.1-t2s-v1");
    expect(normalizeSearchText("書譜 雲嶺記")).toBe("书谱 云岭记");
    expect(normalizeSearchText("祭姪文稿")).toBe("祭姪文稿");
    expect(normalizeSearchText("書普")).toBe("书普");
  });
  it("preserves source text and copies only the approved public fields", () => {
    const source = {
      title: "雲嶺記",
      aliases: ["合成雲記"],
      contributors: [{ name: "虚构作者甲" }],
      summary: "合成简介",
      transcription: "合成溪聲入紙",
      historicalContext: "排除历史暗号",
      scholarlyResearch: "排除学术暗号",
      internalNote: "排除内部暗号",
      media: [{ src: "https://example.invalid/synthetic-image" }],
    };
    const before = JSON.stringify(source);
    const doc = projectCatalogSearchDocument(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(doc.title).toBe("雲嶺記");
    expect(doc.normalizedTitle).toBe("云岭记");
    expect(doc.combinedText).not.toMatch(/排除|https:/);
    expect(matchCatalogSearchDocument(doc, "雲嶺記")).toBe("title-exact");
    expect(matchCatalogSearchDocument(doc, "合成雲記")).toBe("alias-exact");
    expect(matchCatalogSearchDocument(doc, "云岭记")).toBe("normalized-exact");
    expect(matchCatalogSearchDocument(doc, "云岭")).toBe("title-alias-partial");
    expect(matchCatalogSearchDocument(doc, "虚构作者甲 雲嶺")).toBe(
      "structured",
    );
    expect(matchCatalogSearchDocument(doc, "作者甲 溪声")).toBe("body");
    expect(matchCatalogSearchDocument(doc, "排除")).toBeNull();
  });
});
