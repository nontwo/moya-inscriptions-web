// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const { shell, contentActions } = vi.hoisted(() => ({
  shell: { openContent: vi.fn() },
  contentActions: vi.fn(),
}));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => shell,
}));
vi.mock("./content-actions", () => ({
  useContentActions: (...args: unknown[]) => {
    contentActions(...args);
    return {
      environment: { onAction: vi.fn(), likedIds: [], favoriteIds: [] },
    };
  },
}));

import { ContentCard } from "./content-card";

import type { ContentCard as Card } from "@moya/contracts";
import type { Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const workId = `work-${"d".repeat(32)}`;
const itemId = `item-${"e".repeat(32)}`;
const cover = {
  id: itemId,
  src: `/api/community/publishing/media/${itemId}/cover/base`,
  width: 600,
  height: 800,
};
const card = (overrides: Partial<Card>): Card => ({
  aliases: [],
  target: { type: "work", id: workId },
  title: "春日临帖",
  kind: null,
  authorId: `user-${"f".repeat(32)}`,
  firstPublishedAt: "2026-09-13T12:00:00.000Z",
  media: cover,
  ...overrides,
});

const roots: Root[] = [];
const render = (item: Card, variant?: "feed" | "inscription") => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(<ContentCard item={item} {...(variant ? { variant } : {})} />),
  );
  return container.querySelector<HTMLElement>("article")!;
};

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("ContentCard for works", () => {
  it("marks a Live Photo cover with a static LIVE badge and nothing that plays", () => {
    const live = render(card({ live: true }));
    const badge = live.querySelector("[data-card-live-badge]");
    expect(badge?.textContent).toBe("LIVE");
    expect(badge?.getAttribute("aria-label")).toBe("实况照片");
    // The badge sits on the valid cover itself.
    expect(badge?.closest('[data-catalog-media-state="valid"]')).not.toBeNull();
    expect(live.querySelector("video")).toBeNull();
    expect(live.querySelector("img")?.getAttribute("src")).toBe(cover.src);
  });

  it("shows no LIVE badge on a static cover, on an unset flag or without a cover", () => {
    expect(
      render(card({ live: false })).querySelector("[data-card-live-badge]"),
    ).toBeNull();
    expect(render(card({})).querySelector("[data-card-live-badge]")).toBeNull();
    expect(
      render(
        card({ live: true, media: null, excerpt: "只有文字" }),
      ).querySelector("[data-card-live-badge]"),
    ).toBeNull();
  });

  it("renders a text-only work as its own excerpt, with no invented cover", () => {
    const text = render(
      card({ media: null, excerpt: "第一行正文\n第二行正文" }),
    );
    expect(text.hasAttribute("data-card-text-only")).toBe(true);
    expect(text.querySelector("[data-catalog-media-state]")).toBeNull();
    expect(text.querySelector("img")).toBeNull();
    expect(text.textContent).not.toContain("暂无公开图像");
    expect(text.querySelector("h3")?.textContent).toBe("春日临帖");
    expect(text.querySelector("[data-card-excerpt]")?.textContent).toBe(
      "第一行正文\n第二行正文",
    );
  });

  it("keeps an untitled text-only work's title empty and uses the excerpt alone", () => {
    const text = render(card({ title: "", media: null, excerpt: "无题正文" }));
    expect(text.querySelector("h3")).toBeNull();
    expect(text.querySelector("[data-card-excerpt]")?.textContent).toBe(
      "无题正文",
    );
    // Labels and share text use the UI-only name; the stored title stays empty.
    expect(
      text.querySelector("[data-quick-actions]")?.getAttribute("aria-label"),
    ).toBe("打开未命名作品");
    expect(contentActions).toHaveBeenCalledWith(
      { type: "work", id: workId },
      "未命名作品",
    );
  });

  it("lets a media-only work omit its empty title", () => {
    const mediaOnly = render(card({ title: "" }));
    expect(mediaOnly.querySelector("img")).not.toBeNull();
    expect(mediaOnly.querySelector("h3")).toBeNull();
    expect(mediaOnly.querySelector("[data-card-excerpt]")).toBeNull();
    expect(mediaOnly.textContent).toBe("");
  });

  it("keeps a titled media card and its activation unchanged", () => {
    const titled = render(card({ excerpt: "正文开头" }));
    expect(titled.querySelector("h3")?.textContent).toBe("春日临帖");
    expect(titled.querySelector("[data-card-excerpt]")).toBeNull();
    const action = titled.querySelector<HTMLButtonElement>(
      "[data-quick-actions]",
    )!;
    act(() => action.click());
    expect(shell.openContent).toHaveBeenCalledWith(
      { type: "work", id: workId },
      action,
    );
  });
});
