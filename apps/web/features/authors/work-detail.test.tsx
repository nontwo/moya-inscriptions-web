// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class PublishingRequestError extends Error {
    constructor(
      readonly status: number,
      message: string,
      readonly code: string | null = null,
      readonly outcomeUnknown = false,
    ) {
      super(message);
    }
  }
  class AuthorRequestError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    PublishingRequestError,
    AuthorRequestError,
    author: {
      viewer: null as { id: string } | null,
      checking: false,
      sessionError: false,
      notify: vi.fn(),
      mutate: vi.fn(),
    },
    shell: { openProfile: vi.fn(), openContent: vi.fn() },
    entry: { checking: false, openEditor: vi.fn(() => true) },
    publishing: { setVisibility: vi.fn(), trashWork: vi.fn() },
    work: vi.fn(),
  };
});
vi.mock("./author-context", () => ({ useAuthors: () => mocks.author }));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => mocks.shell,
}));
vi.mock("../publishing/publishing-entry", () => ({
  usePublishingEntry: () => mocks.entry,
}));
vi.mock("../publishing/publishing-data", () => ({
  publishingClient: mocks.publishing,
  PublishingRequestError: mocks.PublishingRequestError,
}));
vi.mock("./author-data", () => ({
  authorClient: { work: mocks.work },
  AuthorRequestError: mocks.AuthorRequestError,
}));
vi.mock("./content-actions", () => ({
  ContentActions: ({ title }: { title: string }) => (
    <div data-content-actions={title} />
  ),
  useContentActions: () => ({ environment: {} }),
}));
vi.mock("./local-library", () => ({ recordLocalHistory: vi.fn() }));
// The native modal's history handling has its own tests; here only its use.
vi.mock("./author-dialog", () => ({
  AuthorDialog: ({
    title,
    onClose,
    children,
  }: {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
  }) => (
    <div aria-label={title} data-test-dialog="" role="dialog">
      <button onClick={onClose} type="button">
        返回
      </button>
      {children}
    </div>
  ),
}));

import { CatalogDetailWithdrawalContext } from "../detail/catalog-detail-withdrawal";
import { DetailActions, loadWorkDetail } from "./work-detail";

import type { UserWork } from "@moya/contracts";
import type { Root } from "react-dom/client";
import type { CatalogDetailPresentation } from "../detail/catalog-detail-presentation";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const AUTHOR = `user-${"a".repeat(32)}`;
const OTHER = `user-${"b".repeat(32)}`;
const WORK = `work-${"c".repeat(32)}`;

const detail = (
  overrides: Partial<
    Extract<CatalogDetailPresentation, { contentType: "work" }>
  >,
): CatalogDetailPresentation => ({
  contentType: "work",
  id: WORK,
  authorId: AUTHOR,
  authorName: "临帖人",
  canEdit: true,
  available: true,
  firstPublishedAt: "2026-09-10T08:00:00.000Z",
  editedAt: null,
  visibility: "public",
  title: "春日临帖",
  aliases: [],
  facts: [],
  media: [],
  sections: [],
  source: "runtime",
  sourceCitations: [],
  ...overrides,
});

const roots: Root[] = [];
const render = (
  presentation: CatalogDetailPresentation,
  withdraw: ((id: string, notice: unknown) => void) | null = null,
) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const draw = (next: CatalogDetailPresentation) =>
    act(() =>
      root.render(
        withdraw === null ? (
          <DetailActions detail={next} />
        ) : (
          <CatalogDetailWithdrawalContext.Provider value={withdraw}>
            <DetailActions detail={next} />
          </CatalogDetailWithdrawalContext.Provider>
        ),
      ),
    );
  draw(presentation);
  const button = (name: string) =>
    [...container.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent === name,
    );
  const status = () =>
    container.querySelector("[data-work-management-status]")?.textContent;
  return { button, container, draw, status };
};

beforeEach(() => {
  mocks.author.viewer = { id: AUTHOR };
  // Focus restoration waits a frame; run it at once.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 0;
  });
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("Work detail actions for the author", () => {
  it("never shows author controls to a third party", () => {
    mocks.author.viewer = { id: OTHER };
    const thirdParty = render(detail({ canEdit: false }));
    expect(
      thirdParty.container.querySelector("[data-work-management]"),
    ).toBeNull();
    expect(thirdParty.button("编辑")).toBeUndefined();
    expect(thirdParty.button("移到回收站")).toBeUndefined();
    expect(
      thirdParty.container.querySelector("[data-content-actions]"),
    ).not.toBeNull();

    // A stale canEdit for a different signed-in account shows nothing either.
    const stale = render(detail({ canEdit: true }));
    expect(stale.container.querySelector("[data-work-management]")).toBeNull();

    mocks.author.viewer = null;
    const guest = render(detail({ canEdit: false }));
    expect(guest.container.querySelector("[data-work-management]")).toBeNull();
  });

  it("opens the editor for this work", () => {
    const view = render(detail({}));
    const edit = view.button("编辑")!;
    act(() => edit.click());
    expect(mocks.entry.openEditor).toHaveBeenCalledExactlyOnceWith(
      { type: "work", id: WORK },
      edit,
    );
  });

  it("asks before making the work self-only, then reports exactly what changed", async () => {
    mocks.publishing.setVisibility.mockResolvedValue({
      workId: WORK,
      visibility: "self",
    });
    const view = render(detail({}));
    const group = view.container.querySelector('[role="group"]')!;
    expect(group.getAttribute("data-work-visibility")).toBe("public");
    expect(view.button("公开")?.getAttribute("aria-pressed")).toBe("true");

    act(() => view.button("仅自己可见")!.click());
    const dialog = view.container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("设为仅自己可见");
    expect(dialog?.textContent).toContain("其他人将无法打开这件作品");
    expect(mocks.publishing.setVisibility).not.toHaveBeenCalled();

    // Cancelling changes nothing.
    act(() =>
      [...dialog!.querySelectorAll("button")]
        .find((b) => b.textContent === "取消")!
        .click(),
    );
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.publishing.setVisibility).not.toHaveBeenCalled();

    act(() => view.button("仅自己可见")!.click());
    await act(async () =>
      view.container
        .querySelector<HTMLButtonElement>("[data-confirm-private]")!
        .click(),
    );
    expect(mocks.publishing.setVisibility).toHaveBeenCalledExactlyOnceWith(
      WORK,
      {
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
        visibility: "self",
      },
    );
    expect(view.status()).toBe("可见范围已改为仅自己可见");
    expect(view.button("仅自己可见")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(mocks.author.mutate).toHaveBeenCalledOnce();
  });

  it("makes a self-only work public without a confirmation, in neutral wording", async () => {
    mocks.publishing.setVisibility.mockResolvedValue({
      workId: WORK,
      visibility: "public",
    });
    const view = render(detail({ visibility: "self" }));
    await act(async () => view.button("公开")!.click());
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(mocks.publishing.setVisibility).toHaveBeenCalledWith(WORK, {
      requestId: expect.any(String),
      visibility: "public",
    });
    expect(view.status()).toBe("可见范围已改为公开");
    expect(view.container.textContent).not.toMatch(/审核|待|已发布给/u);
  });

  it("moves the work to the recycle bin only after confirmation", async () => {
    mocks.publishing.trashWork.mockResolvedValue({ deleted: true });
    const view = render(detail({}));
    act(() => view.button("移到回收站")!.click());
    const dialog = view.container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("移到回收站");
    expect(dialog?.textContent).toContain("恢复后为仅自己可见");
    expect(mocks.publishing.trashWork).not.toHaveBeenCalled();

    await act(async () =>
      view.container
        .querySelector<HTMLButtonElement>("[data-confirm-trash]")!
        .click(),
    );
    expect(mocks.publishing.trashWork).toHaveBeenCalledExactlyOnceWith(WORK, {
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
    });
    expect(view.status()).toBe("作品已移到回收站");
    expect(view.button("编辑")).toBeUndefined();
    expect(view.container.querySelector("[data-content-actions]")).toBeNull();
    expect(mocks.author.mutate).toHaveBeenCalledOnce();
  });

  it("shows a field-neutral failure and repeats an unconfirmed command with the same request", async () => {
    mocks.publishing.trashWork
      .mockRejectedValueOnce(
        new mocks.PublishingRequestError(
          0,
          "网络连接中断，结果尚未确认",
          null,
          true,
        ),
      )
      .mockResolvedValueOnce({ deleted: true });
    const view = render(detail({}));
    act(() => view.button("移到回收站")!.click());
    await act(async () =>
      view.container
        .querySelector<HTMLButtonElement>("[data-confirm-trash]")!
        .click(),
    );
    expect(view.status()).toBe("网络连接中断，结果尚未确认");
    expect(view.button("编辑")).toBeDefined();
    await act(async () => view.button("重试")!.click());
    const [first, second] = mocks.publishing.trashWork.mock.calls;
    expect(second?.[1]).toEqual(first?.[1]);
    expect(view.status()).toBe("作品已移到回收站");
  });

  it("never labels the author's own self-only or not yet public work, and offers public interactions only on a public work", () => {
    const actions = (view: ReturnType<typeof render>) =>
      view.container.querySelector("[data-content-actions]");
    // The Backend lets the author open these (available), but likes,
    // favorites and sharing only exist on a work others can see.
    const selfOnly = render(
      detail({ available: true, visibility: "self", firstPublishedAt: null }),
    );
    expect(selfOnly.container.querySelector("[data-work-notice]")).toBeNull();
    expect(selfOnly.button("编辑")).toBeDefined();
    expect(actions(selfOnly)).toBeNull();

    const publishedSelfOnly = render(detail({ visibility: "self" }));
    expect(actions(publishedSelfOnly)).toBeNull();

    const pendingFirst = render(
      detail({ available: true, visibility: "public", firstPublishedAt: null }),
    );
    expect(
      pendingFirst.container.querySelector("[data-work-notice]"),
    ).toBeNull();
    expect(pendingFirst.container.textContent).not.toMatch(
      /审核|待发布|不可公开访问/u,
    );
    expect(actions(pendingFirst)).toBeNull();

    const published = render(detail({}));
    expect(actions(published)?.getAttribute("data-content-actions")).toBe(
      "春日临帖",
    );

    mocks.author.viewer = { id: OTHER };
    const thirdParty = render(detail({ canEdit: false, available: false }));
    expect(thirdParty.container.textContent).toContain(
      "此作品当前不可公开访问。",
    );
    expect(actions(thirdParty)).toBeNull();
  });

  it("tells the author neutrally when their work is not shown to others for another reason", () => {
    // Not available to its own author outside the recycle bin: e.g. hidden by an operator.
    const hidden = render(detail({ available: false, visibility: "public" }));
    expect(
      hidden.container.querySelector("[data-work-notice]")?.textContent,
    ).toBe("此作品当前不对其他人显示。");
    expect(hidden.container.textContent).not.toMatch(/审核|违规|管理员/u);
    expect(hidden.container.querySelector("[data-content-actions]")).toBeNull();
    expect(hidden.button("编辑")).toBeDefined();
  });

  it("drops public interactions once the author makes the work self-only", async () => {
    mocks.publishing.setVisibility.mockResolvedValue({
      workId: WORK,
      visibility: "self",
    });
    const view = render(detail({}));
    expect(
      view.container.querySelector("[data-content-actions]"),
    ).not.toBeNull();
    act(() => view.button("仅自己可见")!.click());
    await act(async () =>
      view.container
        .querySelector<HTMLButtonElement>("[data-confirm-private]")!
        .click(),
    );
    expect(view.container.querySelector("[data-content-actions]")).toBeNull();
  });

  it("keeps the focus on the switch while the change runs and after its result", async () => {
    let answer: (value: unknown) => void = () => undefined;
    mocks.publishing.setVisibility.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const view = render(detail({}));
    const privateButton = view.button("仅自己可见")!;
    privateButton.focus();
    act(() => privateButton.click());
    act(() =>
      view.container
        .querySelector<HTMLButtonElement>("[data-confirm-private]")!
        .click(),
    );
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    // Unavailable but still focusable: the focus is not dropped to the page.
    expect(document.activeElement).toBe(privateButton);
    expect(privateButton.getAttribute("aria-disabled")).toBe("true");
    expect(privateButton.disabled).toBe(false);
    // Nothing else starts meanwhile.
    act(() => view.button("移到回收站")!.click());
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    act(() => view.button("编辑")!.click());
    expect(mocks.entry.openEditor).not.toHaveBeenCalled();

    await act(async () => answer({ workId: WORK, visibility: "self" }));
    expect(view.status()).toBe("可见范围已改为仅自己可见");
    expect(document.activeElement).toBe(privateButton);
    expect(privateButton.hasAttribute("aria-disabled")).toBe(false);
  });

  it("states the answered visibility without claiming a change it did not make", async () => {
    mocks.publishing.setVisibility.mockResolvedValue({
      workId: WORK,
      visibility: "self",
    });
    const view = render(detail({ visibility: "self" }));
    await act(async () => view.button("公开")!.click());
    expect(view.status()).toBe("可见范围：仅自己可见");
    expect(view.button("仅自己可见")?.getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("hands the focus from 重试 to the result once the repeated command is confirmed", async () => {
    mocks.publishing.setVisibility
      .mockRejectedValueOnce(
        new mocks.PublishingRequestError(
          0,
          "网络连接中断，结果尚未确认",
          null,
          true,
        ),
      )
      .mockResolvedValueOnce({ workId: WORK, visibility: "public" });
    const view = render(detail({ visibility: "self" }));
    await act(async () => view.button("公开")!.click());
    const retry = view.button("重试")!;
    retry.focus();
    await act(async () => retry.click());
    const [first, second] = mocks.publishing.setVisibility.mock.calls;
    expect(second?.[1]).toEqual(first?.[1]);
    expect(view.button("重试")).toBeUndefined();
    expect(view.status()).toBe("可见范围已改为公开");
    expect(document.activeElement).toBe(
      view.container.querySelector("[data-work-management-status]"),
    );
  });

  it("lets the Detail replace its content with the result after moving to the recycle bin", async () => {
    mocks.publishing.trashWork.mockResolvedValue({});
    const withdraw = vi.fn();
    const view = render(detail({}), withdraw);
    act(() => view.button("移到回收站")!.click());
    await act(async () =>
      view.container
        .querySelector<HTMLButtonElement>("[data-confirm-trash]")!
        .click(),
    );
    expect(withdraw).toHaveBeenCalledExactlyOnceWith(WORK, {
      title: "作品已移到回收站",
      description: "保留期内可以在回收站中恢复，恢复后为仅自己可见。",
    });
    expect(mocks.author.mutate).toHaveBeenCalledOnce();
  });
});

describe("loadWorkDetail", () => {
  it("maps Live media, the edited marker and the author's visibility", async () => {
    const item = `item-${"d".repeat(32)}`;
    mocks.work.mockResolvedValue({
      id: WORK,
      authorId: AUTHOR,
      authorName: "临帖人",
      title: "",
      text: "正文",
      media: [
        {
          id: item,
          src: `/api/community/publishing/media/${item}/display/base`,
          width: 800,
          height: 600,
          kind: "live",
          motionSrc: `/api/community/publishing/media/${item}/motion/base`,
          hasAudio: true,
        },
      ],
      firstPublishedAt: "2026-09-10T08:00:00.000Z",
      editedAt: "2026-09-12T08:00:00.000Z",
      version: 3,
      canEdit: true,
      available: true,
      visibility: "self",
    } satisfies UserWork);
    const state = await loadWorkDetail(WORK, new AbortController().signal);
    expect(state).toMatchObject({
      state: "loaded",
      detail: {
        contentType: "work",
        title: "",
        firstPublishedAt: "2026-09-10T08:00:00.000Z",
        editedAt: "2026-09-12T08:00:00.000Z",
        visibility: "self",
        media: [
          {
            id: item,
            alt: "未命名作品",
            live: {
              motionSrc: `/api/community/publishing/media/${item}/motion/base`,
              hasAudio: true,
            },
          },
        ],
      },
    });
  });
});
