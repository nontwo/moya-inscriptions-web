// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { author, shell, calls } = vi.hoisted(() => ({
  author: {
    viewer: null as { id: string } | null,
    checking: false,
    sessionError: false,
    signInHref: "/dev/community",
    revision: 0,
  },
  shell: { platform: "pc", openProfile: vi.fn() },
  calls: [] as { method: string; url: string; body: unknown }[],
}));
vi.mock("../authors/author-context", () => ({ useAuthors: () => author }));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => shell,
}));
vi.mock("../shell/request-identity", () => ({
  requestIdentity: () => "11111111-1111-4111-8111-111111111111",
}));
import { DirectMessagePanel } from "./direct-message-panel";
import { authorClient } from "./message-data";

const me = `user-${"1".repeat(32)}`;
const other = `user-${"2".repeat(32)}`;
const conversationId = `dm-${"c".repeat(32)}`;
const conversation = (over: Record<string, unknown> = {}) => ({
  id: conversationId,
  participant: { id: other, displayName: "书法学徒", available: true },
  state: "requested",
  canSend: false,
  sendRefusal: "request_pending",
  lastMessage: {
    sequence: 1,
    senderId: me,
    text: "你好",
    removed: false,
    createdAt: "2026-09-22T00:00:00.000Z",
  },
  unreadCount: 0,
  muted: false,
  hidden: false,
  readSequence: 1,
  createdAt: "2026-09-22T00:00:00.000Z",
  ...over,
});
const message = (sequence: number, senderId: string, text: string) => ({
  id: `dmsg-${String(sequence).repeat(32).slice(0, 32)}`,
  conversationId,
  sequence,
  senderId,
  text,
  removed: false,
  createdAt: "2026-09-22T00:00:01.000Z",
});
let state: "requested" | "active" = "requested";
const respond = (url: string, method: string, body: unknown) => {
  if (url.endsWith("/api/community/messages/unread"))
    return { unreadConversations: 0 };
  if (url.includes("/api/community/messages?"))
    return {
      items: [
        conversation({
          state,
          canSend: state === "active",
          sendRefusal: state === "active" ? null : "request_pending",
        }),
      ],
      nextCursor: null,
    };
  if (url.includes(`/api/community/messages/${conversationId}?`))
    return {
      conversation: conversation({
        state,
        canSend: state === "active",
        sendRefusal: state === "active" ? null : "request_pending",
      }),
      items:
        state === "active"
          ? [message(2, other, "在的"), message(1, me, "你好")]
          : [message(1, me, "你好")],
      nextBefore: null,
    };
  if (url.endsWith("/api/community/messages") && method === "POST") {
    const text = (body as { text: string }).text;
    return { status: 201, json: message(3, me, text) };
  }
  if (url.endsWith("/read"))
    return conversation({
      state,
      canSend: state === "active",
      sendRefusal: state === "active" ? null : "request_pending",
      readSequence: 2,
    });
  throw new Error(`unexpected ${method} ${url}`);
};

let node: HTMLDivElement;
let root: Root;
beforeEach(() => {
  calls.length = 0;
  state = "requested";
  author.viewer = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url: input, body });
      const answer = respond(input, method, body) as {
        status?: number;
        json?: unknown;
      };
      const status = "status" in answer && answer.status ? answer.status : 200;
      const payload =
        "json" in answer && answer.json !== undefined ? answer.json : answer;
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  node = document.createElement("div");
  document.body.appendChild(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
});
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

describe("DirectMessagePanel (content-community-completion-v1)", () => {
  it("shows the truthful signed-out state and makes no request", async () => {
    await act(async () =>
      root.render(<DirectMessagePanel onOpenProfile={vi.fn()} />),
    );
    expect(node.textContent).toContain("登录后查看私信");
    expect(calls).toEqual([]);
  });

  it("lists real conversations, explains the request gate and never fakes a sent message", async () => {
    author.viewer = { id: me };
    authorClient.setAccount(me);
    await act(async () =>
      root.render(<DirectMessagePanel onOpenProfile={vi.fn()} />),
    );
    await flush();
    expect(node.textContent).toContain("书法学徒");
    expect(node.textContent).toContain("等待对方回复");
    await act(async () =>
      (
        node.querySelector('button[aria-label^="打开与"]') as HTMLButtonElement
      ).click(),
    );
    await flush();
    expect(node.querySelector("[data-dm-refusal]")?.textContent).toContain(
      "等对方回复后才能继续发送",
    );
    expect(node.querySelector('textarea[aria-label="私信内容"]')).toBeNull();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("sends from the composer once the pair is active and appends the committed message", async () => {
    author.viewer = { id: me };
    authorClient.setAccount(me);
    state = "active";
    await act(async () =>
      root.render(<DirectMessagePanel onOpenProfile={vi.fn()} />),
    );
    await flush();
    await act(async () =>
      (
        node.querySelector('button[aria-label^="打开与"]') as HTMLButtonElement
      ).click(),
    );
    await flush();
    const textarea = node.querySelector(
      'textarea[aria-label="私信内容"]',
    ) as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(textarea, "太好了");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => textarea.closest("form")!.requestSubmit());
    await flush();
    const sent = calls.find(
      (c) => c.method === "POST" && c.url.endsWith("/api/community/messages"),
    );
    expect(sent?.body).toEqual({
      requestId: "11111111-1111-4111-8111-111111111111",
      conversationId,
      text: "太好了",
    });
    // The sender never travels in the body; the message list is re-read, not fabricated.
    expect(JSON.stringify(sent?.body)).not.toContain("senderId");
    const historyReads = calls.filter(
      (c) =>
        c.method === "GET" &&
        c.url.includes(`/api/community/messages/${conversationId}`),
    );
    expect(historyReads.length).toBeGreaterThanOrEqual(2);
    expect(calls.indexOf(historyReads.at(-1)!)).toBeGreaterThan(
      calls.indexOf(sent!),
    );
  });
});
