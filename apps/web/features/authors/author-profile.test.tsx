// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthorProfile } from "@moya/contracts";
import type { Root } from "react-dom/client";

const { profileRead, author, trashPanel } = vi.hoisted(() => ({
  profileRead: vi.fn(),
  author: {
    cache: new Map<string, unknown>(),
    viewer: null as { id: string } | null,
    checking: false,
    sessionError: false,
    revision: 1,
    signInHref: "/dev/community",
    mutate: vi.fn(),
    notify: vi.fn(),
  },
  trashPanel: vi.fn(),
}));
vi.mock("./author-data", async (original) => ({
  ...(await original<typeof import("./author-data")>()),
  authorClient: { profile: profileRead, command: vi.fn() },
}));
vi.mock("./author-context", () => ({ useAuthors: () => author }));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => ({ platform: "phone", feedLayout: "double" }),
}));
vi.mock("../shell/horizontal-pager", () => ({ HorizontalPager: () => null }));
vi.mock("./avatar-editor", () => ({
  AvatarEntry: ({ children }: { children: unknown }) => (
    <div>{children as never}</div>
  ),
}));
vi.mock("./profile-list", () => ({ ProfileList: () => null }));
vi.mock("./people-list", () => ({ PeopleList: () => null }));
vi.mock("./profile-editor", () => ({ ProfileEditor: () => null }));
vi.mock("./profile-settings", () => ({ ProfileSettings: () => null }));
vi.mock("../publishing/ui/drafts/trash-panel", () => ({
  TrashPanel: (props: {
    onClose: () => void;
    onRestored: (id: string) => void;
  }) => {
    trashPanel(props);
    return (
      <div data-trash-panel-stub="">
        <button type="button" onClick={() => props.onRestored("work-x")}>
          模拟恢复
        </button>
        <button type="button" onClick={props.onClose}>
          模拟关闭
        </button>
      </div>
    );
  },
}));

import { AuthorProfileOverlay } from "./author-profile";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const OWNER = `user-${"1".repeat(32)}`;
const VISITOR = `user-${"2".repeat(32)}`;
const profile = (isOwner: boolean): AuthorProfile => ({
  id: OWNER,
  handle: "synthetic-owner",
  displayName: "作者",
  bio: "",
  avatar: null,
  isOwner,
  following: false,
  privacy: {
    following: "public",
    followers: "public",
    favorites: "public",
    likes: "public",
  },
  totals: { works: 0, following: 0, followers: 0, favorites: 0, likes: 0 },
  nextAvatarChangeAt: null,
});

let root: Root | null = null;
const overlay = () => (
  <AuthorProfileOverlay
    backButtonRef={createRef()}
    onClose={vi.fn()}
    onViewChange={vi.fn()}
    state={{
      kind: "profile",
      version: 2,
      authorId: OWNER,
      entryId: "entry-1",
      tab: "works",
      profileScrollTop: 0,
      sourceDestination: "home",
      sourceScrollTop: 0,
    }}
  />
);
const render = async () => {
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => root!.render(overlay()));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return node;
};
const findButton = (node: HTMLElement, text: string) =>
  Array.from(node.querySelectorAll("button")).find(
    (button) => button.textContent === text,
  );

beforeEach(() => {
  author.cache.clear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("Profile recycle bin entry", () => {
  it("lets the owner open the recycle bin and rereads lists after a restore", async () => {
    author.viewer = { id: OWNER };
    profileRead.mockResolvedValue(profile(true));
    const node = await render();
    const entry = findButton(node, "回收站");
    expect(entry).toBeDefined();
    expect(node.querySelector("[data-trash-panel-stub]")).toBeNull();
    await act(async () => entry!.click());
    expect(node.querySelector("[data-trash-panel-stub]")).not.toBeNull();
    await act(async () => findButton(node, "模拟恢复")!.click());
    expect(author.mutate).toHaveBeenCalledOnce();
    await act(async () => findButton(node, "模拟关闭")!.click());
    expect(node.querySelector("[data-trash-panel-stub]")).toBeNull();
  });

  it("offers no recycle bin for a remembered owner profile after the account changed", async () => {
    author.viewer = { id: VISITOR };
    author.cache.set(`profile:${OWNER}`, profile(true));
    profileRead.mockReturnValue(new Promise(() => undefined));
    const node = await render();
    expect(node.textContent).toContain("作者");
    expect(findButton(node, "回收站")).toBeUndefined();
  });

  it("closes the recycle bin when the signed-in viewer is no longer the owner", async () => {
    author.viewer = { id: OWNER };
    profileRead.mockResolvedValue(profile(true));
    const node = await render();
    await act(async () => findButton(node, "回收站")!.click());
    expect(node.querySelector("[data-trash-panel-stub]")).not.toBeNull();
    author.viewer = { id: VISITOR };
    await act(async () => root!.render(overlay()));
    expect(node.querySelector("[data-trash-panel-stub]")).toBeNull();
    expect(findButton(node, "回收站")).toBeUndefined();
    // Back to the owner: the panel does not come back by itself.
    author.viewer = { id: OWNER };
    await act(async () => root!.render(overlay()));
    expect(node.querySelector("[data-trash-panel-stub]")).toBeNull();
  });

  it("never shows the recycle bin on someone else's profile", async () => {
    author.viewer = { id: VISITOR };
    profileRead.mockResolvedValue(profile(false));
    const node = await render();
    expect(node.textContent).toContain("作者");
    expect(findButton(node, "回收站")).toBeUndefined();
    expect(trashPanel).not.toHaveBeenCalled();
  });
});
