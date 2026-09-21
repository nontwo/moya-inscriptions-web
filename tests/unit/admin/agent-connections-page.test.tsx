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
 * click, that every registered client is reachable and starts the one it
 * names, and that "authorized" is not printed for a connection with nothing
 * behind it.
 *
 * Three of these tests exist because an independent review found the earlier
 * page deciding, from a registration's `family`, which clients were "real".
 * The integration guide tells integrators that `family` is any value, and the
 * acceptance harness registers a test identity under `family: "cursor"`, so
 * that rule was wrong in both directions. These pin the replacement: the
 * family selects setup copy, and nothing else.
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

  it("leaves no registered client without a way to connect it", async () => {
    // `verification` is a family this page has no setup copy for. The earlier
    // rule hid such a client outside Development, which left a legitimately
    // registered client with no button anywhere on the page.
    vi.stubGlobal("fetch", mockFetch(result({ environment: "production" })));
    render(createElement(AgentConnectionsClient));
    await screen.findByText("连接新应用");
    const others = document.querySelector("[data-agent-connections-others]");
    expect(others?.textContent).toContain("Local verification client");
    expect(
      others?.querySelector("[data-agent-connections-start]"),
    ).not.toBeNull();
  });

  it("shows every registered client exactly once, whatever its family", async () => {
    // The invariant behind the whole grouping change: the preset cards and the
    // overflow card PARTITION the registry. Nothing is listed twice, and
    // nothing falls through the gap between them.
    const families = [
      "cursor",
      "claude",
      "codex",
      "acme-agent",
      "verification",
    ];
    vi.stubGlobal(
      "fetch",
      mockFetch(
        result({
          connections: [],
          clients: families.map((family, index) => ({
            clientId: `client-${index}`,
            family,
            label: `Client ${index}`,
          })),
        }),
      ),
    );
    render(createElement(AgentConnectionsClient));
    await screen.findByText("连接新应用");
    const started = [
      ...document.querySelectorAll("[data-agent-connections-start]"),
    ].map((node) => node.getAttribute("data-agent-connections-start"));
    expect([...started].sort()).toEqual(
      families.map((_, index) => `client-${index}`).sort(),
    );
    for (const family of families)
      expect(
        screen.getAllByText(`Client ${families.indexOf(family)}`),
      ).toHaveLength(1);
  });

  it("gives a second registration in one family its own named button", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        result({
          connections: [],
          clients: [
            {
              clientId: "artvenn-cursor-readonly",
              family: "cursor",
              label: "Cursor Desktop",
            },
            {
              clientId: "artvenn-cursor-second",
              family: "cursor",
              // The harness registers a test identity under `family: "cursor"`
              // exactly like this, so a card that shows only the first one
              // makes the second unreachable and mislabels what it starts.
              label: "Hostname callback client",
            },
          ],
        }),
      ),
    );
    render(createElement(AgentConnectionsClient));
    const card = await waitFor(() => {
      const found = document.querySelector(
        '[data-agent-connections-preset="cursor"]',
      );
      expect(found).not.toBeNull();
      return found as Element;
    });
    expect(card.textContent).toContain("Cursor Desktop");
    expect(card.textContent).toContain("Hostname callback client");

    const second = card.querySelector(
      '[data-agent-connections-start="artvenn-cursor-second"]',
    );
    expect(second).not.toBeNull();
    fireEvent.click(second as Element);
    await waitFor(() => expect(posted).toHaveLength(1));
    // THE PROPERTY. The button starts the registration it is named after.
    expect(posted[0]?.body).toEqual({ clientId: "artvenn-cursor-second" });
  });

  it("does not offer to start a client that is already connected", async () => {
    vi.stubGlobal("fetch", mockFetch(result()));
    render(createElement(AgentConnectionsClient));
    const card = await waitFor(() => {
      const found = document.querySelector(
        '[data-agent-connections-preset="cursor"]',
      );
      expect(found).not.toBeNull();
      return found as Element;
    });
    expect(card.textContent).toContain("已连接");
    expect(
      card.querySelector(
        '[data-agent-connections-start="artvenn-cursor-readonly"]',
      ),
    ).toBeNull();
  });

  it("names the connection in the confirmation, not a fixed product", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        result({
          connections: [
            connection({ client: "acme", clientLabel: "ACME agent" }),
          ],
        }),
      ),
    );
    render(createElement(AgentConnectionsClient));
    fireEvent.click(await screen.findByText("断开"));
    const dialog = await waitFor(() => {
      const found = document.querySelector("[data-agent-connections-confirm]");
      expect(found?.textContent).toContain("ACME agent");
      return found as Element;
    });
    expect(dialog.textContent).not.toContain("Cursor");
    expect(dialog.textContent).toContain("还没过期的令牌");
  });

  it("opens the addresses in place instead of linking off the page", async () => {
    vi.stubGlobal("fetch", mockFetch(result()));
    render(createElement(AgentConnectionsClient));
    const other = await waitFor(() => {
      const found = document.querySelector("[data-agent-connections-other]");
      expect(found).not.toBeNull();
      return found as Element;
    });
    // The guide this used to link to does not exist on `main`.
    expect(other.querySelector("a")).toBeNull();

    const advanced = document.querySelector(
      "[data-agent-connections-advanced]",
    ) as HTMLDetailsElement;
    expect(advanced.open).toBe(false);
    fireEvent.click(
      other.querySelector("[data-agent-connections-show-advanced]") as Element,
    );
    await waitFor(() => expect(advanced.open).toBe(true));
    expect(advanced.textContent).toContain("http://localhost:3452/api/mcp");
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
