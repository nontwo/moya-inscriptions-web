// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { CommentSection } from "./comment-section";
import { useQaCommentStore } from "./use-qa-comment-store";

import type { Root } from "react-dom/client";
import type { QaCommentScenarioName } from "./comment-scenarios";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const currentUser = {
  avatarSrc: null,
  id: "qa-user-01",
  name: "访碑者",
} as const;

const TestHost = ({
  catalogId = "catalog-a",
  scenario,
}: {
  readonly catalogId?: string;
  readonly scenario: QaCommentScenarioName;
}) => {
  const store = useQaCommentStore(scenario);
  return (
    <CommentSection
      catalogId={catalogId}
      currentUser={currentUser}
      items={store.getItems(catalogId)}
      onSendComment={(text) => store.sendComment(catalogId, text, currentUser)}
      onSendReply={(target, text) =>
        store.sendReply(catalogId, target, text, currentUser)
      }
      onToggleLike={(commentId, replyId) =>
        store.toggleLike(catalogId, commentId, replyId)
      }
      scenario={scenario}
    />
  );
};

const render = (scenario: QaCommentScenarioName = "comment-default") => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<TestHost scenario={scenario} />));
  return { container, root };
};

const click = (element: Element | null) => {
  if (!(element instanceof HTMLElement)) throw new Error("Missing element");
  act(() => element.click());
};

const fill = (textarea: HTMLTextAreaElement | null, value: string) => {
  if (textarea === null) throw new Error("Missing textarea");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe("CommentSection", () => {
  it("sends trimmed comments, updates the total count and keeps blank input disabled", () => {
    const { container } = render();
    const title = container.querySelector("h2");
    const textarea = container.querySelector("textarea");
    const send = container.querySelector<HTMLButtonElement>(
      '[data-comment-composer] button[type="submit"]',
    );

    expect(title?.textContent).toBe("评论 6");
    expect(send?.disabled).toBe(true);
    fill(textarea, "   ");
    expect(send?.disabled).toBe(true);
    fill(textarea, "  这里的字形很有意思。  ");
    expect(send?.disabled).toBe(false);
    click(send);

    expect(title?.textContent).toBe("评论 7");
    expect(container.textContent).toContain("这里的字形很有意思。");
    expect(container.querySelector("textarea")?.value).toBe("");
    expect(
      container.querySelector("[data-comment-list]")?.firstElementChild
        ?.textContent,
    ).toContain("访碑者");
  });

  it("replies at depth two and toggles likes without reordering", () => {
    const { container } = render();
    const firstComment = container.querySelector("[data-comment-id]");
    const firstId = firstComment?.getAttribute("data-comment-id");
    click(firstComment?.querySelector("[data-comment-reply-action]") ?? null);
    expect(container.textContent).toContain("回复 墨池散人");
    fill(container.querySelector("textarea"), "赞同这个观察。");
    click(
      container.querySelector('[data-comment-composer] button[type="submit"]'),
    );

    expect(container.querySelector("h2")?.textContent).toBe("评论 7");
    expect(firstComment?.textContent).toContain("赞同这个观察。");
    const like = firstComment?.querySelector("[data-comment-like]");
    click(like ?? null);
    expect(like?.getAttribute("aria-pressed")).toBe("true");
    expect(
      container
        .querySelector("[data-comment-id]")
        ?.getAttribute("data-comment-id"),
    ).toBe(firstId);
  });

  it("expands and collapses replies and reverses only fixture order for latest", () => {
    const { container } = render();
    const firstComment = container.querySelector("[data-comment-id]");
    expect(firstComment?.querySelectorAll("[data-comment-reply]")).toHaveLength(
      2,
    );
    const expand = firstComment?.querySelector("[data-comment-expand-replies]");
    click(expand ?? null);
    expect(firstComment?.querySelectorAll("[data-comment-reply]")).toHaveLength(
      3,
    );
    expect(expand?.getAttribute("aria-expanded")).toBe("true");
    click(expand ?? null);
    expect(firstComment?.querySelectorAll("[data-comment-reply]")).toHaveLength(
      2,
    );

    const sort = container.querySelector<HTMLSelectElement>(
      "[data-comment-sort]",
    );
    if (sort === null) throw new Error("Missing sort control");
    act(() => {
      sort.value = "latest";
      sort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      container.querySelector("[data-comment-list]")?.firstElementChild
        ?.textContent,
    ).toContain("期待以后还能看到更多局部图");
  });

  it("renders empty, loading and scenario-reset states truthfully", () => {
    const { container, root } = render("comment-empty");
    expect(container.querySelector("[data-comment-empty]")).not.toBeNull();
    expect(container.querySelector("textarea")).not.toBeNull();
    act(() => root.render(<TestHost scenario="comment-loading" />));
    expect(container.querySelector("[role=status]")).not.toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("[data-comment-sort]")).toBeNull();
    act(() => root.render(<TestHost scenario="comment-long" />));
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(container.textContent).toContain("一位名字很长");
  });

  it("keeps local comments isolated by Catalog ID", () => {
    const { container, root } = render();
    fill(container.querySelector("textarea"), "只属于甲资料的评论");
    click(
      container.querySelector('[data-comment-composer] button[type="submit"]'),
    );
    expect(container.textContent).toContain("只属于甲资料的评论");

    act(() =>
      root.render(
        <TestHost catalogId="catalog-b" scenario="comment-default" />,
      ),
    );
    expect(container.textContent).not.toContain("只属于甲资料的评论");
    expect(container.querySelector("h2")?.textContent).toBe("评论 6");

    act(() =>
      root.render(
        <TestHost catalogId="catalog-a" scenario="comment-default" />,
      ),
    );
    expect(container.textContent).toContain("只属于甲资料的评论");
    expect(container.querySelector("h2")?.textContent).toBe("评论 7");
  });

  it("renders image thumbnails and sticker media from presentation fixtures", () => {
    const { container } = render("comment-media");
    const image = container.querySelector<HTMLElement>(
      '[data-comment-media-kind="image"]',
    );
    const sticker = container.querySelector<HTMLElement>(
      '[data-comment-media-kind="sticker"]',
    );

    expect(image?.querySelector("img")?.alt).toBe("评论中的碑刻局部缩略图");
    expect(sticker?.querySelector("img")?.alt).toBe(
      "评论回复中的表情包展示占位",
    );
    expect(container.textContent).toContain(
      "补一张局部图，和正文放在一起更容易理解转折位置。",
    );
  });
});
