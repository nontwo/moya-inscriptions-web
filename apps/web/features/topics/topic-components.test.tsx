import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TopicCard } from "./topic-card";
import { TopicDetail } from "./topic-detail";

import type { CatalogId, CatalogSummary, MediaId } from "@moya/contracts";
import type { EditorialTopic, Topic } from "./topic";

const media = {
  alt: "专题演示图",
  height: 400,
  id: "topic-media" as MediaId,
  kind: "image" as const,
  src: "https://example.invalid/topic.svg",
  width: 600,
};

const editorial: EditorialTopic = {
  blurb: "专题摘要",
  blocks: [
    { text: "导语", type: "lead" },
    { text: "正文", type: "rich-text" },
    { text: "引文", type: "quote" },
    { caption: "图注", media, type: "image" },
    { caption: "视频占位", type: "video" },
  ],
  cover: media,
  id: "topic-editorial",
  kind: "editorialTopic",
  title: "策展专题",
};

const renderDetail = (topic: Topic | null) =>
  renderToStaticMarkup(
    <TopicDetail
      backButtonRef={createRef<HTMLButtonElement>()}
      feedLayout="double"
      onClose={vi.fn()}
      platform="phone"
      topic={topic}
    />,
  );

describe("Topic components", () => {
  it("exposes the entire Topic card as one native button", () => {
    const markup = renderToStaticMarkup(
      <TopicCard onOpen={vi.fn()} topic={editorial} />,
    );
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toContain('data-topic-id="topic-editorial"');
    expect(markup).toContain("策展专题");
    expect(markup).toContain("专题/策展");
    expect(markup).not.toContain('role="listitem" type="button"');
  });

  it("renders the bounded editorial blocks in source order", () => {
    const markup = renderDetail(editorial);
    const positions = [
      'data-topic-block="lead"',
      'data-topic-block="rich-text"',
      'data-topic-block="quote"',
      'data-topic-block="image"',
      'data-topic-block="video"',
    ].map((marker) => markup.indexOf(marker));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
  });

  it("renders a Catalog collection without inventing a Detail action", () => {
    const record: CatalogSummary = {
      aliases: [],
      id: "catalog-collection-item" as CatalogId,
      kind: "inscription",
      title: "集合条目",
    };
    const markup = renderDetail({
      blurb: "集合摘要",
      id: "topic-collection",
      kind: "catalogCollection",
      records: [record],
      title: "集合专题",
    });
    expect(markup).toContain("data-topic-collection");
    expect(markup).toContain("集合条目");
    expect(markup).not.toContain("data-open-catalog");
  });

  it("uses a truthful bounded not-found state for an invalid TopicId", () => {
    const markup = renderDetail(null);
    expect(markup).toContain('data-topic-detail-state="not-found"');
    expect(markup).toContain("未找到这个专题");
  });
});
