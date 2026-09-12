import {
  CatalogCommentService,
  parseCommentPageQuery,
  parseCreateCommentRequest,
} from "@moya/api";
import {
  catalogCommentPageSchema,
  catalogCommentReplyPageSchema,
  catalogCommentSchema,
} from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

import {
  FixtureCatalogPublicationPort,
  InMemoryCommunityCommentPort,
  publishedCatalogId,
} from "./community-comment-fixture.js";
import { fixtureUsers } from "./community-identity-fixture.js";

import type { CatalogCommentId, CatalogId } from "@moya/contracts";

const unpublishedCatalogId = "catalog-unpublished-09" as CatalogId;

const createService = (
  options: {
    readonly start?: Date;
    readonly port?: InMemoryCommunityCommentPort;
  } = {},
) => {
  const port = options.port ?? new InMemoryCommunityCommentPort();
  let now = options.start ?? new Date("2026-09-12T06:00:00.000Z");
  let counter = 0;
  const service = new CatalogCommentService(
    port,
    new FixtureCatalogPublicationPort(),
    {
      clock: () => now,
      // Deterministic opaque ids keep ordering assertions stable.
      randomBytes: () => {
        counter += 1;
        return Uint8Array.from({ length: 16 }, (_value, index) =>
          index === 15 ? counter : 0,
        );
      },
    },
  );
  return {
    port,
    service,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
};

describe("CatalogCommentService", () => {
  it("creates a pending comment under PRE_MODERATION and hides it from public reads", async () => {
    const { service, port } = createService();
    const created = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "第一条评论" },
    );
    expect(created.awaitingApproval).toBe(true);
    expect(catalogCommentSchema.parse(created.item)).toEqual(created.item);
    expect(created.item.replies).toEqual([]);
    expect(JSON.stringify(created.item)).not.toMatch(/moderation|pending/u);

    const page = await service.readComments(publishedCatalogId, {
      page: 1,
      pageSize: 20,
    });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(port.comments.get(created.item.id)?.moderation).toBe("pending");
  });

  it("publishes immediately under DIRECT_PUBLICATION and keeps existing items untouched", async () => {
    const { service, port, advance } = createService();
    const pending = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "先审后发的评论" },
    );
    port.policy = "DIRECT_PUBLICATION";
    advance(1_000);
    const direct = await service.createComment(
      publishedCatalogId,
      fixtureUsers.second.id,
      { text: "直接发布的评论" },
    );

    expect(direct.awaitingApproval).toBe(false);
    // Switching affects new submissions only.
    expect(port.comments.get(pending.item.id)?.moderation).toBe("pending");
    const page = await service.readComments(publishedCatalogId, {
      page: 1,
      pageSize: 20,
    });
    expect(page.items.map((item) => item.id)).toEqual([direct.item.id]);
    expect(catalogCommentPageSchema.parse(page)).toEqual(page);
  });

  it("orders root comments newest first and replies oldest first", async () => {
    const { service, port, advance } = createService();
    port.policy = "DIRECT_PUBLICATION";
    const first = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "最早的评论" },
    );
    advance(1_000);
    const second = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "较新的评论" },
    );
    advance(1_000);
    const replyA = await service.createReply(
      publishedCatalogId,
      first.item.id,
      fixtureUsers.second.id,
      { text: "第一条回复" },
    );
    advance(1_000);
    const replyB = await service.createReply(
      publishedCatalogId,
      first.item.id,
      fixtureUsers.active.id,
      { text: "第二条回复", replyTo: replyA.item.id },
    );

    const page = await service.readComments(publishedCatalogId, {
      page: 1,
      pageSize: 20,
    });
    expect(page.items.map((item) => item.id)).toEqual([
      second.item.id,
      first.item.id,
    ]);
    expect(page.items[1]?.replies.map((reply) => reply.id)).toEqual([
      replyA.item.id,
      replyB.item.id,
    ]);
    // The 回复 X： pointer resolves to the sibling author, not to a nested tree.
    expect(page.items[1]?.replies[1]?.replyTo?.id).toBe(fixtureUsers.second.id);
    expect(replyB.item.replyTo?.id).toBe(fixtureUsers.second.id);
  });

  it("embeds a bounded first page of replies and serves the rest through pagination", async () => {
    const { service, port, advance } = createService();
    port.policy = "DIRECT_PUBLICATION";
    const root = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "有很多回复的评论" },
    );
    for (let index = 0; index < 5; index += 1) {
      advance(1_000);
      await service.createReply(
        publishedCatalogId,
        root.item.id,
        fixtureUsers.active.id,
        { text: `回复 ${index + 1}` },
      );
    }

    const page = await service.readComments(publishedCatalogId, {
      page: 1,
      pageSize: 20,
    });
    expect(page.items[0]?.replies).toHaveLength(3);

    const replies = await service.readReplies(
      publishedCatalogId,
      root.item.id,
      { page: 1, pageSize: 2 },
    );
    expect(catalogCommentReplyPageSchema.parse(replies)).toEqual(replies);
    expect(replies.total).toBe(5);
    expect(replies.totalPages).toBe(3);
    expect(replies.items).toHaveLength(2);
    const lastPage = await service.readReplies(
      publishedCatalogId,
      root.item.id,
      { page: 3, pageSize: 2 },
    );
    expect(lastPage.items).toHaveLength(1);
  });

  it("refuses unknown or unpublished Catalog records on read and write", async () => {
    const { service } = createService();
    await expect(
      service.readComments(unpublishedCatalogId, { page: 1, pageSize: 20 }),
    ).rejects.toThrow("not published");
    await expect(
      service.createComment(unpublishedCatalogId, fixtureUsers.active.id, {
        text: "不该写入",
      }),
    ).rejects.toThrow("not published");
  });

  it("never lets a reply bypass a root that is not visible", async () => {
    const { service, port } = createService();
    const pendingRoot = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "待审核的根评论" },
    );
    await expect(
      service.createReply(
        publishedCatalogId,
        pendingRoot.item.id,
        fixtureUsers.second.id,
        { text: "回复待审核评论" },
      ),
    ).rejects.toThrow("not visible");
    await expect(
      service.readReplies(publishedCatalogId, pendingRoot.item.id, {
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toThrow("not visible");

    port.policy = "DIRECT_PUBLICATION";
    const visibleRoot = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "公开的根评论" },
    );
    await service.createReply(
      publishedCatalogId,
      visibleRoot.item.id,
      fixtureUsers.second.id,
      { text: "公开的回复" },
    );
    await port.applyCommentModeration(visibleRoot.item.id, "hidden");
    // Hiding the root removes the whole thread from public reads.
    const page = await service.readComments(publishedCatalogId, {
      page: 1,
      pageSize: 20,
    });
    expect(page.items).toEqual([]);
    await expect(
      service.readReplies(publishedCatalogId, visibleRoot.item.id, {
        page: 1,
        pageSize: 10,
      }),
    ).rejects.toThrow("not visible");
  });

  it("rejects invalid bodies, foreign reply targets and out-of-bound pages", async () => {
    const { service, port } = createService();
    port.policy = "DIRECT_PUBLICATION";
    const root = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "根评论" },
    );
    const otherRoot = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "另一条根评论" },
    );
    const foreignReply = await service.createReply(
      publishedCatalogId,
      otherRoot.item.id,
      fixtureUsers.active.id,
      { text: "另一个线程的回复" },
    );

    for (const body of [
      {},
      { text: "" },
      { text: "  " },
      { text: "x".repeat(1_001) },
      { text: "正常", extra: true },
      { text: " 前后空白 " },
    ])
      expect(() => parseCreateCommentRequest(body)).toThrow();

    await expect(
      service.createReply(
        publishedCatalogId,
        root.item.id,
        fixtureUsers.active.id,
        { text: "跨线程回复", replyTo: foreignReply.item.id },
      ),
    ).rejects.toThrow("same root comment");
    await expect(
      service.createReply(
        publishedCatalogId,
        root.item.id,
        fixtureUsers.active.id,
        {
          text: "指向未知回复",
          replyTo:
            "comment-ffffffffffffffffffffffffffffffff" as CatalogCommentId,
        },
      ),
    ).rejects.toThrow("same root comment");

    // The page bounds live in the transport parser, not the service.
    for (const query of [
      { pageSize: "51" },
      { page: "0" },
      { pageSize: "0" },
      { page: "1", unknown: "1" },
    ])
      expect(() => parseCommentPageQuery(query)).toThrow();
    expect(parseCommentPageQuery({})).toEqual({ page: 1, pageSize: 20 });
    expect(parseCommentPageQuery({}, 10)).toEqual({ page: 1, pageSize: 10 });
  });

  it("reads the publication setting per submission so a switch needs no restart", async () => {
    const { service, port } = createService();
    await service.createComment(publishedCatalogId, fixtureUsers.active.id, {
      text: "第一条",
    });
    port.policy = "DIRECT_PUBLICATION";
    const second = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "第二条" },
    );
    expect(second.awaitingApproval).toBe(false);
    port.policy = "PRE_MODERATION";
    const third = await service.createComment(
      publishedCatalogId,
      fixtureUsers.active.id,
      { text: "第三条" },
    );
    expect(third.awaitingApproval).toBe(true);
  });
});
