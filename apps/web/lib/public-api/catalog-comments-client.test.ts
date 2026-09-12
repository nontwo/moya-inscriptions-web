import { describe, expect, it, vi } from "vitest";

import {
  createSameOriginCatalogComment,
  createSameOriginCatalogCommentReply,
  fetchSameOriginCatalogCommentPage,
  fetchSameOriginCatalogCommentReplyPage,
  fetchSameOriginCurrentUser,
} from "./catalog-comments-client";

const catalogId = "catalog-one";
const commentId = "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01";
const author = {
  id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
  displayName: "拓片爱好者",
};
const comment = {
  id: commentId,
  catalogId,
  author,
  text: "评论正文",
  createdAt: "2026-09-12T06:00:00.000Z",
  replies: [],
  replyTotal: 0,
};
const listing = {
  hot: [],
  items: [comment],
  total: 1,
  page: 1,
  pageSize: 10,
  totalPages: 1,
};
const replyPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
  totalPages: 0,
};

const context = (fetch: typeof globalThis.fetch) => ({
  baseUrl: new URL("https://example.test/dev/community/preview"),
  fetch,
});

describe("same-origin comment client", () => {
  it("reads the combined listing and forwards the pinned hot ids", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(listing));
    await expect(
      fetchSameOriginCatalogCommentPage(
        catalogId,
        { page: 2, pageSize: 10, pinned: ["comment-a", "comment-b"] },
        undefined,
        context(fetch),
      ),
    ).resolves.toEqual({ page: listing, state: "success" });
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe(`/api/catalog/${catalogId}/comments`);
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("pageSize")).toBe("10");
    expect(url.searchParams.get("pinned")).toBe("comment-a,comment-b");
    expect(init).toMatchObject({ credentials: "same-origin", method: "GET" });
    expect(fetch.mock.instances[0]).toBe(globalThis);
  });

  it("omits an empty pinned set and rejects a malformed page", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ ...listing, hot: [comment] }));
    await expect(
      fetchSameOriginCatalogCommentPage(
        catalogId,
        { pinned: [] },
        undefined,
        context(fetch),
      ),
    ).resolves.toEqual({ state: "unexpected-error" });
    const [url] = fetch.mock.calls[0] as [URL];
    expect(url.searchParams.has("pinned")).toBe(false);
  });

  it.each([
    [400, "invalid-query"],
    [404, "not-found"],
    [503, "unavailable"],
    [502, "unexpected-error"],
  ] as const)("maps a listing HTTP %s to %s", async (status, state) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(
      fetchSameOriginCatalogCommentPage(
        catalogId,
        {},
        undefined,
        context(fetch),
      ),
    ).resolves.toEqual({ state });
  });

  it("reads a reply page under one root", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(replyPage));
    await expect(
      fetchSameOriginCatalogCommentReplyPage(
        catalogId,
        commentId,
        { page: 3 },
        undefined,
        context(fetch),
      ),
    ).resolves.toEqual({ page: replyPage, state: "success" });
    const [url] = fetch.mock.calls[0] as [URL];
    expect(url.pathname).toBe(
      `/api/catalog/${catalogId}/comments/${commentId}/replies`,
    );
    expect(url.searchParams.get("page")).toBe("3");
  });

  it("submits a comment with the cookie and reports 202 as awaiting approval", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json(comment, { status: 202 }));
    await expect(
      createSameOriginCatalogComment(
        catalogId,
        { text: "评论正文" },
        context(fetch),
      ),
    ).resolves.toEqual({
      awaitingApproval: true,
      item: comment,
      state: "success",
    });
    const [, init] = fetch.mock.calls[0] as [URL, RequestInit];
    expect(init).toMatchObject({
      body: JSON.stringify({ text: "评论正文" }),
      credentials: "same-origin",
      method: "POST",
    });
  });

  it("submits a reply that answers a sibling", async () => {
    const reply = {
      id: "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f02",
      author,
      text: "回复",
      createdAt: "2026-09-12T06:01:00.000Z",
      replyTo: author,
    };
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json(reply, { status: 201 }));
    await expect(
      createSameOriginCatalogCommentReply(
        catalogId,
        commentId,
        { replyTo: "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f03", text: "回复" },
        context(fetch),
      ),
    ).resolves.toEqual({
      awaitingApproval: false,
      item: reply,
      state: "success",
    });
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not-found"],
    [422, "invalid-input"],
    [503, "unavailable"],
    [500, "unexpected-error"],
  ] as const)("maps a submission HTTP %s to %s", async (status, state) => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(
      createSameOriginCatalogComment(catalogId, { text: "x" }, context(fetch)),
    ).resolves.toEqual({ state });
  });

  it("identifies the viewer and treats 401 as signed out", async () => {
    const profile = { ...author, handle: "dev-user-01" };
    const signedIn = vi.fn().mockResolvedValue(Response.json(profile));
    await expect(
      fetchSameOriginCurrentUser(undefined, context(signedIn)),
    ).resolves.toEqual({ profile, state: "success" });
    const [url] = signedIn.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/api/community/me");
    const signedOut = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      fetchSameOriginCurrentUser(undefined, context(signedOut)),
    ).resolves.toEqual({ state: "unauthenticated" });
  });

  it("propagates an aborted read instead of presenting it as an error", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    await expect(
      fetchSameOriginCatalogCommentPage(
        catalogId,
        {},
        controller.signal,
        context(fetch),
      ),
    ).rejects.toThrow("aborted");
  });
});
