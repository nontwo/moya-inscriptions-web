// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgentConnectionsClient } from "admin/agent-connections-client";

/**
 * The `AI 连接` page, at the points where the redesign added logic of its own
 * rather than markup.
 *
 * Everything else about this page is rendering, and rendering is what the
 * screenshots are for. What is worth a test is the behaviour a reader cannot
 * check by looking: that a destructive action does not fire on the first
 * click, that a test identity is not offered as a normal connection option,
 * and that "authorized" is not printed for a connection with nothing behind
 * it.
 */

const connection = (overrides: Record<string, unknown> = {}) => ({
  id: "conn-0123456789abcdef0123456789abcdef",
  client: "cursor",
  clientLabel: "Cursor Desktop",
  principalLabel: "agent-cursor-0123456789ab",
  oauthClientId: "artvenn-cursor-readonly",
  environment: "synthetic",
  preset: "read-only",
  status: "authorized",
  generation: 1,
  consentedAt: "2026-09-21T00:00:00.000Z",
  revokedAt: null,
  lastVerifiedAt: "2026-09-21T00:01:00.000Z",
  hasCurrentGrant: true,
  ...overrides,
});

const result = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  result: {
    connections: [connection()],
    clients: [
      {
        clientId: "artvenn-cursor-readonly",
        family: "cursor",
        label: "Cursor Desktop",
      },
      {
        clientId: "artvenn-local-verify",
        family: "verification",
        label: "Local verification client",
      },
    ],
    environment: "synthetic",
    issuer: "http://127.0.0.1:3451",
    resource: "http://localhost:3452/api/mcp",
    authMethod: "oauth-browser-consent",
    ...overrides,
  },
});

let posted: { url: string; body: unknown }[] = [];

const mockFetch = (payload: unknown) =>
  vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
    if (init?.method === "POST")
      posted.push({ url: String(url), body: JSON.parse(init.body ?? "{}") });
    return {
      ok: true,
      json: async () => (init?.method === "POST" ? { ok: true } : payload),
    } as unknown as Response;
  });

beforeEach(() => {
  posted = [];
  // jsdom implements neither modal dialogs nor the clipboard.
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.open = true;
    };
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
    ) {
      this.open = false;
    };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the AI connections page", () => {
  it("does not disconnect on the first click; it asks", async () => {
    vi.stubGlobal("fetch", mockFetch(result()));
    render(createElement(AgentConnectionsClient));
    const disconnect = await screen.findByText("断开");

    fireEvent.click(disconnect);
    await screen.findByText(/断开 Cursor Desktop/u);
    // THE PROPERTY. Opening the confirmation must not have revoked anything.
    expect(posted).toEqual([]);

    fireEvent.click(screen.getByText("确认断开"));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]?.url).toContain("/api/agent-connections/disconnect");
    expect(posted[0]?.body).toEqual({ id: connection().id });
  });

  it("cancels without disconnecting", async () => {
    vi.stubGlobal("fetch", mockFetch(result()));
    render(createElement(AgentConnectionsClient));
    fireEvent.click(await screen.findByText("断开"));
    await screen.findByText(/断开 Cursor Desktop/u);
    fireEvent.click(screen.getByText("取消"));
    await waitFor(() => expect(screen.queryByText("确认断开")).toBeNull());
    expect(posted).toEqual([]);
  });

  it("keeps test identities out of the normal connect list", async () => {
    vi.stubGlobal("fetch", mockFetch(result()));
    render(createElement(AgentConnectionsClient));
    await screen.findByText("连接新应用");
    const utilities = document.querySelector(
      "[data-agent-connections-utilities]",
    );
    expect(utilities?.textContent).toContain("Local verification client");
    const presets = document.querySelectorAll(
      "[data-agent-connections-preset]",
    );
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets)
      expect(preset.textContent).not.toContain("Local verification client");
  });

  it("hides the test section outside Development", async () => {
    vi.stubGlobal("fetch", mockFetch(result({ environment: "production" })));
    render(createElement(AgentConnectionsClient));
    await screen.findByText("连接新应用");
    expect(
      document.querySelector("[data-agent-connections-utilities]"),
    ).toBeNull();
  });

  it("does not call a connection authorized when nothing is behind it", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        result({ connections: [connection({ hasCurrentGrant: false })] }),
      ),
    );
    render(createElement(AgentConnectionsClient));
    expect(await screen.findByText("需要重新授权")).toBeTruthy();
    expect(screen.queryByText("已授权")).toBeNull();
  });

  it("moves a revoked connection out of the primary list into history", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        result({
          connections: [
            connection({
              status: "revoked",
              revokedAt: "2026-09-21T00:02:00.000Z",
              hasCurrentGrant: false,
            }),
          ],
        }),
      ),
    );
    render(createElement(AgentConnectionsClient));
    await screen.findByText(/还没有已连接的应用/u);
    const history = document.querySelector("[data-agent-connections-history]");
    expect(history?.textContent).toContain("Cursor Desktop");
    expect(history?.textContent).toContain("已断开");
  });

  it("shows no identifier in the primary row until details are opened", async () => {
    vi.stubGlobal("fetch", mockFetch(result()));
    render(createElement(AgentConnectionsClient));
    const card = await waitFor(() => {
      const found = document.querySelector("[data-agent-connection]");
      expect(found).not.toBeNull();
      return found as Element;
    });
    expect(card.textContent).not.toContain("artvenn-cursor-readonly");
    expect(card.textContent).not.toContain("agent-cursor-0123456789ab");

    fireEvent.click(screen.getByText("查看详情"));
    await waitFor(() =>
      expect(
        document.querySelector("[data-agent-connection]")?.textContent,
      ).toContain("artvenn-cursor-readonly"),
    );
  });
});
