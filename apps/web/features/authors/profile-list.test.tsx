// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Root } from "react-dom/client";

const { works, author, draftsCard, cardItems } = vi.hoisted(() => ({
  works: vi.fn(),
  cardItems: [] as import("@moya/contracts").ContentCard[],
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
  ContentCard: ({ item }: { item: import("@moya/contracts").ContentCard }) => {
    cardItems.push(item);
    return <article data-work-card={item.target.id} role="listitem" />;
  },
}));
vi.mock("../publishing/ui/drafts/drafts-card", () => ({
  DraftsCard: (props: { accountId: string; active: boolean }) => {
    draftsCard(props);
    return <article data-drafts-card={props.accountId} role="listitem" />;
  },
}));

import { ProfileList, workCard, workCardExcerpt } from "./profile-list";

import type { UserWork, WorkMedia } from "@moya/contracts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OWNER = `user-${"1".repeat(32)}`;
const VISITOR = `user-${"2".repeat(32)}`;
const work = (n: number, overrides: Partial<UserWork> = {}): UserWork => ({
  id: `work-${String(n).padStart(32, "0")}`,
  authorId: OWNER,
  authorName: "作者",
  title: `作品${n}`,
  text: "",
  firstPublishedAt: "2026-09-01T00:00:00.000Z",
  media: [],
  version: 1,
  canEdit: false,
  available: true,
  ...overrides,
});
const itemId = (n: number) => `media-item-${String(n).padStart(32, "0")}`;
const still = (n: number): WorkMedia => ({
  id: itemId(n),
  src: `/api/community/publishing/media/${itemId(n)}/display/base`,
  width: 800 + n,
  height: 600,
  kind: "static",
});
const live = (n: number): WorkMedia => ({
  id: itemId(n),
  src: `/api/community/publishing/media/${itemId(n)}/display/base`,
  width: 900,
  height: 1200,
  kind: "live",
  motionSrc: `/api/community/publishing/media/${itemId(n)}/motion/base`,
  hasAudio: true,
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
  cardItems.length = 0;
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

describe("Profile works cards", () => {
  it("uses the revision's chosen cover, marks a Live cover and passes only the card media fields", () => {
    const card = workCard(
      work(1, { media: [still(1), live(2)], coverMediaId: itemId(2) }),
    );
    expect(card.media).toEqual({
      id: itemId(2),
      src: `/api/community/publishing/media/${itemId(2)}/display/base`,
      width: 900,
      height: 1200,
    });
    expect(card.live).toBe(true);
  });

  it("falls back to the first media without a known cover, and a static cover is not Live", () => {
    for (const coverMediaId of [undefined, null, itemId(9)]) {
      const card = workCard(
        work(1, {
          media: [still(1), live(2)],
          ...(coverMediaId === undefined ? {} : { coverMediaId }),
        }),
      );
      expect(card.media?.id).toBe(itemId(1));
      expect(card.live).toBe(false);
    }
  });

  it("gives a text-only work its body opening instead of a cover", () => {
    const card = workCard(
      work(1, { title: "", text: "  \r\n第一行\r\n第二行  \n", media: [] }),
    );
    expect(card.media).toBeNull();
    expect(card.live).toBe(false);
    expect(card.title).toBe("");
    expect(card.excerpt).toBe("第一行\n第二行");
    expect("excerpt" in workCard(work(2, { text: " \n " }))).toBe(false);
  });

  it("cuts the excerpt at 160 code points with the shared rule and trims after cutting", () => {
    const astral = "𠀀".repeat(159);
    // 159 astral characters, a space, then more: the cut ends on the space.
    expect(workCardExcerpt(`${astral} 后面的文字`)).toBe(astral);
    const long = "字".repeat(200);
    const excerpt = workCardExcerpt(long);
    expect([...excerpt]).toHaveLength(160);
    expect(workCardExcerpt("短正文")).toBe("短正文");
  });

  it("renders the Works tab from the works themselves", async () => {
    works.mockResolvedValue({
      items: [
        work(1, { media: [still(1), live(2)], coverMediaId: itemId(2) }),
        work(2, { title: "", text: "只有正文" }),
      ],
      page: 1,
      pageSize: 12,
      total: 2,
    });
    const node = await render({ authorId: OWNER, owner: false });
    expect(cards(node)).toEqual([work(1).id, work(2).id]);
    expect(cardItems.at(-2)).toMatchObject({
      target: { type: "work", id: work(1).id },
      live: true,
      media: { id: itemId(2) },
    });
    expect(cardItems.at(-1)).toMatchObject({
      target: { type: "work", id: work(2).id },
      title: "",
      excerpt: "只有正文",
      media: null,
    });
  });
});
