// @vitest-environment jsdom
import { act, createRef, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { openTopic, pagerState } = vi.hoisted(() => ({
  openTopic: vi.fn(),
  pagerState: {
    commit: (_key: string) => {
      void _key;
    },
    guard: (): boolean => true,
  },
}));
vi.mock("../authors/preview-author-profile", () => ({
  PreviewAuthorProfile: ({
    name,
    onClose,
  }: {
    name: string;
    onClose: () => void;
  }) => (
    <div data-official-profile-bridge={name}>
      <button onClick={onClose}>返回主页来源</button>
    </div>
  ),
}));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => ({
    openTopic,
    readActiveScrollTop: () => 321,
    platform: "phone",
  }),
}));
// Gesture recognition is covered by the shared pager suite and browser checks;
// this boundary exercises the article's mutually exclusive comment modes.
vi.mock("../shell/horizontal-pager", async () => {
  const { forwardRef, useImperativeHandle, useLayoutEffect, useRef } =
    await import("react");
  return {
    HorizontalPager: forwardRef(function Pager(
      props: {
        keys: string[];
        panels: Record<string, ReactNode>;
        activeKey: string;
        onCommit: (key: string) => void;
        canStartGesture?: () => boolean;
        registerActiveScrollElement?: (element: HTMLElement) => () => void;
        panelAttributes: (key: string) => Record<string, string>;
      },
      ref,
    ) {
      const panels = useRef<Record<string, HTMLDivElement | null>>({});
      useLayoutEffect(() => {
        const panel = panels.current[props.activeKey];
        if (panel) return props.registerActiveScrollElement?.(panel);
      }, [props.activeKey, props.registerActiveScrollElement]);
      useImperativeHandle(ref, () => ({ scrollToKey: props.onCommit }));
      pagerState.commit = props.onCommit;
      pagerState.guard = props.canStartGesture ?? (() => true);
      return (
        <div data-test-pager="">
          {props.keys.map((key) => (
            <div
              key={key}
              ref={(element) => {
                panels.current[key] = element;
              }}
              {...props.panelAttributes(key)}
              hidden={props.activeKey !== key}
            >
              {props.panels[key]}
            </div>
          ))}
        </div>
      );
    }),
  };
});
import {
  DiscussionPreviewProvider,
  useDiscussionPreview,
} from "./preview-context";
import type { PreviewCommentLocation } from "./preview-context";
import {
  DiscussionPreviewDetail,
  DiscussionPreviewFeed,
} from "./discussion-preview";
import {
  previewArticles,
  previewFeed,
  previewSpecials,
  previewTopics,
} from "./preview-data";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let node: HTMLDivElement;
const backRef = createRef<HTMLButtonElement>();
const close = vi.fn();
const render = async (child: ReactNode, enabled = true) =>
  act(async () =>
    root.render(
      <DiscussionPreviewProvider enabled={enabled}>
        {child}
      </DiscussionPreviewProvider>,
    ),
  );
const detail = (id: string) => (
  <DiscussionPreviewDetail
    key={id}
    id={id}
    backButtonRef={backRef}
    onClose={close}
  />
);
const QueuedCommentDetail = ({
  location,
}: {
  location: PreviewCommentLocation;
}) => {
  const state = useDiscussionPreview()!;
  const queueCommentLocation = state.queueCommentLocation;
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    queueCommentLocation(location);
    setReady(true);
  }, [location, queueCommentLocation]);
  return ready ? detail(location.topicId) : null;
};
const button = (name: string) => {
  const result = [...node.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) =>
      item.textContent?.trim() === name ||
      item.getAttribute("aria-label") === name,
  );
  if (!result) throw new Error(`Missing button: ${name}`);
  return result;
};
const click = async (name: string) => act(async () => button(name).click());
const input = async (el: HTMLTextAreaElement, text: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
beforeEach(() => {
  // Model history traversal synchronously so integration assertions wait for
  // real popstate behavior rather than relying on jsdom timer scheduling.
  const replace = window.history.replaceState.bind(window.history);
  const entries: unknown[] = [{}];
  let index = 0;
  replace(entries[0], "");
  vi.spyOn(window.history, "replaceState").mockImplementation((state) => {
    entries[index] = state;
    replace(state, "");
  });
  vi.spyOn(window.history, "pushState").mockImplementation((state) => {
    entries.splice(index + 1);
    entries.push(state);
    index++;
    replace(state, "");
  });
  const traverse = (delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    index = target;
    replace(entries[index], "");
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: entries[index] }),
    );
  };
  vi.spyOn(window.history, "back").mockImplementation(() => traverse(-1));
  vi.spyOn(window.history, "go").mockImplementation((delta = 0) =>
    traverse(delta),
  );
  vi.stubEnv("NODE_ENV", "development");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Frontend preview must not fetch");
    }),
  );
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    fn(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:preview-image"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  openTopic.mockClear();
  close.mockClear();
});
afterEach(async () => {
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    root.unmount();
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Discussion frontend preview", () => {
  it("keeps production and unopted compositions free of sample feeds", async () => {
    await render(<DiscussionPreviewFeed feed="news" />, false);
    expect(node.textContent).toBe("");
    vi.stubEnv("NODE_ENV", "production");
    await render(<DiscussionPreviewFeed feed="news" />);
    expect(node.textContent).toBe("");
  });
  it("shows exactly 22 text-only topics ordered by heat and marks opened entries read", async () => {
    await render(<DiscussionPreviewFeed feed="threads" />);
    expect(previewTopics).toHaveLength(22);
    expect(previewTopics.map((item) => item.heat)).toEqual(
      previewTopics.map((item) => item.heat).sort((a, b) => b - a),
    );
    expect(node.querySelectorAll("ol li")).toHaveLength(22);
    expect(node.querySelector("img")).toBeNull();
    const entry = node.querySelector<HTMLButtonElement>(
      '[data-topic-id="thread-4"]',
    )!;
    await act(async () => entry.click());
    expect(entry.dataset.read).toBe("true");
    expect(openTopic).toHaveBeenCalledWith("thread-4", entry, 321);
    expect(
      node
        .querySelector('[data-topic-id="thread-3"]')
        ?.getAttribute("data-read"),
    ).toBe("false");
  });
  it("interleaves large and compact news cards while keeping every card readable", async () => {
    await render(<DiscussionPreviewFeed feed="news" />);
    const cards = [
      ...node.querySelectorAll<HTMLButtonElement>("[data-news-layout]"),
    ];
    expect(cards).toHaveLength(previewArticles.length);
    expect(cards.map((card) => card.dataset.newsLayout)).toEqual([
      "large",
      "compact",
      "compact",
      "large",
      "compact",
      "compact",
      "large",
      "compact",
    ]);
    expect(cards.every((card) => card.querySelector("img"))).toBe(true);
    await act(async () => cards[3]!.click());
    expect(openTopic).toHaveBeenCalledWith(
      previewArticles[3]!.id,
      cards[3],
      321,
    );
  });
  it("routes each fixture to the correct feed and preserves unknown formal topics", () => {
    expect(previewFeed(previewArticles[0]!.id)).toBe("news");
    expect(previewFeed("thread-22")).toBe("threads");
    expect(previewFeed(previewSpecials[0]!.id)).toBe("topics");
    expect(previewFeed("formal-topic")).toBeNull();
  });
  it("opens academic articles directly from image cards without feed slogans", async () => {
    await render(<DiscussionPreviewFeed feed="topics" />);
    expect(node.querySelectorAll("[data-topic-id] img")).toHaveLength(
      previewSpecials.length,
    );
    expect(node.textContent).not.toContain("进入专题");
    expect(node.textContent).not.toContain("选读");
    await render(detail(previewSpecials[0]!.id));
    expect(node.querySelector("[data-academic-reader]")).not.toBeNull();
    expect(node.textContent).toContain("引用");
  });
  it.each([previewArticles[0]!.id, previewSpecials[0]!.id])(
    "preserves %s reading position and drafts across side and inline comments",
    async (id) => {
      await render(detail(id));
      const reader = node.querySelector<HTMLElement>(
        '[data-reading-page="reading"]',
      )!;
      Object.defineProperties(reader, {
        scrollHeight: { value: 1800 },
        clientHeight: { value: 600 },
      });
      reader.scrollTop = 420;
      await act(async () => pagerState.commit("comments"));
      const draft = node.querySelector<HTMLTextAreaElement>("textarea")!;
      await input(draft, "保留的评论草稿");
      expect(
        node
          .querySelector("[data-comment-composer-outlet]")
          ?.getAttribute("data-active"),
      ).toBe("true");
      await act(async () => pagerState.commit("reading"));
      expect(reader.scrollTop).toBe(420);
      reader.scrollTop = 1200;
      await act(async () =>
        reader.dispatchEvent(new Event("scroll", { bubbles: true })),
      );
      expect(
        node
          .querySelector("[data-preview-reader]")
          ?.getAttribute("data-comment-mode"),
      ).toBe("inline");
      expect(pagerState.guard()).toBe(false);
      expect(node.querySelectorAll("textarea")).toHaveLength(1);
      expect(node.querySelector("textarea")).toBe(draft);
      expect(draft.value).toBe("保留的评论草稿");
      expect(node.querySelectorAll("[data-preview-comments]")).toHaveLength(1);
      expect(node.querySelector('[data-reading-page="reading"]')).toBe(reader);
      expect(reader.scrollTop).toBe(1200);
      const boundary = node.querySelector<HTMLElement>(
        "[data-inline-comments]",
      )!;
      vi.spyOn(reader, "getBoundingClientRect").mockReturnValue({
        top: 0,
        bottom: 600,
      } as DOMRect);
      vi.spyOn(boundary, "getBoundingClientRect").mockReturnValue({
        top: 650,
        bottom: 900,
      } as DOMRect);
      reader.scrollTop = 400;
      await act(async () =>
        reader.dispatchEvent(new Event("scroll", { bubbles: true })),
      );
      expect(pagerState.guard()).toBe(true);
      expect(node.querySelector("textarea")).toBe(draft);
      expect(draft.value).toBe("保留的评论草稿");
      expect(
        node
          .querySelector("[data-preview-reader]")
          ?.getAttribute("data-comment-mode"),
      ).toBe("paged");
      expect(reader.scrollTop).toBe(400);
      expect(node.textContent).not.toContain("查看评论");
    },
  );
  it("routes post and comment avatars to the official profile bridge", async () => {
    await render(detail("thread-1"));
    await click("查看秋山的主页");
    expect(
      node
        .querySelector("[data-official-profile-bridge]")
        ?.getAttribute("data-official-profile-bridge"),
    ).toBe("秋山");
    await click("返回主页来源");
    await click("阅读秋山的帖子");
    const avatar = node.querySelector<HTMLButtonElement>(
      '[data-preview-comments] button[aria-label*="观石"]',
    )!;
    expect(avatar).not.toBeNull();
    await act(async () => avatar.click());
    expect(
      node
        .querySelector("[data-official-profile-bridge]")
        ?.getAttribute("data-official-profile-bridge"),
    ).toBe("观石");
  });
  it("opens a news comment activity on the exact original comment", async () => {
    const location = {
      topicId: "news-field-notes",
      contentId: "news-field-notes",
      commentId: "news-field-notes-comment-1",
      rootCommentId: "news-field-notes-comment-1",
    } as const;
    await render(<QueuedCommentDetail location={location} />);
    const commentsPage = node.querySelector<HTMLElement>(
      '[data-reading-page="comments"]',
    )!;
    const target = node.querySelector<HTMLElement>(
      '[data-comment-id="news-field-notes-comment-1"]',
    )!;
    expect(commentsPage.hidden).toBe(false);
    expect(target.textContent).toContain(
      "石面上的岁月痕迹也很动人，谢谢你记录下来。",
    );
    expect(target.classList.contains("phase4-comment-highlight")).toBe(true);
    expect(target.getAttribute("aria-current")).toBe("true");
  });
  it("opens a topic post activity on the exact original comment", async () => {
    const location = {
      topicId: "thread-1",
      contentId: "thread-1-post-1",
      commentId: "thread-1-post-1-comment-2",
      rootCommentId: "thread-1-post-1-comment-2",
    } as const;
    await render(<QueuedCommentDetail location={location} />);
    expect(
      node.querySelector('[data-post-reader="thread-1-post-1"]')?.textContent,
    ).toContain("关于“初次访碑");
    const target = node.querySelector<HTMLElement>(
      '[data-comment-id="thread-1-post-1-comment-2"]',
    )!;
    expect(target.textContent).toContain("纸墨的质感很美。");
    expect(target.classList.contains("phase4-comment-highlight")).toBe(true);
    expect(target.getAttribute("aria-current")).toBe("true");
    await click("返回评论消息");
    expect(close).toHaveBeenCalledOnce();
  });
  it("restores the topic position after leaving full-screen composition", async () => {
    await render(detail("thread-1"));
    const list = node.querySelector<HTMLElement>("[data-topic-scroll]")!;
    list.scrollTop = 645;
    await click("参与话题");
    expect(node.querySelector("[data-topic-scroll]")).toBeNull();
    await click("返回话题");
    expect(
      node.querySelector<HTMLElement>("[data-topic-scroll]")?.scrollTop,
    ).toBe(645);
  });

  it("publishes a local post and isolates comments between individual posts", async () => {
    await render(detail("thread-1"));
    await click("参与话题");
    await input(
      node.querySelector<HTMLTextAreaElement>("#discussion-post-draft")!,
      "这是我在现场的一点观察。",
    );
    await click("发布帖子");
    expect(node.textContent).toContain("已发布");
    await click("阅读我的帖子");
    expect(node.querySelector("[data-post-reader]")?.textContent).toContain(
      "这是我在现场的一点观察。",
    );
    expect(
      node.querySelector("[data-preview-comments]")?.textContent,
    ).not.toContain("观石");
    const comment = node.querySelector<HTMLTextAreaElement>("textarea")!;
    await input(comment, "针对这篇帖子的一条评论");
    await click("发送");
    expect(
      node.querySelector("[data-preview-comments]")?.textContent,
    ).toContain("针对这篇帖子的一条评论");
    await click("返回话题");
    await click("阅读秋山的帖子");
    expect(
      node.querySelector("[data-preview-comments]")?.textContent,
    ).not.toContain("针对这篇帖子的一条评论");
    await click("返回话题");
    await click("阅读我的帖子");
    expect(
      node.querySelector("[data-preview-comments]")?.textContent,
    ).toContain("针对这篇帖子的一条评论");
  });
  it("rejects unsupported images and releases removed local image previews", async () => {
    await render(detail("thread-1"));
    await click("参与话题");
    const upload = node.querySelector<HTMLInputElement>('input[type="file"]')!;
    const choose = async (files: File[]) =>
      act(async () => {
        Object.defineProperty(upload, "files", {
          configurable: true,
          value: files,
        });
        upload.dispatchEvent(new Event("change", { bubbles: true }));
      });
    await choose([
      new File(["<svg />"], "image.svg", { type: "image/svg+xml" }),
    ]);
    expect(node.querySelector('[role="alert"]')).not.toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    await choose([new File(["image"], "image.png", { type: "image/png" })]);
    expect(node.querySelector('[role="alert"]')).toBeNull();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    await click("移除图片 1");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-image");
  });
  it("leaves the composer before opening a post and disposes only unpublished attachments", async () => {
    await render(detail("thread-1"));
    await click("参与话题");
    const upload = node.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      Object.defineProperty(upload, "files", {
        configurable: true,
        value: [new File(["image"], "image.png", { type: "image/png" })],
      });
      upload.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(node.querySelector("[data-post-compose]")).not.toBeNull();
    expect(node.querySelector('[aria-label="阅读秋山的帖子"]')).toBeNull();
    await click("返回话题");
    await click("阅读秋山的帖子");
    expect(
      node.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    ).toBe("帖子");
    await click("返回话题");
    expect(node.querySelector("[data-post-reader]")).toBeNull();
    await render(detail("thread-2"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-image");
  });
});
