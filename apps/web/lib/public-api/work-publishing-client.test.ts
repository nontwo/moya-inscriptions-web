import type { WorkDraftContent } from "@moya/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthorRequestError, authorClient } from "./author-community-client";
import {
  PublishingRequestError,
  publishingClient,
} from "./work-publishing-client";

const account = `user-${"a".repeat(32)}`;
const otherAccount = `user-${"b".repeat(32)}`;
const draftId = `work-draft-${"1".repeat(32)}`;
const workId = `work-${"2".repeat(32)}`;
const itemId = `media-item-${"3".repeat(32)}`;
const componentId = `media-component-${"4".repeat(32)}`;
const sessionId = `publishing-session-${"5".repeat(32)}`;
const revisionId = `work-revision-${"6".repeat(32)}`;
const requestId = "0f8e2f4c-3b1a-4d6e-9c2b-7a5d4e3f2a10";
const attempt = "6d1b0c8e-2f3a-4b5c-8d7e-9f0a1b2c3d4e";
const at = "2026-09-13T10:00:00.000Z";

const content: WorkDraftContent = {
  title: "春日临帖",
  body: "第一行\n第二行",
  authorship: { kind: "original" },
  visibility: "public",
  items: [],
  coverKey: null,
  coverCrop: null,
};

const draft = {
  id: draftId,
  kind: "new",
  workId: null,
  baseRevisionId: null,
  revision: 3,
  content,
  mediaItems: [],
  conflict: null,
  deviceClass: "phone",
  createdAt: at,
  updatedAt: at,
} as const;

const awaitingItem = {
  id: itemId,
  kind: "static",
  qualityMode: "standard",
  state: "awaiting_upload",
  failureCode: null,
  components: [
    {
      id: componentId,
      role: "still",
      state: "awaiting",
      byteSize: 2048,
      receivedBytes: 0,
    },
  ],
  presentation: null,
  media: null,
} as const;

const receipt = {
  state: "confirmed",
  requestId,
  workId,
  revisionId,
  visibility: "public",
  submittedAt: at,
} as const;

const refusalBody = (message: string, code = "INVALID_INPUT") => ({
  error: { code, message, requestId: "backend-request-1" },
});

const upstream = vi.fn<typeof fetch>();

const answer = (body: unknown, status = 200) =>
  upstream.mockResolvedValueOnce(Response.json(body, { status }));

const refused = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => {
      throw new Error("expected a refusal");
    },
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(PublishingRequestError);
  return error as PublishingRequestError;
};

beforeEach(() => {
  upstream.mockReset();
  vi.stubGlobal("fetch", upstream);
  authorClient.setAccount(account);
});

afterEach(() => {
  authorClient.setAccount(null);
  vi.unstubAllGlobals();
});

describe("work publishing client", () => {
  it("reads privately through the same-origin relay and parses the contract", async () => {
    const limits = {
      maxItems: 50,
      originalItemMaxBytes: 134217728,
      standardComponentMaxBytes: 268435456,
      titleMax: 200,
      bodyMax: 10000,
    };
    answer(limits);
    await expect(publishingClient.limits()).resolves.toEqual(limits);
    const [path, init] = upstream.mock.calls[0]!;
    expect(path).toBe("/api/community/publishing/limits");
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { accept: "application/json" },
    });
    expect(init?.body).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends a validated write with the confirmed account", async () => {
    answer(draft, 201);
    const command = { requestId, content, deviceClass: "phone" } as const;
    await expect(publishingClient.createDraft(command)).resolves.toEqual(draft);
    const [path, init] = upstream.mock.calls[0]!;
    expect(path).toBe("/api/community/publishing/drafts");
    expect(init).toMatchObject({
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-author-account": account,
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual(command);
  });

  it("refuses a write before any account is confirmed", async () => {
    authorClient.setAccount(null);
    const error = await refused(
      publishingClient.saveDraft(draftId, {
        baseRevision: 3,
        content,
        deviceClass: null,
      }),
    );
    expect(error.status).toBe(401);
    expect(error).toBeInstanceOf(AuthorRequestError);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("keeps the field code of an invalid command without sending it", async () => {
    const error = await refused(
      publishingClient.createDraft({
        requestId,
        content: { ...content, title: " ", body: "\n" },
        deviceClass: null,
      }),
    );
    expect(error).toMatchObject({ status: 422, code: "empty_work" });
    expect(error.message).toBe("标题、正文和图片不能都为空");
    const tooLong = await refused(
      publishingClient.submit({
        requestId,
        holder: { draftId },
        content: { ...content, title: "字".repeat(201) },
        baseRevisionId: null,
      }),
    );
    expect(tooLong).toMatchObject({ status: 422, code: "title_too_long" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("parses a conditional save that reports a conflict", async () => {
    const conflict = {
      id: `work-draft-${"7".repeat(32)}`,
      device: {
        content: { ...content, title: "本机版本" },
        baseRevision: 3,
        deviceClass: "phone",
        savedAt: at,
      },
      account: {
        content,
        revision: 4,
        deviceClass: "desktop",
        updatedAt: at,
      },
      createdAt: at,
    };
    answer({
      status: "conflict",
      draft: { ...draft, revision: 4, conflict },
      conflict,
    });
    const result = await publishingClient.saveDraftNow(draftId, {
      baseRevision: 3,
      content: { ...content, title: "本机版本" },
      deviceClass: "phone",
    });
    expect(result.status).toBe("conflict");
    expect(upstream.mock.calls[0]?.[0]).toBe(
      `/api/community/publishing/drafts/${draftId}/snapshot`,
    );
  });

  it.each([
    ["capacity_exceeded", "存储空间不足，文字仍可保存"],
    ["daily_limit", "今日新发布作品数量已达上限"],
    ["not_ready", "仍有图片未处理完成"],
  ])("maps the 422 failure code %s", async (code, message) => {
    answer(refusalBody(code), 422);
    const error = await refused(
      publishingClient.registerItem({
        requestId,
        holder: { draftId },
        kind: "static",
        qualityMode: "original",
        components: [
          { role: "still", byteSize: 2048, contentType: "image/heic" },
        ],
      }),
    );
    expect(error).toMatchObject({ status: 422, code, message });
  });

  it("keeps a generic 422 without inventing a field code", async () => {
    answer(refusalBody("Invalid community input"), 422);
    const error = await refused(
      publishingClient.setVisibility(workId, { requestId, visibility: "self" }),
    );
    expect(error).toMatchObject({
      status: 422,
      code: null,
      message: "内容不符合要求，请检查后修改",
    });
  });

  it.each([
    [
      "Request identity was already used for different content",
      null,
      "状态已变化，请检查后重试",
    ],
    ["Another transfer is still in progress", null, "状态已变化，请检查后重试"],
    ["work_unavailable", "work_unavailable", "作品不可用"],
  ] as const)(
    "shows product text instead of the Backend conflict message %s",
    async (backendMessage, code, message) => {
      answer(refusalBody(backendMessage, "CONFLICT"), 409);
      const error = await refused(
        publishingClient.resolveConflict(draftId, {
          requestId,
          conflictId: `work-draft-${"7".repeat(32)}`,
          choice: "device",
        }),
      );
      expect(error).toMatchObject({
        status: 409,
        code,
        message,
        outcomeUnknown: false,
      });
    },
  );

  it.each([
    [401, "请先登录"],
    [404, "内容不可用"],
    [413, "内容超过允许的大小"],
    [503, "暂时无法完成，请重试"],
    [502, "暂时无法完成，请重试"],
  ])("maps status %i of a read", async (status, message) => {
    upstream.mockResolvedValueOnce(new Response(null, { status }));
    const error = await refused(publishingClient.draft(draftId));
    expect(error).toMatchObject({
      status,
      code: null,
      message,
      outcomeUnknown: false,
    });
  });

  it("refuses an answer that breaks the contract", async () => {
    answer({ ...draft, workId });
    const error = await refused(publishingClient.draft(draftId));
    expect(error).toMatchObject({ status: 502, outcomeUnknown: false });
  });

  it("discards an answer that arrives after the account changed", async () => {
    upstream.mockImplementationOnce(async () => {
      authorClient.setAccount(otherAccount);
      return Response.json(awaitingItem);
    });
    const error = await refused(publishingClient.item(itemId));
    expect(error).toMatchObject({
      status: 401,
      message: "账户状态已变化，请重试读取",
      outcomeUnknown: false,
    });
  });

  it("discards an answer when the account switched away and back (A→B→A)", async () => {
    upstream.mockImplementationOnce(async () => {
      authorClient.setAccount(otherAccount);
      authorClient.setAccount(account);
      return Response.json(awaitingItem);
    });
    const error = await refused(publishingClient.item(itemId));
    expect(error.status).toBe(401);
    expect(authorClient.account()).toBe(account);
  });

  it("discards an answer when the account changes while its body is read", async () => {
    upstream.mockImplementationOnce(async () => {
      const text = new TextEncoder().encode(JSON.stringify(awaitingItem));
      let sent = false;
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (sent) {
            // The account changes after the headers, before the last byte.
            authorClient.setAccount(otherAccount);
            controller.close();
            return;
          }
          sent = true;
          controller.enqueue(text);
        },
      });
      return new Response(body, {
        headers: { "content-type": "application/json" },
      });
    });
    const error = await refused(publishingClient.item(itemId));
    expect(error.status).toBe(401);
  });

  it("reports a network failure as status 0 and rethrows a caller abort", async () => {
    upstream.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const error = await refused(publishingClient.listTrash());
    expect(error).toMatchObject({
      status: 0,
      code: null,
      message: "网络连接中断，请检查后重试",
      outcomeUnknown: false,
    });

    const controller = new AbortController();
    controller.abort();
    upstream.mockRejectedValueOnce(
      new DOMException("The operation was aborted.", "AbortError"),
    );
    await expect(
      publishingClient.editableWork(workId, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  describe("write outcomes", () => {
    const save = () =>
      publishingClient.saveDraft(draftId, {
        baseRevision: 3,
        content,
        deviceClass: "phone",
      });

    it.each([
      [
        "a lost connection",
        () => upstream.mockRejectedValueOnce(new TypeError("Failed to fetch")),
        0,
      ],
      [
        "the client's own request timeout",
        () =>
          upstream.mockRejectedValueOnce(
            new DOMException("The operation timed out.", "TimeoutError"),
          ),
        0,
      ],
      [
        "an unreadable success answer",
        () =>
          upstream.mockResolvedValueOnce(
            new Response("{", {
              headers: { "content-type": "application/json" },
            }),
          ),
        502,
      ],
      [
        "a success answer that breaks the contract",
        () => answer({ status: "saved" }),
        502,
      ],
      [
        "the relay's empty 503 (upstream timeout or network failure)",
        () =>
          upstream.mockResolvedValueOnce(new Response(null, { status: 503 })),
        503,
      ],
      [
        "an empty 502",
        () =>
          upstream.mockResolvedValueOnce(new Response(null, { status: 502 })),
        502,
      ],
      [
        "a Backend internal error",
        () => answer(refusalBody("Unexpected failure", "INTERNAL_ERROR"), 500),
        500,
      ],
    ] as const)(
      "leaves the outcome unknown after %s",
      async (_label, arrange, status) => {
        arrange();
        const error = await refused(save());
        expect(error).toMatchObject({
          status,
          code: null,
          outcomeUnknown: true,
        });
        expect(error.message).not.toMatch(/重试/u);
      },
    );

    it.each([
      [
        "the Backend's declared unavailability",
        () =>
          answer(
            refusalBody(
              "Media is temporarily unavailable",
              "SERVICE_UNAVAILABLE",
            ),
            503,
          ),
        503,
      ],
      [
        "a conflict",
        () => answer(refusalBody("Draft revision changed", "CONFLICT"), 409),
        409,
      ],
      [
        "a relay size refusal",
        () =>
          upstream.mockResolvedValueOnce(new Response(null, { status: 413 })),
        413,
      ],
      [
        "a field refusal",
        () => answer(refusalBody("capacity_exceeded"), 422),
        422,
      ],
    ] as const)("keeps %s a known refusal", async (_label, arrange, status) => {
      arrange();
      const error = await refused(save());
      expect(error).toMatchObject({ status, outcomeUnknown: false });
    });

    it("does not tell the next account to retry a write that may have committed", async () => {
      upstream.mockImplementationOnce(async () => {
        authorClient.setAccount(otherAccount);
        return Response.json({
          status: "saved",
          draft: { ...draft, revision: 4 },
        });
      });
      const error = await refused(save());
      expect(error).toMatchObject({
        status: 401,
        outcomeUnknown: true,
        message: "账户状态已变化，请刷新后检查操作结果",
      });

      upstream.mockImplementationOnce(async () => {
        authorClient.setAccount(account);
        return Response.json(
          refusalBody("Draft revision changed", "CONFLICT"),
          {
            status: 409,
          },
        );
      });
      const refusedWrite = await refused(save());
      expect(refusedWrite).toMatchObject({
        status: 401,
        outcomeUnknown: false,
      });
    });

    it("sends a write with the account that was confirmed when it started", async () => {
      upstream.mockResolvedValueOnce(new Response(null, { status: 503 }));
      await refused(save());
      expect(upstream.mock.calls[0]?.[1]?.headers).toMatchObject({
        "x-author-account": account,
      });
    });
  });

  it("answers null when a lost submission has no receipt", async () => {
    upstream.mockResolvedValueOnce(
      Response.json(refusalBody("Not found", "ITEM_NOT_FOUND"), {
        status: 404,
      }),
    );
    await expect(publishingClient.submissionReceipt(requestId)).resolves.toBe(
      null,
    );
    expect(upstream.mock.calls[0]?.[0]).toBe(
      `/api/community/publishing/submissions/${requestId}`,
    );
    answer(receipt);
    await expect(
      publishingClient.submissionReceipt(requestId),
    ).resolves.toEqual(receipt);
    upstream.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(
      await refused(publishingClient.submissionReceipt(requestId)),
    ).toMatchObject({ status: 503, outcomeUnknown: false });
    upstream.mockImplementationOnce(async () => {
      authorClient.setAccount(otherAccount);
      return Response.json(refusalBody("Not found", "ITEM_NOT_FOUND"), {
        status: 404,
      });
    });
    expect(
      (await refused(publishingClient.submissionReceipt(requestId))).status,
    ).toBe(401);
  });

  it("parses both submission outcomes", async () => {
    const command = {
      requestId,
      holder: { sessionId },
      content,
      baseRevisionId: revisionId,
    } as const;
    answer({ state: "not_ready", itemKeys: ["item-1"] });
    await expect(publishingClient.submit(command)).resolves.toEqual({
      state: "not_ready",
      itemKeys: ["item-1"],
    });
    answer(receipt);
    await expect(publishingClient.submit(command)).resolves.toEqual(receipt);
  });

  it.each([
    [
      "deleteDraft",
      () => publishingClient.deleteDraft(draftId, { requestId }),
      `publishing/drafts/${draftId}`,
      "DELETE",
      { deleted: true, snapshots: 2, conflictCopies: 0, mediaItems: 1 },
    ],
    [
      "trashWork",
      () => publishingClient.trashWork(workId, { requestId }),
      `works/${workId}`,
      "DELETE",
      { deleted: true },
    ],
    [
      "restoreWork",
      () => publishingClient.restoreWork(workId, { requestId }),
      `publishing/trash/${workId}/restore`,
      "POST",
      { workId, visibility: "self" },
    ],
    [
      "discardSession",
      () => publishingClient.discardSession(sessionId, { requestId }),
      `publishing/sessions/${sessionId}/discard`,
      "POST",
      { discarded: true },
    ],
    [
      "resetComponent",
      () => publishingClient.resetComponent(itemId, "motion", { requestId }),
      `publishing/items/${itemId}/components/motion/reset`,
      "POST",
      awaitingItem,
    ],
    [
      "cancelItem",
      () => publishingClient.cancelItem(itemId, { requestId }),
      `publishing/items/${itemId}/cancel`,
      "POST",
      awaitingItem,
    ],
    [
      "openWorkEditDraft",
      () =>
        publishingClient.openWorkEditDraft(workId, {
          requestId,
          deviceClass: "desktop",
        }),
      `publishing/works/${workId}/draft`,
      "POST",
      { ...draft, kind: "edit", workId, baseRevisionId: revisionId },
    ],
    [
      "restoreSnapshot",
      () =>
        publishingClient.restoreSnapshot(draftId, {
          requestId,
          snapshotId: `work-snapshot-${"8".repeat(32)}`,
        }),
      `publishing/drafts/${draftId}/restore`,
      "POST",
      draft,
    ],
    [
      "createSession",
      () => publishingClient.createSession({ requestId, workId: null }),
      "publishing/sessions",
      "POST",
      {
        id: sessionId,
        state: "active",
        workId: null,
        leaseExpiresAt: at,
        createdAt: at,
      },
    ],
    [
      "heartbeatSession",
      () => publishingClient.heartbeatSession(sessionId),
      `publishing/sessions/${sessionId}/heartbeat`,
      "POST",
      {
        id: sessionId,
        state: "active",
        workId: null,
        leaseExpiresAt: at,
        createdAt: at,
      },
    ],
  ] as const)(
    "%s uses its exact route and method",
    async (_name, call, path, method, body) => {
      answer(body);
      await expect(call()).resolves.toEqual(body);
      const [target, init] = upstream.mock.calls[0]!;
      expect(target).toBe(`/api/community/${path}`);
      expect(init?.method).toBe(method);
      expect(init?.body).toBeTypeOf("string");
    },
  );

  it("builds bounded page queries for drafts, history and trash", async () => {
    const empty = { items: [], total: 0, page: 2, pageSize: 10, totalPages: 0 };
    answer(empty);
    answer(empty);
    answer(empty);
    await publishingClient.listDrafts({ page: 2, pageSize: 10 });
    await publishingClient.draftHistory(draftId, { page: 2, pageSize: 10 });
    await publishingClient.listTrash({ page: 2, pageSize: 10 });
    expect(upstream.mock.calls.map(([path]) => path)).toEqual([
      "/api/community/publishing/drafts?page=2&pageSize=10",
      `/api/community/publishing/drafts/${draftId}/history?page=2&pageSize=10`,
      "/api/community/publishing/trash?page=2&pageSize=10",
    ]);
    const error = await refused(publishingClient.listDrafts({ pageSize: 51 }));
    expect(error.status).toBe(422);
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it.each<() => Promise<unknown>>([
    () => publishingClient.draft("../limits"),
    () => publishingClient.editableWork(`work-${"2".repeat(31)}`),
    () => publishingClient.item(componentId),
    () =>
      publishingClient.resetComponent(itemId, "../../x" as "still", {
        requestId,
      }),
    () => publishingClient.submissionReceipt("not-a-request"),
    () => publishingClient.heartbeatSession(draftId),
  ])("never builds a path from an invalid id (%#)", async (call) => {
    const error = await refused(Promise.resolve().then(call));
    expect(error.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  describe("component uploads (Uppy XHR)", () => {
    it("names the streaming relay endpoint for a valid component only", () => {
      expect(publishingClient.uploadEndpoint(componentId)).toBe(
        `/api/community/publishing/uploads/${componentId}`,
      );
      expect(() =>
        publishingClient.uploadEndpoint("media-component-1"),
      ).toThrow(PublishingRequestError);
    });

    it("sends raw bytes with the confirmed account and the attempt fence", () => {
      expect(publishingClient.uploadHeaders(attempt)).toEqual({
        "content-type": "application/octet-stream",
        "x-author-account": account,
        "x-upload-attempt": attempt,
      });
      expect(() => publishingClient.uploadHeaders("attempt-1")).toThrow(
        PublishingRequestError,
      );
      authorClient.setAccount(null);
      expect(() => publishingClient.uploadHeaders(attempt)).toThrow(
        expect.objectContaining({ status: 401 }),
      );
    });

    const uploaded = {
      componentId,
      sha256: "e".repeat(64),
      receivedBytes: 2048,
      item: {
        ...awaitingItem,
        state: "processing",
        components: [
          {
            ...awaitingItem.components[0],
            state: "received",
            receivedBytes: 2048,
          },
        ],
      },
    };

    it("parses the upload answer for the account it was sent with", () => {
      expect(
        publishingClient.uploadResult(200, JSON.stringify(uploaded), account),
      ).toEqual(uploaded);
    });

    it("maps upload refusals to product text with known outcomes", () => {
      expect(() =>
        publishingClient.uploadResult(
          409,
          JSON.stringify(
            refusalBody("The transfer was superseded", "CONFLICT"),
          ),
          account,
        ),
      ).toThrow(
        expect.objectContaining({
          status: 409,
          code: null,
          message: "状态已变化，请检查后重试",
          outcomeUnknown: false,
        }),
      );
      expect(() =>
        publishingClient.uploadResult(
          413,
          JSON.stringify(refusalBody("original_item_too_large")),
          account,
        ),
      ).toThrow(
        expect.objectContaining({
          status: 413,
          code: "original_item_too_large",
          message: "原图超过单项大小上限",
          outcomeUnknown: false,
        }),
      );
      expect(() =>
        publishingClient.uploadResult(
          503,
          JSON.stringify(
            refusalBody(
              "Media uploads are not available",
              "SERVICE_UNAVAILABLE",
            ),
          ),
          account,
        ),
      ).toThrow(
        expect.objectContaining({ status: 503, outcomeUnknown: false }),
      );
    });

    it.each([
      ["a browser network failure", 0, ""],
      ["the relay's interrupted Backend connection", 502, ""],
      ["the relay's answer timeout", 504, ""],
      ["an empty 503", 503, ""],
      ["an unreadable success", 200, "{"],
      [
        "a success that breaks the contract",
        200,
        JSON.stringify({ receivedBytes: 1 }),
      ],
    ] as const)(
      "leaves the upload outcome unknown after %s",
      (_label, status, text) => {
        expect(() =>
          publishingClient.uploadResult(status, text, account),
        ).toThrow(expect.objectContaining({ outcomeUnknown: true }));
      },
    );

    it("never hands an upload answer to another account", () => {
      authorClient.setAccount(otherAccount);
      expect(() =>
        publishingClient.uploadResult(200, JSON.stringify(uploaded), account),
      ).toThrow(
        expect.objectContaining({
          status: 401,
          outcomeUnknown: true,
          message: "账户状态已变化，请刷新后检查操作结果",
        }),
      );
      expect(() =>
        publishingClient.uploadResult(
          409,
          JSON.stringify(refusalBody("The transfer was cancelled", "CONFLICT")),
          account,
        ),
      ).toThrow(
        expect.objectContaining({ status: 401, outcomeUnknown: false }),
      );
      authorClient.setAccount(null);
      expect(() =>
        publishingClient.uploadResult(200, JSON.stringify(uploaded), account),
      ).toThrow(expect.objectContaining({ status: 401 }));
    });
  });
});
