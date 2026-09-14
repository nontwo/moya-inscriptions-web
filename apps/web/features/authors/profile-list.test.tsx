// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Root } from "react-dom/client";

const { works, author, draftsCard } = vi.hoisted(() => ({
  works: vi.fn(),
  author: {
    cache: new Map<string, unknown>(),
    viewer: null as { id: string } | null,
    revision: 1,
    guestFavorites: [],
  },
  draftsCard: vi.fn(),
}));
vi.mock("./author-data", async (original) => ({
  ...(await original<typeof import("./author-data")>()),
  authorClient: { works, collection: vi.fn(), card: vi.fn() },
}));
vi.mock("./author-context", () => ({ useAuthors: () => author }));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => ({ platform: "phone", feedLayout: "double" }),
}));
vi.mock("./content-card", () => ({
  ContentCard: ({ item }: { item: { target: { id: string } } }) => (
    <article data-work-card={item.target.id} role="listitem" />
  ),
}));
vi.mock("../publishing/ui/drafts/drafts-card", () => ({
  DraftsCard: (props: { accountId: string; active: boolean }) => {
    draftsCard(props);
    return <article data-drafts-card={props.accountId} role="listitem" />;
  },
}));

import { ProfileList } from "./profile-list";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OWNER = `user-${"1".repeat(32)}`;
const VISITOR = `user-${"2".repeat(32)}`;
const work = (n: number) => ({
  id: `work-${String(n).padStart(32, "0")}`,
  title: `作品${n}`,
  authorId: OWNER,
  firstPublishedAt: "2026-09-01T00:00:00.000Z",
  media: [],
  available: true,
});

let root: Root | null = null;
const render = async (props: {
  authorId: string | null;
  owner: boolean;
  tab?: "works" | "favorites" | "likes";
}) => {
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () =>
    root!.render(
      <ProfileList
        active
        authorId={props.authorId}
        entryId="entry-1"
        owner={props.owner}
        tab={props.tab ?? "works"}
      />,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return node;
};
const cards = (node: HTMLElement) =>
  Array.from(node.querySelectorAll("[role='listitem']")).map((card) =>
    card.getAttribute("data-drafts-card") !== null
      ? "drafts"
      : card.getAttribute("data-work-card"),
  );

beforeEach(() => {
  author.cache.clear();
  author.viewer = null;
  works.mockResolvedValue({
    items: [work(1), work(2)],
    page: 1,
    pageSize: 12,
    total: 2,
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("Profile works drafts card", () => {
  it("puts the drafts card first in the signed-in owner's own Works tab", async () => {
    author.viewer = { id: OWNER };
    const node = await render({ authorId: OWNER, owner: true });
    expect(cards(node)).toEqual(["drafts", work(1).id, work(2).id]);
    expect(draftsCard).toHaveBeenLastCalledWith({
      accountId: OWNER,
      active: true,
      onSettled: expect.any(Function),
    });
  });

  it("never gives a visitor the drafts card", async () => {
    author.viewer = { id: VISITOR };
    const node = await render({ authorId: OWNER, owner: false });
    expect(cards(node)).toEqual([work(1).id, work(2).id]);
    expect(draftsCard).not.toHaveBeenCalled();
  });

  it("never gives a signed-out visitor the drafts card", async () => {
    const node = await render({ authorId: OWNER, owner: false });
    expect(cards(node)).toEqual([work(1).id, work(2).id]);
    expect(draftsCard).not.toHaveBeenCalled();
  });

  it("does not trust an owner flag that disagrees with the confirmed viewer", async () => {
    author.viewer = { id: VISITOR };
    const node = await render({ authorId: OWNER, owner: true });
    expect(cards(node)).not.toContain("drafts");
    expect(draftsCard).not.toHaveBeenCalled();
  });

  it("keeps drafts out of the owner's other tabs", async () => {
    author.viewer = { id: OWNER };
    const node = await render({
      authorId: OWNER,
      owner: true,
      tab: "favorites",
    });
    expect(cards(node)).not.toContain("drafts");
    expect(draftsCard).not.toHaveBeenCalled();
  });
});
