import { describe, expect, it } from "vitest";

import { isTopic, resolveCatalogCollection } from "./topic";

import type { CatalogId, CatalogSummary } from "@moya/contracts";
import type { CatalogCollectionDefinition } from "./topic";

const record = (id: string): CatalogSummary => ({
  aliases: [],
  id: id as CatalogId,
  kind: "inscription",
  title: id,
});

describe("Topic model", () => {
  it("accepts every supported editorial block", () => {
    expect(
      isTopic({
        blurb: "策展摘要",
        blocks: [
          { text: "导语", type: "lead" },
          { text: "正文", type: "rich-text" },
          { text: "引文", type: "quote" },
          {
            caption: "图注",
            media: {
              alt: "图像",
              height: 400,
              id: "topic-image",
              kind: "image",
              src: "https://example.invalid/topic.svg",
              width: 600,
            },
            type: "image",
          },
          { caption: "视频占位", type: "video" },
        ],
        id: "topic-supported",
        kind: "editorialTopic",
        title: "支持的专题",
      }),
    ).toBe(true);
  });

  it("rejects unknown Topic kinds and unknown blocks", () => {
    expect(
      isTopic({
        blurb: "未知",
        blocks: [],
        id: "topic-unknown",
        kind: "userPost",
        title: "未知",
      }),
    ).toBe(false);
    expect(
      isTopic({
        blurb: "未知 block",
        blocks: [{ html: "<b>unsafe</b>", type: "html" }],
        id: "topic-unknown-block",
        kind: "editorialTopic",
        title: "未知 block",
      }),
    ).toBe(false);
  });

  it("resolves a Catalog collection in definition order and omits missing records", () => {
    const definition: CatalogCollectionDefinition = {
      blurb: "集合",
      id: "topic-collection",
      kind: "catalogCollection",
      recordIds: ["record-b", "missing", "record-a"],
      title: "集合专题",
    };

    expect(
      resolveCatalogCollection(definition, [
        record("record-a"),
        record("record-b"),
      ]).records.map(({ id }) => id),
    ).toEqual(["record-b", "record-a"]);
  });
});
