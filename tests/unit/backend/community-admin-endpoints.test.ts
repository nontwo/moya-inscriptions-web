import {
  CommunityOperatorError,
  createCommunityEndpoints,
} from "admin/community-endpoints";
import { describe, expect, it, vi } from "vitest";

import type { OperatorCall } from "admin/community-endpoints";
import type { Endpoint, PayloadRequest } from "payload";

/**
 * The real Payload endpoint handlers, with only the loopback transport
 * replaced by a recorder. This is the boundary the Owner's button reaches:
 * the complete request envelope is validated strictly, the id is mapped into
 * the Backend route, and only the validated command body is forwarded.
 */
const commentId = "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01";
const userId = "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01";

const recorder = () => {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const call = vi.fn(
    async (method: string, path: string, body?: unknown): Promise<unknown> => {
      calls.push({ method, path, ...(body === undefined ? {} : { body }) });
      return { echoed: true };
    },
  ) as unknown as OperatorCall;
  return { call, calls };
};

const request = (
  body: unknown,
  role: "owner" | "automation" | null = "owner",
  options: { readonly withoutJson?: boolean } = {},
): PayloadRequest =>
  ({
    user: role === null ? null : { collection: "users", id: 1, role },
    ...(options.withoutJson ? {} : { json: async () => body }),
    payload: { logger: { error: vi.fn() } },
  }) as unknown as PayloadRequest;

const invoke = async (
  endpoints: Endpoint[],
  name: string,
  req: PayloadRequest,
) => {
  const endpoint = endpoints.find(
    (candidate) => candidate.path === `/community-moderation/${name}`,
  );
  if (endpoint === undefined) throw new Error(`no endpoint ${name}`);
  const response = await (
    endpoint.handler as (req: PayloadRequest) => Promise<Response>
  )(req);
  return { status: response.status, body: await response.json() };
};

describe("Admin community moderation endpoint boundary", () => {
  it("approves through the complete envelope and forwards only the command body", async () => {
    const { call, calls } = recorder();
    const endpoints = createCommunityEndpoints(call);
    const result = await invoke(
      endpoints,
      "moderate-comment",
      request({ id: commentId, action: "approve" }),
    );
    expect(result).toEqual({ status: 200, body: { ok: true, result: { echoed: true } } });
    expect(calls).toEqual([
      {
        method: "POST",
        path: `comments/${commentId}/moderation`,
        body: { action: "approve" },
      },
    ]);
  });

  it.each([
    ["extra field", { id: commentId, action: "approve", note: "x" }],
    ["missing id", { action: "approve" }],
    ["missing action", { id: commentId }],
    ["unknown action", { id: commentId, action: "delete" }],
    ["malformed id", { id: "comment-x", action: "approve" }],
    ["actor label", { id: commentId, action: "approve", operatorLabel: "owner" }],
    ["non-object", "approve"],
  ])("rejects %s before any Backend call", async (_label, body) => {
    const { call, calls } = recorder();
    const endpoints = createCommunityEndpoints(call);
    const result = await invoke(endpoints, "moderate-comment", request(body));
    expect(result).toEqual({
      status: 400,
      body: { ok: false, error: { code: "COMMAND_INVALID" } },
    });
    expect(calls).toEqual([]);
  });

  it("covers hide, restore, reject and the user transitions the same way", async () => {
    const { call, calls } = recorder();
    const endpoints = createCommunityEndpoints(call);
    for (const action of ["reject", "hide", "unhide"] as const)
      await invoke(endpoints, "moderate-comment", request({ id: commentId, action }));
    for (const action of ["suspend", "reinstate"] as const)
      await invoke(endpoints, "moderate-user", request({ id: userId, action }));
    expect(calls).toEqual([
      { method: "POST", path: `comments/${commentId}/moderation`, body: { action: "reject" } },
      { method: "POST", path: `comments/${commentId}/moderation`, body: { action: "hide" } },
      { method: "POST", path: `comments/${commentId}/moderation`, body: { action: "unhide" } },
      { method: "POST", path: `users/${userId}/status`, body: { action: "suspend" } },
      { method: "POST", path: `users/${userId}/status`, body: { action: "reinstate" } },
    ]);
    expect(
      (await invoke(endpoints, "moderate-user", request({ id: commentId, action: "suspend" })))
        .status,
    ).toBe(400);
  });

  it("bounds a selection to fifty distinct ids and forwards it as one command", async () => {
    const { call, calls } = recorder();
    const endpoints = createCommunityEndpoints(call);
    const ids = Array.from(
      { length: 50 },
      (_value, index) => `comment-${index.toString(16).padStart(32, "0")}`,
    );
    expect(
      (await invoke(endpoints, "moderate-comments", request({ action: "hide", ids }))).status,
    ).toBe(200);
    expect(calls).toEqual([
      { method: "POST", path: "comments/moderation", body: { action: "hide", ids } },
    ]);
    for (const body of [
      { action: "hide", ids: [...ids, `comment-${"f".repeat(32)}`] },
      { action: "hide", ids: [ids[0], ids[0]] },
      { action: "hide", ids: [] },
      { action: "hide", ids, all: true },
    ])
      expect(
        (await invoke(endpoints, "moderate-comments", request(body))).status,
      ).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it("maps the queue, detail, history and summary queries onto the Backend routes", async () => {
    const { call, calls } = recorder();
    const endpoints = createCommunityEndpoints(call);
    await invoke(
      endpoints,
      "read-comments",
      request({ moderation: "pending", search: "字口", order: "oldest", page: 2, pageSize: 50 }),
    );
    await invoke(endpoints, "read-comment", request({ id: commentId }));
    await invoke(endpoints, "read-events", request({ subjectId: commentId, page: 3 }));
    await invoke(endpoints, "read-summary", request({ range: "30d" }));
    await invoke(endpoints, "read-summary", request({}));
    expect(calls).toEqual([
      {
        method: "GET",
        path: "comments?moderation=pending&search=%E5%AD%97%E5%8F%A3&order=oldest&page=2&pageSize=50",
      },
      { method: "GET", path: `comments/${commentId}` },
      { method: "GET", path: `moderation-events?subjectId=${commentId}&page=3` },
      { method: "GET", path: "summary?range=30d" },
      { method: "GET", path: "summary" },
    ]);
    for (const [name, body] of [
      ["read-comments", { moderation: "spam" }],
      ["read-comments", { search: "x".repeat(101) }],
      ["read-comments", { pageSize: 51 }],
      ["read-comment", { id: "nope" }],
      ["read-summary", { range: "1y" }],
    ] as const)
      expect((await invoke(endpoints, name, request(body))).status).toBe(400);
  });

  it("refuses every non-Owner caller and a missing JSON body before calling the Backend", async () => {
    const { call, calls } = recorder();
    const endpoints = createCommunityEndpoints(call);
    for (const role of ["automation", null] as const)
      expect(
        await invoke(
          endpoints,
          "moderate-comment",
          request({ id: commentId, action: "approve" }, role),
        ),
      ).toEqual({
        status: 403,
        body: { ok: false, error: { code: "COMMUNITY_OWNER_ONLY" } },
      });
    expect(
      await invoke(
        endpoints,
        "moderate-comment",
        request(undefined, "owner", { withoutJson: true }),
      ),
    ).toEqual({
      status: 400,
      body: { ok: false, error: { code: "JSON_BODY_REQUIRED" } },
    });
    expect(calls).toEqual([]);
  });

  it("passes the Backend's conflict and not-found answers through as their own codes", async () => {
    const failing = vi.fn(async (_method: string, path: string) => {
      throw new CommunityOperatorError(
        path.endsWith("/moderation") ? "STATE_CONFLICT" : "NOT_FOUND",
        path.endsWith("/moderation") ? 409 : 404,
      );
    }) as unknown as OperatorCall;
    const endpoints = createCommunityEndpoints(failing);
    expect(
      await invoke(endpoints, "moderate-comment", request({ id: commentId, action: "hide" })),
    ).toEqual({ status: 409, body: { ok: false, error: { code: "STATE_CONFLICT" } } });
    expect(await invoke(endpoints, "read-comment", request({ id: commentId }))).toEqual({
      status: 404,
      body: { ok: false, error: { code: "NOT_FOUND" } },
    });
  });
});
