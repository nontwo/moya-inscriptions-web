import { describe, expect, it } from "vitest";

import {
  formatCommentTimeLabel,
  toCommentItemPresentation,
} from "./live-comments";

import type { CatalogComment } from "@moya/contracts";

const now = new Date("2026-09-12T12:00:00.000Z");
const author = {
  id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
  displayName: "拓片爱好者",
};
const other = {
  id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f02",
  displayName: "书法学徒",
};

describe("live comment presentation mapper", () => {
  it("formats a truthful relative label and falls back to the plain date", () => {
    expect(formatCommentTimeLabel("2026-09-12T11:59:30.000Z", now)).toBe(
      "刚刚",
    );
    expect(formatCommentTimeLabel("2026-09-12T11:15:00.000Z", now)).toBe(
      "45 分钟前",
    );
    expect(formatCommentTimeLabel("2026-09-12T03:00:00.000Z", now)).toBe(
      "9 小时前",
    );
    expect(formatCommentTimeLabel("2026-09-10T12:00:00.000Z", now)).toBe(
      "2 天前",
    );
    expect(formatCommentTimeLabel("2026-08-01T00:00:00.000Z", now)).toBe(
      "2026-08-01",
    );
    expect(formatCommentTimeLabel("not a date", now)).toBe("not a date");
  });

  it("maps the DTO one way into the accepted presentation shape without invented data", () => {
    const comment = {
      id: "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
      catalogId: "catalog-one",
      author,
      text: "根评论",
      createdAt: "2026-09-12T11:00:00.000Z",
      replies: [
        {
          id: "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f02",
          author: other,
          text: "回复",
          createdAt: "2026-09-12T11:30:00.000Z",
          replyTo: author,
        },
      ],
      replyTotal: 7,
    } as CatalogComment;

    expect(toCommentItemPresentation(comment, now)).toEqual({
      createdAtLabel: "1 小时前",
      id: comment.id,
      isQaGenerated: false,
      likeCount: 0,
      liked: false,
      replies: [
        {
          createdAtLabel: "30 分钟前",
          id: "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f02",
          likeCount: 0,
          liked: false,
          replyToUser: { avatarSrc: null, id: author.id, name: "拓片爱好者" },
          text: "回复",
          user: { avatarSrc: null, id: other.id, name: "书法学徒" },
        },
      ],
      replyTotal: 7,
      text: "根评论",
      user: { avatarSrc: null, id: author.id, name: "拓片爱好者" },
    });
  });
});
