// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { AuthorProfile } from "@moya/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { people, command, mutate, notify, cycleTheme, cycleFeedLayout } =
  vi.hoisted(() => ({
    people: vi.fn(),
    command: vi.fn(),
    mutate: vi.fn(),
    notify: vi.fn(),
    cycleTheme: vi.fn(),
    cycleFeedLayout: vi.fn(),
  }));
vi.mock("./author-data", () => ({ authorClient: { people, command } }));
vi.mock("./author-context", () => ({
  useAuthors: () => ({ signInHref: "/dev/community", mutate, notify }),
}));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => ({
    feedLayout: "double",
    platform: "phone",
    theme: "system",
    cycleTheme,
    cycleFeedLayout,
  }),
}));

import { ProfileSettings } from "./profile-settings";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const profile: AuthorProfile = {
  id: "user-00000000000000000000000000000001",
  handle: "synthetic-settings-owner",
  displayName: "设置测试",
  bio: "",
  avatar: null,
  isOwner: true,
  following: false,
  privacy: {
    following: "public",
    followers: "private",
    favorites: "public",
    likes: "private",
  },
  totals: { works: 0, following: 0, followers: 0, favorites: 0, likes: 0 },
  nextAvatarChangeAt: null,
};
const sourceHistory = { screen: "profile" };
let root: Root | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  people.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
  command.mockResolvedValue({});
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    }),
  });
  window.history.replaceState(sourceHistory, "", "/#profile");
});
afterEach(async () => {
  // Neutralize the test-owned history marker before unmounting, so jsdom does
  // not leave an asynchronous history traversal for the following test.
  window.history.replaceState(sourceHistory, "", "/#profile");
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const render = async (owner: AuthorProfile | null) => {
  const node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const onClose = vi.fn();
  const onSaved = vi.fn();
  await act(async () =>
    root!.render(
      <ProfileSettings profile={owner} onClose={onClose} onSaved={onSaved} />,
    ),
  );
  return { node, onClose, onSaved };
};
const button = (node: HTMLElement, label: string) => {
  const control = Array.from(node.querySelectorAll("button")).find(
    (item) =>
      item.textContent === label || item.getAttribute("aria-label") === label,
  );
  if (!control) throw new Error(`Missing button: ${label}`);
  return control;
};
const click = async (node: HTMLElement, label: string) => {
  await act(async () => button(node, label).click());
};
const panelForTab = (node: HTMLElement, label: string) => {
  const tab = button(node, label);
  const panel = node.querySelector<HTMLElement>(
    `[id="${tab.getAttribute("aria-controls")}"]`,
  );
  if (!panel) throw new Error(`Missing panel: ${label}`);
  return panel;
};
const favoriteVisibility = (node: HTMLElement) => {
  const label = Array.from(node.querySelectorAll("label")).find((item) =>
    item.textContent?.includes("收藏列表"),
  );
  const control = label?.querySelector("select");
  if (!control) throw new Error("Missing favorites privacy control");
  return control;
};
const editFavorites = async (node: HTMLElement) => {
  await act(async () => {
    const control = favoriteVisibility(node);
    control.value = "private";
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

describe("My settings", () => {
  it("lets a guest use the existing display actions and asks for sign-in without account requests", async () => {
    const { node } = await render(null);
    expect(node.querySelector("dialog")?.open).toBe(true);
    expect(panelForTab(node, "显示").hidden).toBe(false);
    expect(panelForTab(node, "账户设置").hidden).toBe(true);
    await click(node, "切换主题：当前跟随系统");
    await click(node, "切换布局：当前双列");
    expect(cycleTheme).toHaveBeenCalledOnce();
    expect(cycleFeedLayout).toHaveBeenCalledOnce();

    await click(node, "账户设置");
    const account = panelForTab(node, "账户设置");
    expect(account.hidden).toBe(false);
    expect(account.querySelector("a")?.getAttribute("href")).toBe(
      "/dev/community",
    );
    expect(account.textContent).toContain("登录后管理账户设置");
    expect(account.querySelector("select")).toBeNull();
    expect(people).not.toHaveBeenCalled();
    expect(command).not.toHaveBeenCalled();
  });

  it("keeps an owner's unsaved privacy selection across tabs and guards both in-app and browser Back", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const forward = vi
      .spyOn(window.history, "forward")
      .mockImplementation(() => {});
    const { node, onClose } = await render(profile);
    expect(people).not.toHaveBeenCalled();
    await click(node, "账户设置");
    expect(people).toHaveBeenCalledWith(profile.id, "blocks", 1);
    await editFavorites(node);
    await click(node, "显示");
    await click(node, "账户设置");
    expect(favoriteVisibility(node).value).toBe("private");
    await click(node, "显示");

    await click(node, "返回");
    expect(confirm).toHaveBeenCalledWith("更改尚未保存，放弃这些更改？");
    expect(back).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(favoriteVisibility(node).value).toBe("private");
    expect(command).not.toHaveBeenCalled();

    await act(async () => {
      window.history.replaceState(sourceHistory, "", "/#profile");
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: sourceHistory }),
      );
    });
    expect(forward).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(favoriteVisibility(node).value).toBe("private");
    confirm.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: sourceHistory }),
      );
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("saves the chosen account privacy and clears the dirty guard while display preferences stay local", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { node, onSaved } = await render(profile);
    await click(node, "账户设置");
    await editFavorites(node);
    await click(node, "保存隐私设置");
    expect(command).toHaveBeenCalledOnce();
    expect(command).toHaveBeenCalledWith("me/privacy", {
      requestId: expect.any(String),
      privacy: { ...profile.privacy, favorites: "private" },
    });
    expect(onSaved).toHaveBeenCalledOnce();
    expect(mutate).toHaveBeenCalledOnce();

    await click(node, "显示");
    await click(node, "切换主题：当前跟随系统");
    await click(node, "切换布局：当前双列");
    expect(command).toHaveBeenCalledOnce();
    await click(node, "返回");
    expect(confirm).not.toHaveBeenCalled();
    expect(back).toHaveBeenCalledOnce();
  });
});
