import { describe, expect, it } from "vitest";
import {
  authorListQuerySchema,
  ownCommentPageSchema,
  discussionLocationSchema,
  discussionSubmitResultSchema,
  savedResultSchema,
  deletedResultSchema,
  guestFavoriteMergeSchema,
  contentIdentitySchema,
  catalogKindSchema,
  inscriptionFiltersSchema,
} from "@moya/contracts/schemas";
import { catalogFilterMetadataSchema } from "@moya/contracts/internal/editorial";
describe("Phase 4 strict public contract", () => {
  it.each(["1e2", "0x10", "+2", " 2 ", "", "-1", "01"])(
    "rejects noncanonical page %j",
    (page) =>
      expect(authorListQuerySchema.safeParse({ page }).success).toBe(false),
  );
  it("preserves typed content without making a work a CatalogKind", () => {
    expect(
      contentIdentitySchema.parse({
        type: "work",
        id: "work-" + "a".repeat(32),
      }).type,
    ).toBe("work");
    expect(catalogKindSchema.safeParse("work").success).toBe(false);
    expect(
      contentIdentitySchema.safeParse({ type: "work", id: "catalog-a" })
        .success,
    ).toBe(false);
  });
  it("requires account-bound guest receipts and validates entire response envelopes", () => {
    const input = {
      requestId: "9b62b05d-fb9a-48b8-aa9a-a5dafbeb242b",
      items: [{ type: "catalog", id: "synthetic-catalog" }],
    };
    expect(guestFavoriteMergeSchema.safeParse(input).success).toBe(false);
    expect(
      guestFavoriteMergeSchema.safeParse({
        ...input,
        expectedAccountId: "user-" + "a".repeat(32),
      }).success,
    ).toBe(true);
    const page = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    expect(ownCommentPageSchema.parse(page)).toEqual(page);
    for (const extra of [
      { page: 0 },
      { totalPages: -1 },
      { originalHiddenText: "private" },
      { pageSize: 51 },
    ])
      expect(
        ownCommentPageSchema.safeParse({ ...page, ...extra }).success,
      ).toBe(false);
    expect(
      discussionLocationSchema.safeParse({
        rootId: "comment-" + "a".repeat(32),
        page: 1,
        replyPage: 0,
      }).success,
    ).toBe(false);
    expect(
      discussionSubmitResultSchema.safeParse({
        id: "comment-" + "a".repeat(32),
        rootId: "comment-" + "a".repeat(32),
        awaitingApproval: true,
      }).success,
    ).toBe(false);
    expect(savedResultSchema.safeParse({ saved: false }).success).toBe(false);
    expect(
      deletedResultSchema.safeParse({ deleted: true, text: "private" }).success,
    ).toBe(false);
  });
  it("keeps unknown and unsupplied states out of curator VALUE tokens", () => {
    for (const token of ["@unknown", "@unsupplied"])
      expect(
        catalogFilterMetadataSchema.safeParse({
          dynasty: { state: "VALUE", tokens: token },
        }).success,
      ).toBe(false);
    expect(
      inscriptionFiltersSchema.parse({ dynasty: ["@unknown", "合成朝代"] })
        .dynasty,
    ).toHaveLength(2);
    expect(
      inscriptionFiltersSchema.safeParse({ dynasty: ["重复", "重复"] }).success,
    ).toBe(false);
  });
});
