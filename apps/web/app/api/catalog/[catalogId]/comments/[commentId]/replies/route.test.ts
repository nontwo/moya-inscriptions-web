import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRepliesMock, createReplyMock } = vi.hoisted(() => ({
  fetchRepliesMock: vi.fn(),
  createReplyMock: vi.fn(),
}));

vi.mock("../../../../../../../lib/public-api/server", () => ({
  fetchServerCatalogCommentReplyPage: fetchRepliesMock,
  createServerCatalogCommentReply: createReplyMock,
}));

import { GET, POST } from "./route";

const opaqueSession = "B".repeat(43);
const catalogId = "catalog-001";
const commentId = "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01";
const context = { params: Promise.resolve({ catalogId, commentId }) };
const url = `http://localhost/api/catalog/${catalogId}/comments/${commentId}/replies`;
const reply = {
  id: "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f02",
  author: {
    id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
    displayName: "拓片爱好者",
  },
  text: "回复正文",
  createdAt: "2026-09-12T06:00:00.000Z",
};

const writeRequest = (body: unknown, cookie?: string) => {
  const payload = JSON.stringify(body);
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": String(new TextEncoder().encode(payload).byteLength),
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: payload,
  });
};

beforeEach(() => {
  fetchRepliesMock.mockReset();
  createReplyMock.mockReset();
});

describe("same-origin reply bridge", () => {
  it("pages replies anonymously", async () => {
    const page = {
      items: [reply],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    };
    fetchRepliesMock.mockResolvedValue({ state: "success", page });
    const response = await GET(new Request(`${url}?pageSize=10`), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(fetchRepliesMock).toHaveBeenCalledWith(catalogId, commentId, {
      pageSize: "10",
    });
  });

  it("refuses unknown query parameters and unauthenticated writes", async () => {
    expect((await GET(new Request(`${url}?depth=2`), context)).status).toBe(
      400,
    );
    expect(fetchRepliesMock).not.toHaveBeenCalled();
    expect((await POST(writeRequest({ text: "回复" }), context)).status).toBe(
      401,
    );
    expect(createReplyMock).not.toHaveBeenCalled();
  });

  it("relays the credential and the optional sibling pointer", async () => {
    createReplyMock.mockResolvedValue({
      state: "success",
      item: reply,
      awaitingApproval: false,
    });
    const response = await POST(
      writeRequest(
        { text: "回复正文", replyTo: reply.id },
        `yoyi-session=${opaqueSession}`,
      ),
      context,
    );
    expect(response.status).toBe(201);
    expect(createReplyMock).toHaveBeenCalledWith(
      catalogId,
      commentId,
      opaqueSession,
      { text: "回复正文", replyTo: reply.id },
    );
  });

  it.each([
    ["unauthenticated", 401],
    ["not-found", 404],
    ["invalid-input", 422],
    ["unavailable", 503],
    ["unexpected-error", 502],
  ] as const)("maps write state %s", async (state, status) => {
    createReplyMock.mockResolvedValue({ state });
    const response = await POST(
      writeRequest({ text: "回复" }, `yoyi-session=${opaqueSession}`),
      context,
    );
    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
  });

  it("answers 202 while a reply awaits approval", async () => {
    createReplyMock.mockResolvedValue({
      state: "success",
      item: reply,
      awaitingApproval: true,
    });
    expect(
      (
        await POST(
          writeRequest({ text: "回复" }, `yoyi-session=${opaqueSession}`),
          context,
        )
      ).status,
    ).toBe(202);
  });
});
