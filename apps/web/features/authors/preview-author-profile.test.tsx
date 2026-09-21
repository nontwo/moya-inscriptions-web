// @vitest-environment jsdom
import { act } from "react";
import type { ComponentProps, ReactNode, Ref } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  profileRead,
  command,
  profileList,
  peopleList,
  privateControl,
  author,
} = vi.hoisted(() => ({
  profileRead: vi.fn(),
  command: vi.fn(),
  profileList: vi.fn(() => null),
  peopleList: vi.fn(() => null),
  privateControl: vi.fn(() => null),
  author: {
    cache: new Map<string, unknown>(),
    viewer: null as { id: string } | null,
    checking: false,
    sessionError: false,
    revision: 0,
    signInHref: "/dev/community",
    mutate: vi.fn(),
    notify: vi.fn(),
  },
}));

vi.mock("./author-data", async (original) => ({
  ...(await original<typeof import("./author-data")>()),
  authorClient: { profile: profileRead, command },
}));
vi.mock("./author-context", () => ({ useAuthors: () => author }));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => ({
    platform: "phone",
    activeDestination: "discussion",
    feedLayout: "double",
  }),
}));
vi.mock("../shell/horizontal-pager", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    HorizontalPager: ({
      ref,
      activeKey,
      onCommit,
      panels,
      visible,
    }: {
      ref: Ref<{ scrollToKey: (tab: string) => void }>;
      activeKey: string;
      onCommit: (tab: string) => void;
      panels: Record<string, ReactNode>;
      visible: boolean;
    }) => {
      useImperativeHandle(ref, () => ({ scrollToKey: onCommit }));
      return (
        <div
          data-profile-pager={activeKey}
          data-pager-visible={String(visible)}
        >
          {panels[activeKey]}
        </div>
      );
    },
  };
});
vi.mock("./profile-list", () => ({ ProfileList: profileList }));
vi.mock("./people-list", () => ({ PeopleList: peopleList }));
vi.mock("./avatar-editor", () => ({ AvatarEntry: privateControl }));
vi.mock("./profile-editor", () => ({ ProfileEditor: privateControl }));
vi.mock("./profile-background-editor", () => ({
  ProfileBackgroundEditor: privateControl,
}));
vi.mock("./profile-settings", () => ({ ProfileSettings: privateControl }));

// The bridge and its AuthorProfileOverlay are real. Only live data surfaces and
// the pager's browser geometry are substituted, matching author-profile.test.
import { PreviewAuthorProfile } from "./preview-author-profile";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let node: HTMLDivElement;
const onClose = vi.fn();
const onFollowChange = vi.fn();
const render = async (
  props: Partial<ComponentProps<typeof PreviewAuthorProfile>> = {},
) =>
  act(async () =>
    root.render(
      <PreviewAuthorProfile
        enabled
        name="秋山"
        onClose={onClose}
        onFollowChange={onFollowChange}
        {...props}
      />,
    ),
  );
const button = (label: string) => {
  const found = [...node.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) =>
      element.textContent === label ||
      element.getAttribute("aria-label") === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const click = (label: string) => act(async () => button(label).click());
const expectLocalOnly = () => {
  expect(profileRead).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect(author.cache.get).not.toHaveBeenCalled();
  expect(author.cache.set).not.toHaveBeenCalled();
  expect(author.mutate).not.toHaveBeenCalled();
  expect(author.notify).not.toHaveBeenCalled();
  expect(profileList).not.toHaveBeenCalled();
  expect(peopleList).not.toHaveBeenCalled();
  expect(privateControl).not.toHaveBeenCalled();
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  author.cache.clear();
  author.viewer = null;
  author.checking = false;
  author.sessionError = false;
  author.revision = 0;
  vi.spyOn(author.cache, "get");
  vi.spyOn(author.cache, "set");
  profileRead.mockRejectedValue(new Error("Preview must not load an account"));
  command.mockResolvedValue({});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Preview must not fetch");
    }),
  );
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Official author profile with local preview data", () => {
  it.each([
    { mode: "guest", signedIn: false, checking: false, sessionError: false },
    { mode: "signed in", signedIn: true, checking: false, sessionError: false },
    { mode: "checking", signedIn: true, checking: true, sessionError: false },
    {
      mode: "failed session",
      signedIn: true,
      checking: false,
      sessionError: true,
    },
  ])(
    "shows the official visitor layout without live activity for $mode",
    async ({ signedIn, checking, sessionError }) => {
      author.viewer = signedIn ? { id: `user-${"1".repeat(32)}` } : null;
      author.checking = checking;
      author.sessionError = sessionError;
      await render();

      const profile = node.querySelector<HTMLElement>("[data-author-profile]");
      expect(profile?.getAttribute("data-author-profile")).toMatch(
        /^user-[0-9a-f]{32}$/u,
      );
      expect(profile?.getAttribute("role")).toBe("dialog");
      expect(profile?.getAttribute("aria-label")).toBe("作者主页");
      expect(node.querySelector("h1")?.textContent).toBe("秋山");
      expect(node.querySelector('[aria-label="主页背景"]')).not.toBeNull();
      expect(node.querySelector('[aria-label="用户资料"]')).not.toBeNull();
      expect(node.querySelector('[aria-label="用户内容"]')).not.toBeNull();
      expect(
        [...node.querySelectorAll('[role="tab"]')].map(
          (tab) => tab.textContent,
        ),
      ).toEqual(["作品", "收藏", "喜欢"]);
      expect(button("作品").getAttribute("aria-selected")).toBe("true");
      expect(node.textContent).toContain("暂无可显示的内容");
      expect(node.querySelector('[aria-label="主页管理"]')).toBeNull();
      expect(node.querySelector('[aria-label="编辑主页背景"]')).toBeNull();
      expect(node.querySelector("a")).toBeNull();
      expect(document.activeElement).toBe(button("返回"));
      expectLocalOnly();
    },
  );

  it("does not offer self-follow for the current user's avatar", async () => {
    await render({ name: "我" });
    expect(node.querySelector("h1")?.textContent).toBe("我");
    expect(
      [...node.querySelectorAll("button")].some((item) =>
        ["关注", "取消关注"].includes(item.textContent ?? ""),
      ),
    ).toBe(false);
    expectLocalOnly();
  });

  it("keeps local follow, selected tab and scroll through real account changes", async () => {
    await render();
    const profile = node.querySelector<HTMLElement>("[data-author-profile]")!;
    const identity = profile.getAttribute("data-author-profile");
    await click("关注");
    expect(button("取消关注").getAttribute("aria-pressed")).toBe("true");
    expect(onFollowChange).toHaveBeenLastCalledWith(true);
    await click("喜欢");
    expect(button("喜欢").getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      profile.scrollTop = 180;
      profile.dispatchEvent(new Event("scroll"));
    });

    author.viewer = { id: `user-${"2".repeat(32)}` };
    author.checking = true;
    author.sessionError = true;
    author.revision++;
    await render();
    expect(node.querySelector("[data-author-profile]")).toBe(profile);
    expect(profile.getAttribute("data-author-profile")).toBe(identity);
    expect(profile.scrollTop).toBe(180);
    expect(button("喜欢").getAttribute("aria-selected")).toBe("true");
    expect(button("取消关注").getAttribute("aria-pressed")).toBe("true");
    await click("取消关注");
    expect(button("关注").getAttribute("aria-pressed")).toBe("false");
    expect(onFollowChange.mock.calls).toEqual([[true], [false]]);
    expectLocalOnly();
  });

  it("uses the caller's modal and Back callback without taking browser history", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    const back = vi.spyOn(window.history, "back");
    await render({ insideDialog: true, followed: true });
    const profile = node.querySelector<HTMLElement>("[data-author-profile]")!;
    expect(profile.getAttribute("role")).toBe("region");
    expect(profile.hasAttribute("aria-modal")).toBe(false);
    expect(node.querySelector('dialog, [role="dialog"]')).toBeNull();
    expect(button("取消关注").getAttribute("aria-pressed")).toBe("true");
    await click("返回");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expectLocalOnly();
  });

  it("opens a different author with fresh local profile state", async () => {
    await render();
    const original = node.querySelector("[data-author-profile]")!;
    const originalId = original.getAttribute("data-author-profile");
    await click("关注");
    await click("收藏");
    await render({ name: "观石" });
    expect(node.querySelector("h1")?.textContent).toBe("观石");
    expect(
      node
        .querySelector("[data-author-profile]")
        ?.getAttribute("data-author-profile"),
    ).not.toBe(originalId);
    expect(original.isConnected).toBe(false);
    expect(button("作品").getAttribute("aria-selected")).toBe("true");
    expect(button("关注").getAttribute("aria-pressed")).toBe("false");
    expectLocalOnly();
  });

  it("does not expose fixture profiles in production", async () => {
    author.viewer = { id: `user-${"3".repeat(32)}` };
    await render({ enabled: false });
    expect(node.childElementCount).toBe(0);
    expect(onFollowChange).not.toHaveBeenCalled();
    expectLocalOnly();
  });
});
